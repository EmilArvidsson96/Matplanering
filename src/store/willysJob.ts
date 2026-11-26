/**
 * Background job that finds a Willys product for each shopping row and saves
 * the suggestion on the row (week.shoppingList[].willys), like the Mathem and
 * ICA jobs. Willys search is quick and public, so this works like Mathem:
 * a few searches at a time, then rules, earlier choices and AI pick a product.
 */
import { create } from 'zustand'
import { useWeekStore } from './weekStore'
import { useSettingsStore } from './settingsStore'
import type { ProductPreference, ShoppingItem, WillysSnapshot, WillysSuggestion } from '../types'
import { searchWillys } from '../api/willys'
import type { StoreProduct } from '../api/shops'
import { matchProductsWithAi } from '../api/anthropic'
import { ingredientKey, searchQuery, isNotAProduct, findPreference } from '../utils/productMatch'
import { rulesFor, ruleQueries, passesRules, rankCandidates, ruleMiss, type AppliedRules } from '../utils/productRules'
import { lookupByKey } from '../utils/stock'
import { packsFor } from './mathemStore'

interface WillysJob {
  running: boolean
  weekId: string | null
  /** Rows still being looked up. */
  pending: Set<string>
  total: number
  error: string | null
  /** Find products for rows without a Willys suggestion (or all rows with refresh). */
  start: (weekId: string, items: ShoppingItem[], opts?: { refresh?: boolean; retry?: boolean }) => void
}

const AI_CHUNK = 15
const SEARCH_CONCURRENCY = 3
/** Rows tried this session, so the automatic start doesn't retry a failing row in a loop. */
const tried = new Set<string>()

export function willysSnapshot(p: StoreProduct): WillysSnapshot {
  return { productId: p.id, name: p.name, packSize: p.packSize, imageUrl: p.imageUrl, price: p.price, onSale: p.onSale, offer: p.offer, url: p.url }
}

/** Rows that need a Willys suggestion. */
export function needsWillys(i: ShoppingItem): boolean {
  return !i.isPurchased && !i.isExcluded && !i.deletedAt && !i.willys
}

/** Remember the household's Willys choice for this ingredient. */
export function learnWillysChoice(itemName: string, p: WillysSnapshot, countIt: boolean) {
  const { settings, setProductPreferences } = useSettingsStore.getState()
  const key = ingredientKey(itemName)
  const prev = settings.willysProductPreferences?.[key]
  const same = prev?.productId === p.productId
  const pref: ProductPreference = {
    store: 'willys',
    productId: p.productId,
    name: p.name,
    packSize: p.packSize,
    chosenAt: new Date().toISOString().slice(0, 10),
    timesChosen: same ? prev.timesChosen + (countIt ? 1 : 0) : 1,
  }
  setProductPreferences({ [key]: pref }, 'willys')
}

async function mapLimit<T>(list: T[], limit: number, fn: (t: T) => Promise<void>) {
  let i = 0
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (i < list.length) await fn(list[i++])
  }))
}

export const useWillysJob = create<WillysJob>((set, get) => ({
  running: false,
  weekId: null,
  pending: new Set(),
  total: 0,
  error: null,

  start: (weekId, allItems, opts) => {
    if (get().running) return
    const items = allItems.filter(i => opts?.refresh
      ? !i.isPurchased && !i.isExcluded && !i.deletedAt
      : needsWillys(i) && (opts?.retry || !tried.has(i.id)))
    if (items.length === 0) return
    for (const i of items) tried.add(i.id)
    set({ running: true, weekId, pending: new Set(items.map(i => i.id)), total: items.length, error: null })
    run(weekId, items).finally(() => set({ running: false, pending: new Set() }))
  },
}))

/**
 * Per row, cheapest first: not a product → search (with rule words) →
 * earlier Willys choice that follows the rules → AI for new ingredients
 * (if there is a key) → best hit by the rules.
 */
