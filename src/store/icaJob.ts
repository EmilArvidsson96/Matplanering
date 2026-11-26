/**
 * Background job that finds an ICA Handla product for each shopping row and
 * saves the suggestion on the row (week.shoppingList[].ica), like the Mathem
 * job does for Mathem. Together they let the shopping page compare stores.
 *
 * Prices come from the slow background fetch in icaPrefetch (ICA's firewall
 * wants few calls), so rows are matched as their search answers arrive.
 * Matching itself makes no calls to ICA: it reads the cached answers.
 */
import { create } from 'zustand'
import { useWeekStore } from './weekStore'
import { useSettingsStore } from './settingsStore'
import { useIcaPrefetch } from './icaPrefetch'
import type { IcaSnapshot, IcaSuggestion, ProductPreference, ShoppingItem } from '../types'
import { cachedIca } from '../api/ica'
import { fromIca, type StoreProduct } from '../api/shops'
import { matchProductsWithAi } from '../api/anthropic'
import { ingredientKey, searchQuery, isNotAProduct, findPreference } from '../utils/productMatch'
import { rulesFor, passesRules, rankCandidates, ruleMiss, type AppliedRules } from '../utils/productRules'
import { lookupByKey } from '../utils/stock'
import { packsFor } from './mathemStore'

interface IcaJob {
  running: boolean
  weekId: string | null
  store: string | null
  /** Rows still waiting for a product. */
  pending: Set<string>
  total: number
  error: string | null
  /** Find products for rows without an ICA suggestion for this store (or all rows with refresh). */
  start: (weekId: string, store: string, items: ShoppingItem[], opts?: { refresh?: boolean; retry?: boolean }) => void
}

const AI_CHUNK = 15
/** Rows tried this session, so a row ICA has no answer for isn't retried in a loop. */
const tried = new Set<string>()

export function icaSnapshot(p: StoreProduct): IcaSnapshot {
  return { productId: p.id, name: p.name, packSize: p.packSize, imageUrl: p.imageUrl, price: p.price, onSale: p.onSale, offer: p.offer, url: p.url }
}

/** Rows that need an ICA suggestion for this store. */
export function needsIca(i: ShoppingItem, store: string): boolean {
  return !i.isPurchased && !i.isExcluded && !i.deletedAt && (!i.ica || i.ica.store !== store)
}

/** Remember the household's ICA choice for this ingredient. */
export function learnIcaChoice(itemName: string, p: IcaSnapshot, countIt: boolean) {
  const { settings, setProductPreferences } = useSettingsStore.getState()
  const key = ingredientKey(itemName)
  const prev = settings.icaProductPreferences?.[key]
  const same = prev?.productId === p.productId
  const pref: ProductPreference = {
    store: 'ica',
    productId: p.productId,
    name: p.name,
    packSize: p.packSize,
    chosenAt: new Date().toISOString().slice(0, 10),
    timesChosen: same ? prev.timesChosen + (countIt ? 1 : 0) : 1,
  }
  setProductPreferences({ [key]: pref }, 'ica')
}

/** Cached ICA products for a query, in this store's shape. */
export function icaCandidates(store: string, query: string): StoreProduct[] | undefined {
  return cachedIca(store, query)?.filter(p => p.available).map(p => fromIca(store, p))
}

export const useIcaJob = create<IcaJob>((set, get) => ({
  running: false,
  weekId: null,
  store: null,
  pending: new Set(),
  total: 0,
  error: null,

  start: (weekId, store, allItems, opts) => {
    if (get().running) return
    const items = allItems.filter(i => opts?.refresh
      ? !i.isPurchased && !i.isExcluded && !i.deletedAt
      : needsIca(i, store) && (opts?.retry || !tried.has(`${store}|${i.id}`)))
    if (items.length === 0) return
    for (const i of items) tried.add(`${store}|${i.id}`)
    set({ running: true, weekId, store, pending: new Set(items.map(i => i.id)), total: items.length, error: null })
    run(weekId, store, items).finally(() => set({ running: false, pending: new Set() }))
  },
}))

/** Resolves on the next change in the background ICA fetch. */
function nextPrefetchChange(): Promise<void> {
  return new Promise(resolve => {
    const unsub = useIcaPrefetch.subscribe(() => { unsub(); resolve() })
  })
}

/**
 * Per row, cheapest first: not a product → earlier ICA choice that follows
 * the rules → AI for new ingredients (if there is a key) → best hit by the rules.
 */
