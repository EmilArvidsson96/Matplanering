/**
 * Background job that finds a Mathem product for each shopping row and saves
 * the suggestion on the row itself (week.shoppingList[].mathem).
 *
 * It lives outside React, so it keeps going while the user moves around the
 * app, and the results are part of the week, so they survive reloads.
 */
import { create } from 'zustand'
import { useWeekStore } from './weekStore'
import { useSettingsStore } from './settingsStore'
import type { MathemSnapshot, MathemSuggestion, ProductPreference, ShoppingItem } from '../types'
import { searchMathem, getMathemProduct, type MathemProduct } from '../api/mathem'
import { matchProductsWithAi } from '../api/anthropic'
import { ingredientKey, searchQuery, isNotAProduct, findPreference, estimatePacks } from '../utils/productMatch'
import { rulesFor, ruleQueries, passesRules, rankCandidates, ruleMiss, type AppliedRules } from '../utils/productRules'
import { lookupByKey } from '../utils/stock'

interface MathemJob {
  running: boolean
  weekId: string | null
  /** Rows still being looked up. */
  pending: Set<string>
  total: number
  error: string | null
  /** Find products for rows without a suggestion (or all rows with refresh). */
  start: (weekId: string, items: ShoppingItem[], opts?: { refresh?: boolean; retry?: boolean }) => void
}

/** Rows tried this session, so the automatic start doesn't retry a failing row in a loop. */
const tried = new Set<string>()

const AI_CHUNK = 15
const SEARCH_CONCURRENCY = 4

export function snapshot(p: MathemProduct): MathemSnapshot {
  return { productId: p.id, name: p.name, packSize: p.packSize, imageUrl: p.imageUrl, price: p.price, onSale: p.onSale }
}

export function packsFor(item: Pick<ShoppingItem, 'amount' | 'unit'>, packSize: string, fallback = 1): number {
  return estimatePacks(item.amount, item.unit, packSize) ?? fallback
}

/** Remember the household's choice for this ingredient. */
export function learnChoice(itemName: string, p: MathemSnapshot, countIt: boolean) {
  const { settings, setProductPreferences } = useSettingsStore.getState()
  const key = ingredientKey(itemName)
  const prev = settings.productPreferences?.[key]
  const same = prev?.productId === p.productId
  const pref: ProductPreference = {
    store: 'mathem',
    productId: p.productId,
    name: p.name,
    packSize: p.packSize,
    chosenAt: new Date().toISOString().slice(0, 10),
    timesChosen: same ? prev.timesChosen + (countIt ? 1 : 0) : 1,
  }
  setProductPreferences({ [key]: pref })
}

async function mapLimit<T>(list: T[], limit: number, fn: (t: T) => Promise<void>) {
  let i = 0
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (i < list.length) await fn(list[i++])
  }))
}

export const useMathemJob = create<MathemJob>((set, get) => ({
  running: false,
  weekId: null,
  pending: new Set(),
  total: 0,
  error: null,

  start: (weekId, allItems, opts) => {
    if (get().running) return
    const items = allItems.filter(i => !i.isPurchased && !i.isExcluded && !i.deletedAt
      && (opts?.refresh || (!i.mathem && (opts?.retry || !tried.has(i.id)))))
    if (items.length === 0) return
    for (const i of items) tried.add(i.id)
    set({ running: true, weekId, pending: new Set(items.map(i => i.id)), total: items.length, error: null })
    run(weekId, items).finally(() => set({ running: false, pending: new Set() }))
  },
}))

/**
 * Per row, cheapest first (see docs/mathem-cart.md):
 * not a product → stock item → earlier choice that follows the rules →
 * rule-aware search + local ranking → AI only for new ingredients.
 */
