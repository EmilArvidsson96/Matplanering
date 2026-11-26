/**
 * Förrådsvaror (stock items) and the "Har du redan hemma?" guesses.
 * See docs/mathem-cart.md for the model.
 */
import { parseISO, getISOWeek } from 'date-fns'
import type { AppSettings, ShoppingItem, StockItem, WeekPlan } from '../types'
import { ingredientKey, packOverNeed, parsePack, toBase } from './productMatch'
import { prevWeekId } from './weekUtils'
import { subFor } from '../data/categories'

/** The entry in a keyed map whose key matches this ingredient (exact, else longest contained key). */
export function lookupByKey<T>(name: string, map: Record<string, T> | undefined): [string, T] | null {
  if (!map) return null
  const key = ingredientKey(name)
  if (map[key]) return [key, map[key]]
  const contained = Object.keys(map)
    .filter(k => k.length >= 3 && new RegExp(`(^|\\s)${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`).test(key))
    .sort((a, b) => b.length - a.length)[0]
  return contained ? [contained, map[contained]] : null
}

export type StockState = 'ok' | 'low' | 'out'

/** Estimated fraction left (null when we can't tell) and the resulting state. */
export function stockLevel(item: StockItem): { fraction: number | null; state: StockState } {
  if (item.manual === 'out') return { fraction: 0, state: 'out' }
  let used = 0
  let known = true
  for (const [weekId, f] of Object.entries(item.usage ?? {})) {
    if (weekId >= item.baseline.weekId) {
      if (typeof f === 'number' && Number.isFinite(f) && f >= 0) used += f
      else known = false   // -1: this week's use couldn't be measured
    }
  }
  const fraction = known ? Math.max(0, item.baseline.fraction - used) : null
  if (item.manual === 'low') return { fraction, state: 'low' }
  if (!item.neverAsk && fraction != null && fraction < 0.25) return { fraction, state: 'low' }
  return { fraction, state: 'ok' }
}

/** Share of a stock pack this row uses (NaN when the units can't be compared). */
export function usageFraction(row: Pick<ShoppingItem, 'amount' | 'unit'>, stock: StockItem): number {
  if (!stock.packSize) return NaN
  const ratio = packOverNeed(row.amount, row.unit, stock.packSize)
  return ratio ? 1 / ratio : NaN
}

/** A new stock item, counted as a fresh pack from this week. */
export function newStockItem(name: string, weekId: string, init: Partial<StockItem> = {}): StockItem {
  return { name, baseline: { weekId, fraction: 1 }, usage: {}, ...init }
}

export function levelLabel(item: StockItem): string {
  const { fraction, state } = stockLevel(item)
  if (state === 'out') return 'slut'
  if (fraction == null) return state === 'low' ? 'snart slut?' : 'finns'
  if (state === 'low') return 'snart slut'
  return `ca ${Math.round(fraction * 10) * 10} %`
}

// ── "Har du redan hemma?" ──────────────────────────────────────────────────

// Matched at the end of a word, so compounds count too (olivolja, vetemjöl, sojasås).
const LONG_LIFE = /(salt|peppar|olja|vinäger|ättika|ättiksprit|socker|mjöl|buljong|fond|soja|sås|senap|honung|sirap|kanel|kardemumma|spiskummin|paprikapulver|chili|curry|oregano|timjan|basilika, torkad|lagerblad|muskot|ingefära, mald|bakpulver|bikarbonat|vaniljsocker|jäst|ris|pasta|nudlar|gryn|flingor|tomatpuré|konserverad|krossade tomater)(\s|$)/

export interface HomeGuess {
  item: ShoppingItem
  score: number
  reason: string
  stockKey?: string
}

/** Rows the household probably has at home, most likely first. */
export function guessAtHome(
  items: ShoppingItem[],
  settings: AppSettings,
  weeks: Record<string, WeekPlan>,
  weekId: string,
): HomeGuess[] {
  const earlier = [prevWeekId(weekId), prevWeekId(prevWeekId(weekId)), prevWeekId(prevWeekId(prevWeekId(weekId)))]
    .map(id => weeks[id])
    .filter((w): w is WeekPlan => !!w)

  const guesses: HomeGuess[] = []
  for (const item of items) {
    if (item.isPurchased || item.isExcluded || item.deletedAt || item.homeAnswer) continue
    const options: Array<Omit<HomeGuess, 'item'>> = []

    const stock = lookupByKey(item.name, settings.stockItems)
    if (stock) {
      const { state } = stockLevel(stock[1])
      if (state === 'out') continue
      options.push(state === 'ok'
        ? { score: 0.95, reason: `Förrådsvara, ${levelLabel(stock[1])} kvar`, stockKey: stock[0] }
        : { score: 0.7, reason: 'Förrådsvara, snart slut. Har du kvar?', stockKey: stock[0] })
    }

    const stats = settings.homeStats?.[ingredientKey(item.name)]
    if (stats && stats.home >= 2 && stats.home / (stats.home + stats.buy) >= 0.6) {
      options.push({ score: 0.85, reason: `Hemma ${stats.home} av ${stats.home + stats.buy} gånger` })
    }

    const key = ingredientKey(item.name)
    for (const w of earlier) {
      const prev = w.shoppingList.find(p => p.isPurchased && !p.deletedAt && ingredientKey(p.name) === key && p.mathem?.product)
      if (!prev) continue
      const pack = prev.mathem!.product!.packSize
      const over = packOverNeed(prev.amount, prev.unit, pack)
      if (over != null && over >= 2) {
        options.push({ score: 0.6, reason: `Köpt v.${getISOWeek(parseISO(w.id))} (${pack.replace(/^.*,\s*/, '')})` })
        break
      }
    }

    if (/krydd/i.test(subFor(item.name))) options.push({ score: 0.5, reason: 'Krydda' })
    else if (LONG_LIFE.test(key)) options.push({ score: 0.5, reason: 'Skafferivara' })

    const best = options.sort((a, b) => b.score - a.score)[0]
    if (best) guesses.push({ item, ...best })
  }
  return guesses.sort((a, b) => b.score - a.score)
}

/** True when a row's chosen pack is so much bigger than the need that it looks like a stock item. */
export function looksLikeStock(item: ShoppingItem, settings: AppSettings): boolean {
  const p = item.mathem?.product
  if (!p || !item.mathem?.include) return false
  const key = ingredientKey(item.name)
  if (lookupByKey(item.name, settings.stockItems) || settings.stockDeclined?.includes(key)) return false
  if (!toBase(item.amount, item.unit) || !parsePack(p.packSize)) return false
  const over = packOverNeed(item.amount, item.unit, p.packSize)
  return over != null && over >= 5
}
