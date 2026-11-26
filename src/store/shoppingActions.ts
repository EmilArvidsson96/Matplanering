/**
 * User actions on the shopping list that touch both the week and the
 * settings (learning). Each one is a single undo step and most show a
 * toast with "Ångra".
 */
import type { ShoppingItem, StockItem } from '../types'
import { useWeekStore } from './weekStore'
import { useSettingsStore } from './settingsStore'
import { batch, notify } from './undoStore'
import { cachedProduct } from '../api/mathem'
import { ingredientKey } from '../utils/productMatch'
import { lookupByKey, newStockItem, stockLevel } from '../utils/stock'
import { categoryFor } from '../data/categories'

const now = () => new Date().toISOString()
const week = () => useWeekStore.getState()
const settings = () => useSettingsStore.getState().settings
const updateSettings = (patch: Parameters<ReturnType<typeof useSettingsStore.getState>['update']>[0]) =>
  useSettingsStore.getState().update(patch)

function countAnswer(name: string, field: 'home' | 'buy') {
  const key = ingredientKey(name)
  const stats = { ...(settings().homeStats ?? {}) }
  const prev = stats[key] ?? { home: 0, buy: 0 }
  stats[key] = { ...prev, [field]: prev[field] + 1 }
  updateSettings({ homeStats: stats })
}

function setStock(key: string, item: StockItem | null) {
  const next = { ...(settings().stockItems ?? {}) }
  if (item) next[key] = item
  else delete next[key]
  updateSettings({ stockItems: next })
}

/** "Har hemma": hide the row this week (it shows under Borttagna). */
export function markAtHome(item: ShoppingItem, opts: { silent?: boolean; fromQuestion?: boolean } = {}) {
  batch(() => {
    const stock = lookupByKey(item.name, settings().stockItems)
    week().updateShoppingItem(item.id, {
      isExcluded: true, excludedReason: stock ? 'stock' : 'home', excludedAt: now(), homeAnswer: undefined,
    })
    if (opts.fromQuestion) countAnswer(item.name, 'home')
    // Low stock but still some left: assume about half a pack.
    if (stock && stockLevel(stock[1]).state === 'low') {
      setStock(stock[0], { ...stock[1], manual: undefined, baseline: { weekId: week().activeWeekId, fraction: 0.5 } })
    }
  })
  if (!opts.silent) notify(`${item.name}: har hemma`)
}

/** "Köp" in "Har du redan hemma?": keep it on the list. Stock items count as a new pack. */
export function answerBuy(item: ShoppingItem, opts: { silent?: boolean } = {}) {
  batch(() => {
    const patch: Partial<ShoppingItem> = { homeAnswer: 'buy' }
    const stock = lookupByKey(item.name, settings().stockItems)
    if (stock) {
      const s = stock[1]
      setStock(stock[0], { ...s, manual: undefined, baseline: { weekId: week().activeWeekId, fraction: 1 } })
      if (s.productId) {
        const p = cachedProduct(s.productId)
        patch.mathem = {
          product: {
            productId: s.productId, name: s.productName ?? s.name, packSize: s.packSize ?? '',
            imageUrl: s.imageUrl ?? p?.imageUrl, price: p?.price ?? NaN, onSale: p?.onSale ?? false,
          },
          quantity: 1, include: true, source: 'preference', query: item.mathem?.query ?? item.name,
          note: 'Förrådsvara', matchedAt: now(),
        }
      }
      if (item.ica?.product) patch.ica = { ...item.ica, quantity: 1, include: true, note: 'Förrådsvara' }
      if (item.willys?.product) patch.willys = { ...item.willys, quantity: 1, include: true, note: 'Förrådsvara' }
    }
    week().updateShoppingItem(item.id, patch)
    countAnswer(item.name, 'buy')
  })
  if (!opts.silent) notify(`${item.name}: köps`)
}

export function answerAll(items: ShoppingItem[], answer: 'home' | 'buy') {
  batch(() => items.forEach(i => answer === 'home' ? markAtHome(i, { silent: true, fromQuestion: true }) : answerBuy(i, { silent: true })))
  notify(`${items.length} varor: ${answer === 'home' ? 'har hemma' : 'köps'}`)
}

export function removeItem(item: ShoppingItem) {
  week().deleteShoppingItem(item.id)
  notify(`${item.name}: borttagen`)
}

export function restoreItem(item: ShoppingItem) {
  week().restoreShoppingItem(item.id)
  notify(`${item.name}: tillbaka på listan`)
}

export type BuyMode = 'recipe' | 'stock' | 'pantry'

export function buyModeOf(item: ShoppingItem): BuyMode {
  const s = settings()
  if (lookupByKey(item.name, s.stockItems)) return 'stock'
  if (s.pantryItems.some(p => p.toLowerCase() === item.name.toLowerCase())) return 'pantry'
  return 'recipe'
}