async function run(weekId: string, items: ShoppingItem[]) {
  const { settings } = useSettingsStore.getState()
  const learned = settings.productPreferences
  const hasAi = !!settings.anthropicApiKey?.trim()
  const matchedAt = new Date().toISOString()

  const save = (patches: Record<string, MathemSuggestion>) => {
    useWeekStore.getState().patchShoppingItems(
      weekId,
      Object.fromEntries(Object.entries(patches).map(([id, mathem]) => [id, { mathem }])),
    )
    useMathemJob.setState(s => {
      const pending = new Set(s.pending)
      for (const id of Object.keys(patches)) pending.delete(id)
      return { pending }
    })
  }
  const skip = (item: ShoppingItem, query: string, note: string) =>
    save({ [item.id]: { product: null, quantity: 0, include: false, query, note, matchedAt } })

  type Entry = { item: ShoppingItem; query: string; candidates: MathemProduct[]; current?: MathemProduct; rules: AppliedRules; fixed?: number }
  const forAi: Entry[] = []

  const pick = (e: Entry, p: MathemProduct, source: MathemSuggestion['source'], extra: Partial<MathemSuggestion> = {}, aiQty?: number): MathemSuggestion => ({
    product: snapshot(p),
    quantity: e.fixed ?? packsFor(e.item, p.packSize, aiQty ?? 1),
    include: true, source, query: e.query, matchedAt, ...extra,
  })

  /** Extrapris swap: on sale, follows the rules, cheaper per kg/l than the choice. */
  const offerFor = (e: Entry, chosen: MathemProduct): Partial<MathemSuggestion> => {
    if (!settings.shoppingRules?.preferOffers || chosen.onSale) return {}
    const alt = e.candidates.slice(0, 8).find(c =>
      c.onSale && c.id !== chosen.id && passesRules(c, e.rules)
      && Number.isFinite(c.unitPriceValue) && Number.isFinite(chosen.unitPriceValue)
      && c.unitPriceValue < chosen.unitPriceValue * 0.95)
    return alt ? { saleAlt: snapshot(alt), saleReason: `Lägre jämförpris: ${alt.unitPrice}` } : {}
  }

  const local = (e: Entry) => {
    const best = e.current && passesRules(e.current, e.rules) ? e.current : rankCandidates(e.candidates, e.rules)[0]
    const source = best.id === e.current?.id ? 'preference' : 'search'
    save({ [e.item.id]: pick(e, best, source, { note: ruleMiss(best, e.rules), ...offerFor(e, best) }) })
  }

  await mapLimit(items, SEARCH_CONCURRENCY, async item => {
    const query = searchQuery(item.name)
    if (isNotAProduct(item.name, item.amount, item.unit)) return skip(item, query, 'Inte en vara')
    try {
      const key = ingredientKey(item.name)
      const avoid = new Set(settings.productAvoid?.[key] ?? [])
      const rules = rulesFor(item.name, item.category, settings.shoppingRules)

      // Stock items: always the big pack, one at a time.
      const stock = lookupByKey(item.name, settings.stockItems)?.[1]
      if (stock?.productId) {
        const p = await getMathemProduct(stock.productId)
        if (p) return save({ [item.id]: { ...pick({ item, query, candidates: [p], rules }, p, 'preference'), quantity: 1, note: 'Förrådsvara' } })
      }

      const pref = findPreference(item.name, learned)
      const fixed = pref?.fixedQuantity
      const current = pref && !avoid.has(Number(pref.productId)) ? (await getMathemProduct(Number(pref.productId))) ?? undefined : undefined

      // A known choice that still follows the rules needs no search at all.
      if (current && passesRules(current, rules) && !settings.shoppingRules?.preferOffers) {
        return save({ [item.id]: pick({ item, query, candidates: [current], rules, fixed }, current, 'preference') })
      }

      const lists = await Promise.all(ruleQueries(query, rules).map(q => searchMathem(q, 10).catch(() => [] as MathemProduct[])))
      const seen = new Set<number>()
      let candidates = lists.flat().filter(c => !avoid.has(c.id) && !seen.has(c.id) && seen.add(c.id))
      if (current && !seen.has(current.id)) candidates = [current, ...candidates]
      if (candidates.length === 0) return skip(item, query, 'Hittades inte på Mathem')

      const entry: Entry = { item, query, candidates, current, rules, fixed }
      if (current && passesRules(current, rules)) return local(entry)
      // New ingredient (or the old choice breaks a rule): AI if available, else local ranking.
      if (hasAi) forAi.push(entry)
      else local(entry)
    } catch (e) {
      useMathemJob.setState({ error: e instanceof Error ? e.message : String(e) })
      useMathemJob.setState(s => { const p = new Set(s.pending); p.delete(item.id); return { pending: p } })
    }
  })

  if (forAi.length === 0) return

  const chunks: Entry[][] = []
  for (let i = 0; i < forAi.length; i += AI_CHUNK) chunks.push(forAi.slice(i, i + AI_CHUNK))
  await Promise.all(chunks.map(async chunk => {
    try {
      const matches = await matchProductsWithAi(chunk.map(({ item, candidates, current, rules }) => ({
        itemId: item.id, name: item.name, amount: item.amount, unit: item.unit,
        current: current?.id,
        candidates: rankCandidates(candidates, rules).slice(0, 8)
          .map(c => ({ id: c.id, name: c.name, packSize: c.packSize, price: c.price, onSale: c.onSale, tags: c.tags })),
      })), useSettingsStore.getState().settings)
      const byId = new Map(matches.map(m => [m.itemId, m]))
      const patches: Record<string, MathemSuggestion> = {}
      for (const entry of chunk) {
        const { item, candidates, current } = entry
        const m = byId.get(item.id)
        if (!m) { local(entry); continue }
        const product = m.productId != null ? candidates.find(c => c.id === m.productId) : undefined
        if (!product) {
          patches[item.id] = { ...pick(entry, current ?? candidates[0], 'ai', {}, 1), include: false, note: m.reason || 'AI föreslår att hoppa över' }
          continue
        }
        const kept = current?.id === product.id
        const alt = m.saleAlternativeId != null ? candidates.find(c => c.id === m.saleAlternativeId) : undefined
        patches[item.id] = pick(entry, product, kept ? 'preference' : 'ai', {
          note: kept ? undefined : current ? `Bytt från ${current.name}: ${m.reason ?? 'följer reglerna'}` : m.reason,
          ...(alt ? { saleAlt: snapshot(alt), saleReason: m.reason } : offerFor(entry, product)),
        }, m.quantity)
      }
      save(patches)
    } catch (e) {
      useMathemJob.setState({ error: `AI-matchningen misslyckades (${e instanceof Error ? e.message : String(e)}). Valde lokalt efter reglerna i stället.` })
      chunk.forEach(local)
    }
  }))
}