async function run(weekId: string, store: string, items: ShoppingItem[]) {
  const { settings } = useSettingsStore.getState()
  const hasAi = !!settings.anthropicApiKey?.trim()
  const matchedAt = new Date().toISOString()

  const save = (patches: Record<string, IcaSuggestion>) => {
    useWeekStore.getState().patchShoppingItems(
      weekId,
      Object.fromEntries(Object.entries(patches).map(([id, ica]) => [id, { ica }])),
    )
    useIcaJob.setState(s => {
      const pending = new Set(s.pending)
      for (const id of Object.keys(patches)) pending.delete(id)
      return { pending }
    })
  }
  const skip = (item: ShoppingItem, query: string, note: string) =>
    save({ [item.id]: { product: null, quantity: 0, include: false, query, note, matchedAt, store } })

  type Entry = { item: ShoppingItem; query: string; candidates: StoreProduct[]; current?: StoreProduct; rules: AppliedRules; fixed?: number; stock: boolean }
  const qty = (e: Entry, p: StoreProduct, fallback = 1) => e.stock ? 1 : e.fixed ?? packsFor(e.item, p.packSize, fallback)
  const pick = (e: Entry, p: StoreProduct, source: IcaSuggestion['source'], extra: Partial<IcaSuggestion> = {}, aiQty?: number): IcaSuggestion => ({
    product: icaSnapshot(p), quantity: qty(e, p, aiQty ?? 1), include: true, source, query: e.query, matchedAt, store,
    ...(e.stock ? { note: 'Förrådsvara' } : {}), ...extra,
  })
  const local = (e: Entry) => {
    const best = e.current && passesRules(e.current, e.rules) ? e.current : rankCandidates(e.candidates, e.rules)[0]
    save({ [e.item.id]: pick(e, best, best.id === e.current?.id ? 'preference' : 'search', e.stock ? {} : { note: ruleMiss(best, e.rules) }) })
  }

  const forAi: Entry[] = []
  const flushAi = async () => {
    const batch = forAi.splice(0)
    for (let i = 0; i < batch.length; i += AI_CHUNK) {
      const chunk = batch.slice(i, i + AI_CHUNK)
      try {
        // The AI sees each row's candidates numbered 1…n; map its answer back to product ids.
        const top = new Map(chunk.map(e => [e.item.id, rankCandidates(e.candidates, e.rules).slice(0, 8)]))
        const matches = await matchProductsWithAi(chunk.map(e => {
          const list = top.get(e.item.id)!
          const cur = e.current ? list.findIndex(c => c.id === e.current!.id) + 1 : 0
          return {
            itemId: e.item.id, name: e.item.name, amount: e.item.amount, unit: e.item.unit,
            current: cur || undefined,
            candidates: list.map((c, n) => ({ id: n + 1, name: c.name, packSize: c.packSize, price: c.price, onSale: c.onSale, offer: c.offer, tags: c.tags })),
          }
        }), useSettingsStore.getState().settings)
        const byId = new Map(matches.map(m => [m.itemId, m]))
        const patches: Record<string, IcaSuggestion> = {}
        for (const e of chunk) {
          const m = byId.get(e.item.id)
          if (!m) { local(e); continue }
          const list = top.get(e.item.id)!
          const product = m.productId != null ? list[m.productId - 1] : undefined
          if (!product) {
            patches[e.item.id] = { ...pick(e, e.current ?? list[0], 'ai', {}, 1), include: false, note: m.reason || 'AI föreslår att hoppa över' }
            continue
          }
          const kept = e.current?.id === product.id
          patches[e.item.id] = pick(e, product, kept ? 'preference' : 'ai', {
            note: kept ? undefined : e.current ? `Bytt från ${e.current.name}: ${m.reason ?? 'följer reglerna'}` : m.reason,
          }, m.quantity)
        }
        save(patches)
      } catch (err) {
        useIcaJob.setState({ error: `AI-matchningen för ICA misslyckades (${err instanceof Error ? err.message : String(err)}). Valde efter reglerna i stället.` })
        chunk.forEach(local)
      }
    }
  }

  const resolve = (item: ShoppingItem, query: string, candidates: StoreProduct[]) => {
    if (candidates.length === 0) return skip(item, query, 'Finns inte hos ICA')
    const s = useSettingsStore.getState().settings
    const rules = rulesFor(item.name, item.category, s.shoppingRules)
    const pref = findPreference(item.name, s.icaProductPreferences, false)
    const current = pref ? candidates.find(c => c.id === String(pref.productId)) ?? candidates.find(c => c.name === pref.name) : undefined
    const entry: Entry = {
      item, query, candidates, current, rules,
      fixed: findPreference(item.name, s.productPreferences)?.fixedQuantity,
      stock: !!lookupByKey(item.name, s.stockItems)?.[1],
    }
    if (current && passesRules(current, rules)) return local(entry)
    if (hasAi) forAi.push(entry)
    else local(entry)
  }

  // Not-a-product rows first, then the rest as ICA's answers arrive.
  let waiting = items.filter(item => {
    const query = searchQuery(item.name)
    if (isNotAProduct(item.name, item.amount, item.unit)) { skip(item, query, 'Inte en vara'); return false }
    return true
  })
  useIcaPrefetch.getState().want(store, waiting.map(i => searchQuery(i.name)))

  while (waiting.length) {
    const ready = waiting.filter(i => icaCandidates(store, searchQuery(i.name)))
    waiting = waiting.filter(i => !ready.includes(i))
    for (const item of ready) {
      const query = searchQuery(item.name)
      resolve(item, query, icaCandidates(store, query)!)
    }
    if (forAi.length && (forAi.length >= AI_CHUNK || !waiting.length)) await flushAi()
    if (!waiting.length) break
    if (useIcaJob.getState().store !== store) return
    const p = useIcaPrefetch.getState()
    if (p.store !== store || (!p.running && p.queue.length === 0)) {
      // The background fetch isn't working on these (another store, or it stopped): ask again.
      p.want(store, waiting.map(i => searchQuery(i.name)))
      if (!useIcaPrefetch.getState().running) break
    }
    await nextPrefetchChange()
  }
  if (forAi.length) await flushAi()
  // Rows ICA never answered keep no suggestion; the page offers to try again.
}