/** Efter recept / Förråd / Alltid hemma, from the row editor. */
export function setBuyMode(item: ShoppingItem, mode: BuyMode) {
  batch(() => {
    const key = ingredientKey(item.name)
    const stock = lookupByKey(item.name, settings().stockItems)
    const lower = item.name.toLowerCase()
    if (mode !== 'stock' && stock) setStock(stock[0], null)
    if (mode !== 'pantry' && settings().pantryItems.some(p => p.toLowerCase() === lower)) {
      useSettingsStore.getState().removePantryItem(settings().pantryItems.find(p => p.toLowerCase() === lower)!)
    }
    if (mode === 'stock' && !stock) {
      const p = item.mathem?.product
      setStock(key, newStockItem(item.name, week().activeWeekId, {
        category: item.category,
        productId: p?.productId, productName: p?.name, packSize: p?.packSize, imageUrl: p?.imageUrl,
      }))
      updateSettings({ stockDeclined: (settings().stockDeclined ?? []).filter(k => k !== key) })
      week().updateShoppingItem(item.id, {
        ...(item.mathem?.product ? { mathem: { ...item.mathem, quantity: 1, note: 'Förrådsvara' } } : {}),
        ...(item.ica?.product ? { ica: { ...item.ica, quantity: 1, note: 'Förrådsvara' } } : {}),
        ...(item.willys?.product ? { willys: { ...item.willys, quantity: 1, note: 'Förrådsvara' } } : {}),
      })
    }
    if (mode === 'pantry') {
      useSettingsStore.getState().addPantryItem(lower)
      week().updateShoppingItem(item.id, { isExcluded: true, excludedReason: 'pantry', excludedAt: now() })
    }
  })
  notify(mode === 'stock' ? `${item.name}: förrådsvara` : mode === 'pantry' ? `${item.name}: alltid hemma` : `${item.name}: köps efter recept`)
}

export function declineStock(item: ShoppingItem) {
  const key = ingredientKey(item.name)
  updateSettings({ stockDeclined: [...new Set([...(settings().stockDeclined ?? []), key])] })
}

/** "Inte denna produkt igen". */
export function avoidProduct(item: ShoppingItem, productId: number) {
  const key = ingredientKey(item.name)
  const avoid = { ...(settings().productAvoid ?? {}) }
  avoid[key] = [...new Set([...(avoid[key] ?? []), productId])]
  batch(() => {
    updateSettings({ productAvoid: avoid })
    const prefs = settings().productPreferences
    if (prefs?.[key]?.productId === productId) useSettingsStore.getState().setProductPreferences({ [key]: null })
  })
}

/** "Köp alltid N st" (undefined clears it). */
export function setFixedQuantity(item: ShoppingItem, qty: number | undefined) {
  const key = ingredientKey(item.name)
  const prefs = settings().productPreferences ?? {}
  const p = item.mathem?.product
  const prev = prefs[key]
  if (!prev && !p) return
  useSettingsStore.getState().setProductPreferences({
    [key]: {
      ...(prev ?? {
        store: 'mathem', productId: p!.productId, name: p!.name, packSize: p!.packSize,
        chosenAt: now().slice(0, 10), timesChosen: 1,
      }),
      fixedQuantity: qty,
    },
  })
}

// ── Förråd page ────────────────────────────────────────────────────────────

/** "Slut": mark it out and put it on this week's list. */
export function stockOut(key: string) {
  const s = settings().stockItems?.[key]
  if (!s) return
  batch(() => {
    setStock(key, { ...s, manual: 'out' })
    const w = week()
    const list = w.weeks[w.activeWeekId]?.shoppingList ?? []
    const existing = list.find(i => !i.deletedAt && ingredientKey(i.name) === key)
    if (existing) {
      w.updateShoppingItem(existing.id, { isExcluded: false, excludedReason: undefined, isPurchased: false, homeAnswer: 'buy' })
    } else {
      w.addShoppingItem({
        name: s.name, amount: '', unit: '', category: categoryFor(s.name, s.category), isAutoAdded: false,
        dishIds: [], isPurchased: false, isExcluded: false, homeAnswer: 'buy',
      })
    }
  })
  notify(`${s.name}: slut, på listan`)
}

export function stockRefill(key: string) {
  const s = settings().stockItems?.[key]
  if (!s) return
  setStock(key, { ...s, manual: undefined, baseline: { weekId: week().activeWeekId, fraction: 1 } })
  notify(`${s.name}: full igen`)
}

export function stockLow(key: string) {
  const s = settings().stockItems?.[key]
  if (s) setStock(key, { ...s, manual: 'low' })
}

export function removeStock(key: string) {
  const s = settings().stockItems?.[key]
  setStock(key, null)
  if (s) notify(`${s.name}: inte längre förrådsvara`)
}

export function addStock(name: string) {
  const n = name.trim()
  if (!n) return
  setStock(ingredientKey(n), newStockItem(n, week().activeWeekId))
}

/** Record this week's planned use of each stock item (idempotent per week). */
export function recordStockUsage(weekId: string, items: ShoppingItem[], usageFor: (row: ShoppingItem, s: StockItem) => number) {
  const stocks = settings().stockItems
  if (!stocks) return
  const totals: Record<string, number> = {}
  for (const row of items) {
    const hit = lookupByKey(row.name, stocks)
    if (!hit) continue
    const f = usageFor(row, hit[1])
    const prev = totals[hit[0]] ?? 0
    totals[hit[0]] = prev < 0 || !Number.isFinite(f) ? -1 : prev + f
  }
  const next = { ...stocks }
  let changed = false
  for (const [key, s] of Object.entries(stocks)) {
    const used = totals[key] ?? 0
    if ((s.usage?.[weekId] ?? 0) === used) continue
    next[key] = { ...s, usage: { ...s.usage, [weekId]: used } }
    changed = true
  }
  if (changed) updateSettings({ stockItems: next })
}