async function run(weekId: string, items: ShoppingItem[]) {
  const { settings } = useSettingsStore.getState()
  const hasAi = !!settings.anthropicApiKey?.trim()
  const matchedAt = new Date().toISOString()

  const save = (patches: Record<string, WillysSuggestion>) => {
    useWeekStore.getState().patchShoppingItems(
      weekId,
      Object.fromEntries(Object.entries(patches).map(([id, willys]) => [id, { willys }])),
    )
    useWillysJob.setState(s => {
      const pending = new Set(s.pending)
      for (const id of Object.keys(patches)) pending.delete(id)
      return { pending }
    })
  }
  const skip = (item: ShoppingItem, query: string, note: string) =>
    save({ [item.id]: { product: null, quantity: 0, include: false, query, note, matchedAt } })

  type Entry = { item: ShoppingItem; query: string; candidates: StoreProduct[]; current?: StoreProduct; rules: AppliedRules; fixed?: number; stock: boolean }
  const qty = (e: Entry, p: StoreProduct, fallback = 1) => e.stock ? 1 : e.fixed ?? packsFor(e.item, p.packSize, fallback)
  const pick = (e: Entry, p: StoreProduct, source: WillysSuggestion['source'], extra: Partial<WillysSuggestion> = {}, aiQty?: number): WillysSuggestion => ({
    product: willysSnapshot(p), quantity: qty(e, p, aiQty ?? 1), include: true, source, query: e.query, matchedAt,
    ...(e.stock ? { note: 'Förrådsvara' } : {}), ...extra,
  })
  const local = (e: Entry) => {
    const best = e.current && passesRules(e.current, e.rules) ? e.current : rankCandidates(e.candidates, e.rules)[0]
    save({ [e.item.id]: pick(e, best, best.id === e.current?.id ? 'preference' : 'search', e.stock ? {} : { note: ruleMiss(best, e.rules) }) })
  }

  const forAi: Entry[] = []
  await mapLimit(items, SEARCH_CONCURRENCY, async item => {
    const query = searchQuery(item.name)
    if (isNotAProduct(item.name, item.amount, item.unit)) return skip(item, query, 'Inte en vara')
    try {
      const s = useSettingsStore.getState().settings
      const rules = rulesFor(item.name, item.category, s.shoppingRules)
      const lists = await Promise.all(ruleQueries(query, rules).map(q => searchWillys(q, 12)))
      const seen = new Set<string>()
      const candidates = lists.flat().filter(c => !seen.has(c.id) && !!seen.add(c.id))
      if (candidates.length === 0) return skip(item, query, 'Finns inte hos Willys')
      const pref = findPreference(item.name, s.willysProductPreferences, false)
      const current = pref ? candidates.find(c => c.id === String(pref.productId)) ?? candidates.find(c => c.name === pref.name) : undefined
      const entry: Entry = {
        item, query, candidates, current, rules,
        fixed: findPreference(item.name, s.productPreferences)?.fixedQuantity,
        stock: !!lookupByKey(item.name, s.stockItems)?.[1],
      }
      if (current && passesRules(current, rules)) return local(entry)
      if (hasAi) forAi.push(entry)
      else local(entry)
    } catch (e) {
      useWillysJob.setState(st => {
        const pending = new Set(st.pending)
        pending.delete(item.id)
        return { pending, error: e instanceof Error ? e.message : String(e) }
      })
    }
  })

  for (let i = 0; i < forAi.length; i += AI_CHUNK) {
    const chunk = forAi.slice(i, i + AI_CHUNK)
    try {
      // The AI sees each row's candidates numbered 1…n; map its answer back to products.
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
      const patches: Record<string, WillysSuggestion> = {}
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
      useWillysJob.setState({ error: `AI-matchningen för Willys misslyckades (${err instanceof Error ? err.message : String(err)}). Valde efter reglerna i stället.` })
      chunk.forEach(local)
    }
  }
}
