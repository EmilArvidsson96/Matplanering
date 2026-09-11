import { useState, useMemo } from 'react'
import type { ReactNode } from 'react'
import { v4 as uuid } from 'uuid'
import {
  RefreshCw, Sparkles, CheckCheck, Share2, Copy, Check,
  ChevronDown, ChevronUp, Home, X, Undo2, ShoppingBasket,
} from 'lucide-react'
import { useWeekStore, activeWeek } from '../../store/weekStore'
import { useLibraryStore } from '../../store/libraryStore'
import { useSettingsStore } from '../../store/settingsStore'
import type { ShoppingItem, ShoppingCategory } from '../../types'
import { mergeExactDuplicates, computeMergeSuggestions, computeMergedAmount } from '../../utils/ingredientMerge'
import type { MergeSuggestion } from '../../utils/ingredientMerge'
import { ingredientImpact, formatSEK } from '../../utils/ingredientImpact'
import { cleanupShoppingList } from '../../api/anthropic'
import type { AiCleanupResult } from '../../api/anthropic'

const CATEGORY_LABELS: Record<ShoppingCategory, string> = {
  grönsaker: 'Grönsaker & örter', frukt: 'Frukt', mejeri: 'Mejeri & ägg',
  kött: 'Kött & chark', fisk: 'Fisk & skaldjur', bröd: 'Bröd & bakverk',
  torrvaror: 'Torrvaror', konserver: 'Konserver', frys: 'Frys',
  kryddor: 'Kryddor & smaksättare', övrigt: 'Övrigt',
}
const CATEGORY_ORDER: ShoppingCategory[] = [
  'grönsaker','frukt','mejeri','kött','fisk','bröd','torrvaror','konserver','frys','kryddor','övrigt',
]

export default function ShoppingPage() {
  const store         = useWeekStore()
  const week          = activeWeek(store)
  const { dishes }    = useLibraryStore()
  const { settings }  = useSettingsStore()
  const [newItem, setNewItem] = useState('')
  const [newCat, setNewCat]   = useState<ShoppingCategory>('övrigt')
  const [catTouched, setCatTouched] = useState(false)
  const [copied, setCopied]   = useState(false)
  const [aiResult, setAiResult]   = useState<AiCleanupResult | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError]     = useState<string | null>(null)

  const items = week.shoppingList
  const dismissed = week.dismissedMergePairs ?? []

  function rebuildAutoItems() {
    const raw: ShoppingItem[] = []
    const pantry = new Set(settings.pantryItems.map(p => p.toLowerCase()))

    for (const meal of week.meals) {
      if (meal.isRemainder) continue
      const total = meal.components.filter(c => c.portionsMode === 'own').reduce((s, c) => s + c.portions, 0)

      for (const comp of meal.components) {
        if (!comp.dishId) continue
        const dish = dishes.find(d => d.id === comp.dishId)
        if (!dish || dish.ingredients.length === 0) continue

        const effectivePortions = comp.portionsMode === 'total' ? Math.max(1, total) : comp.portions

        for (const ing of dish.ingredients) {
          if (pantry.has(ing.name.toLowerCase())) continue
          const scale = effectivePortions / ing.portionsBase
          raw.push({
            id: uuid(),
            name: ing.name,
            amount: (ing.amount * scale).toFixed(1).replace(/\.0$/, ''),
            unit: ing.unit,
            category: ing.category,
            isAutoAdded: true,
            dishIds: [comp.dishId],
            isPurchased: false,
            isExcluded: false,
          })
        }
      }
    }

    // Carry over purchased / har-hemma state from the previous auto items so a
    // rebuild doesn't reset what's already been checked off
    const prevAuto = new Map(
      items.filter(i => i.isAutoAdded).map(i => [i.name.toLowerCase().trim(), i])
    )
    const merged = mergeExactDuplicates(raw, settings.unitConversions).map(item => {
      const prev = prevAuto.get(item.name.toLowerCase().trim())
      return prev
        ? { ...item, isPurchased: prev.isPurchased, isExcluded: prev.isExcluded }
        : item
    })
    store.rebuildShoppingFromIngredients(merged)
  }

  // Known ingredient name → category, used to auto-pick category for manual adds
  const categoryByName = useMemo(() => {
    const map = new Map<string, ShoppingCategory>()
    for (const dish of dishes) {
      for (const ing of dish.ingredients) {
        const key = ing.name.toLowerCase().trim()
        if (key && !map.has(key)) map.set(key, ing.category)
      }
    }
    for (const item of items) {
      const key = item.name.toLowerCase().trim()
      if (key && !map.has(key)) map.set(key, item.category)
    }
    return map
  }, [dishes, items])

  function guessCategory(name: string): ShoppingCategory | null {
    const q = name.toLowerCase().trim()
    if (q.length < 3) return null
    const exact = categoryByName.get(q)
    if (exact) return exact
    for (const [key, cat] of categoryByName) {
      if (key.length >= 3 && (q.includes(key) || key.includes(q))) return cat
    }
    return null
  }

  function onNewItemChange(value: string) {
    setNewItem(value)
    if (!catTouched) {
      if (!value.trim()) {
        setNewCat('övrigt')
      } else {
        const guess = guessCategory(value)
        if (guess) setNewCat(guess)
      }
    }
  }

  function addManual() {
    if (!newItem.trim()) return
    store.addShoppingItem({
      name: newItem.trim(), amount: '', unit: '', category: newCat,
      isAutoAdded: false, dishIds: [], isPurchased: false, isExcluded: false,
    })
    setNewItem('')
    setNewCat('övrigt')
    setCatTouched(false)
  }

  function markAllPurchased() {
    items.filter(i => !i.isPurchased && !i.isExcluded).forEach(i =>
      store.updateShoppingItem(i.id, { isPurchased: true })
    )
  }

  function approveMerge(suggestion: MergeSuggestion) {
    // Compute merged amount
    let mergedAmount = suggestion.suggestedAmount
    let mergedUnit   = suggestion.suggestedUnit

    if (!mergedAmount) {
      // Couldn't convert to grams; fall back to summing same-unit items, rest dropped
      const byUnit = new Map<string, number>()
      for (const item of suggestion.items) {
        const n = parseFloat(item.amount)
        if (isNaN(n)) continue
        const key = item.unit.toLowerCase()
        byUnit.set(key, (byUnit.get(key) ?? 0) + n)
      }
      if (byUnit.size === 1) {
        const [[unit, total]] = byUnit.entries()
        mergedUnit = unit
        mergedAmount = total.toFixed(1).replace(/\.0$/, '')
      }
    }

    // Remove all items in the suggestion
    for (const item of suggestion.items) {
      store.deleteShoppingItem(item.id)
    }

    // Add the merged item (keep category from first item)
    store.addShoppingItem({
      name: suggestion.suggestedName,
      amount: mergedAmount,
      unit: mergedUnit,
      category: suggestion.items[0].category,
      isAutoAdded: suggestion.items[0].isAutoAdded,
      dishIds: [...new Set(suggestion.items.flatMap(i => i.dishIds ?? []))],
      isPurchased: false,
      isExcluded: false,
    })
  }

  async function runAiCleanup() {
    setAiLoading(true)
    setAiError(null)
    setAiResult(null)
    try {
      const active = items.filter(i => !i.isExcluded)
      const result = await cleanupShoppingList(active, settings)
      setAiResult(result)
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e))
    } finally {
      setAiLoading(false)
    }
  }

  function applyAiMerge(merge: AiCleanupResult['merges'][number]) {
    const mergeItems = merge.itemIds
      .map(id => items.find(i => i.id === id))
      .filter((i): i is ShoppingItem => !!i)
    if (mergeItems.length < 2) return

    const { amount, unit } = computeMergedAmount(mergeItems, settings.unitConversions)
    for (const item of mergeItems) store.deleteShoppingItem(item.id)
    store.addShoppingItem({
      name: merge.name,
      amount,
      unit,
      category: merge.category,
      isAutoAdded: mergeItems[0].isAutoAdded,
      dishIds: [...new Set(mergeItems.flatMap(i => i.dishIds ?? []))],
      isPurchased: false,
      isExcluded: false,
    })
    setAiResult(r => r && { ...r, merges: r.merges.filter(m => m !== merge) })
  }

  function applyAiRecat(recat: AiCleanupResult['recategorizations'][number]) {
    store.updateShoppingItem(recat.itemId, { category: recat.category })
    setAiResult(r => r && { ...r, recategorizations: r.recategorizations.filter(x => x !== recat) })
  }

  function applyAiTranslation(tr: AiCleanupResult['translations'][number]) {
    store.updateShoppingItem(tr.itemId, { name: tr.name })
    setAiResult(r => r && { ...r, translations: r.translations.filter(x => x !== tr) })
  }

  function applyAllAi() {
    if (!aiResult) return
    for (const m of aiResult.merges) applyAiMerge(m)
    for (const r of aiResult.recategorizations) applyAiRecat(r)
    for (const t of aiResult.translations) applyAiTranslation(t)
    setAiResult(null)
  }

  // Active (to buy) items, grouped by category and alphabetized
  const grouped = useMemo(() => {
    const visible = items.filter(i => !i.isExcluded && !i.isPurchased)
    const map = new Map<ShoppingCategory, ShoppingItem[]>()
    for (const cat of CATEGORY_ORDER) map.set(cat, [])
    for (const item of visible) {
      const list = map.get(item.category) ?? map.get('övrigt')!
      list.push(item)
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name, 'sv'))
    }
    return [...map.entries()].filter(([, list]) => list.length > 0)
  }, [items])

  const purchasedItems = useMemo(
    () => items.filter(i => i.isPurchased && !i.isExcluded)
      .sort((a, b) => a.name.localeCompare(b.name, 'sv')),
    [items]
  )
  const excludedItems = useMemo(
    () => items.filter(i => i.isExcluded)
      .sort((a, b) => a.name.localeCompare(b.name, 'sv')),
    [items]
  )

  const suggestions = useMemo(
    () => computeMergeSuggestions(items, dismissed, settings.unitConversions),
    [items, dismissed, settings.unitConversions]
  )

  const dishNameById = useMemo(
    () => new Map(dishes.map(d => [d.id, d.name])),
    [dishes]
  )

  const totalCount = items.filter(i => !i.isExcluded).length
  const purchasedCount = purchasedItems.length
  const unpurchasedCount = totalCount - purchasedCount

  // Estimated cost of what's left to buy (only items the lexicon recognizes)
  const estimatedRemaining = useMemo(() => {
    let sum = 0
    for (const item of items) {
      if (item.isExcluded || item.isPurchased) continue
      const n = parseFloat(item.amount)
      if (isNaN(n)) continue
      const r = ingredientImpact(
        { name: item.name, amount: n, unit: item.unit },
        settings.unitConversions,
        settings.costOverrides ?? {},
      )
      if (r.matched) sum += r.costSEK
    }
    return sum
  }, [items, settings.unitConversions, settings.costOverrides])

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  async function shareList() {
    const lines: string[] = []
    for (const [cat, catItems] of grouped) {
      lines.push(`${CATEGORY_LABELS[cat]}:`)
      for (const item of catItems) {
        const qty = [item.amount, item.unit].filter(Boolean).join(' ')
        lines.push(qty ? `• ${item.name} (${qty})` : `• ${item.name}`)
      }
      lines.push('')
    }
    const text = lines.join('\n').trim()
    try {
      if (canShare) {
        await navigator.share({ title: 'Inköpslista', text })
      } else {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 2000)
      }
    } catch {
      // user dismissed the share sheet
    }
  }

  return (
    <div className="max-w-2xl space-y-4 p-4 md:p-0">
      {/* Progress */}
      {totalCount > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">
              {purchasedCount} av {totalCount} handlat
            </span>
            {estimatedRemaining > 0 && (
              <span className="text-xs text-gray-400">
                ≈ {formatSEK(estimatedRemaining)} kvar att handla
              </span>
            )}
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-500 rounded-full transition-all duration-300"
              style={{ width: `${totalCount ? (purchasedCount / totalCount) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Top actions */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={rebuildAutoItems}
          className="flex items-center gap-1.5 border border-gray-200 hover:bg-gray-50 text-gray-600 px-3 py-2 rounded-xl text-sm font-medium"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Uppdatera från recept
        </button>
        <button
          onClick={runAiCleanup}
          disabled={aiLoading}
          className="flex items-center gap-1.5 border border-violet-200 text-violet-600 hover:bg-violet-50 disabled:opacity-50 px-3 py-2 rounded-xl text-sm font-medium"
        >
          <Sparkles className="w-3.5 h-3.5" /> {aiLoading ? 'Städar…' : 'Städa med AI'}
        </button>
        {unpurchasedCount > 0 && (
          <>
            <button
              onClick={shareList}
              className="flex items-center gap-1.5 border border-gray-200 hover:bg-gray-50 text-gray-600 px-3 py-2 rounded-xl text-sm font-medium"
            >
              {canShare
                ? <><Share2 className="w-3.5 h-3.5" /> Dela lista</>
                : copied
                  ? <><Check className="w-3.5 h-3.5 text-brand-600" /> Kopierad!</>
                  : <><Copy className="w-3.5 h-3.5" /> Kopiera lista</>}
            </button>
            <button
              onClick={markAllPurchased}
              className="flex items-center gap-1.5 border border-brand-200 text-brand-600 hover:bg-brand-50 px-3 py-2 rounded-xl text-sm font-medium"
            >
              <CheckCheck className="w-3.5 h-3.5" /> Markera allt ({unpurchasedCount})
            </button>
          </>
        )}
      </div>

      {/* AI cleanup */}
      {aiError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-2xl px-4 py-3">
          {aiError}
        </div>
      )}
      {aiResult && (
        <AiCleanupPanel
          result={aiResult}
          items={items}
          onApplyMerge={applyAiMerge}
          onApplyRecat={applyAiRecat}
          onApplyTranslation={applyAiTranslation}
          onApplyAll={applyAllAi}
          onDismiss={() => setAiResult(null)}
        />
      )}

      {/* Merge suggestions */}
      {suggestions.length > 0 && (
        <MergeSuggestionsPanel
          suggestions={suggestions}
          onApprove={approveMerge}
          onDismiss={(key) => store.dismissMergeSuggestion(key)}
        />
      )}

      {/* Add item */}
      <div className="bg-white rounded-2xl p-4 shadow-sm flex flex-wrap gap-2">
        <input
          type="text"
          placeholder="Lägg till vara…"
          value={newItem}
          onChange={e => onNewItemChange(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addManual()}
          className="flex-1 min-w-[180px] border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
        />
        <select
          value={newCat}
          onChange={e => { setNewCat(e.target.value as ShoppingCategory); setCatTouched(true) }}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-300"
        >
          {CATEGORY_ORDER.map(c => (
            <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
          ))}
        </select>
        <button
          onClick={addManual}
          className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-xl text-sm font-medium"
        >
          Lägg till
        </button>
      </div>

      {/* Grouped list */}
      {grouped.length === 0 ? (
        totalCount > 0 ? (
          <div className="bg-white rounded-2xl shadow-sm py-10 px-6 text-center space-y-2">
            <CheckCheck className="w-8 h-8 text-brand-400 mx-auto" />
            <p className="text-sm font-medium text-gray-700">Allt är handlat! 🎉</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm py-10 px-6 text-center space-y-3">
            <ShoppingBasket className="w-8 h-8 text-gray-200 mx-auto" />
            <p className="text-sm text-gray-400">Inköpslistan är tom.</p>
            <button
              onClick={rebuildAutoItems}
              className="inline-flex items-center gap-1.5 border border-gray-200 hover:bg-gray-50 text-gray-600 px-3 py-2 rounded-xl text-sm font-medium"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Hämta varor från veckans recept
            </button>
          </div>
        )
      ) : (
        <div className="space-y-3">
          {grouped.map(([cat, catItems]) => (
            <div key={cat} className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="px-4 py-2 bg-gray-50/60 border-b border-gray-100 flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {CATEGORY_LABELS[cat]}
                </span>
                <span className="text-[11px] text-gray-400">{catItems.length}</span>
              </div>
              <div className="divide-y divide-gray-50">
                {catItems.map(item => (
                  <ShoppingItemRow
                    key={item.id}
                    item={item}
                    recipeNames={(item.dishIds ?? []).map(id => dishNameById.get(id)).filter((n): n is string => !!n)}
                    onToggle={() => store.updateShoppingItem(item.id, { isPurchased: !item.isPurchased })}
                    onExclude={() => store.updateShoppingItem(item.id, { isExcluded: !item.isExcluded })}
                    onDelete={() => store.deleteShoppingItem(item.id)}
                    onUpdate={(p) => store.updateShoppingItem(item.id, p)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Purchased */}
      {purchasedItems.length > 0 && (
        <CollapsibleSection title="Handlat" count={purchasedItems.length}>
          {purchasedItems.map(item => (
            <div key={item.id} className="flex items-center gap-3 px-4 py-2.5">
              <button
                onClick={() => store.updateShoppingItem(item.id, { isPurchased: false })}
                title="Ångra handlat"
                className="w-5 h-5 rounded-full border-2 bg-brand-500 border-brand-500 text-white shrink-0 flex items-center justify-center"
              >
                <Check className="w-3 h-3" />
              </button>
              <span className="flex-1 text-sm text-gray-400">
                <span className="line-through">{item.name}</span>
                {(item.amount || item.unit) && (
                  <span className="text-xs ml-2">{item.amount} {item.unit}</span>
                )}
              </span>
              <button
                onClick={() => store.deleteShoppingItem(item.id)}
                className="text-gray-300 hover:text-red-400 p-1 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Har hemma (excluded) */}
      {excludedItems.length > 0 && (
        <CollapsibleSection title="Har hemma" count={excludedItems.length}>
          {excludedItems.map(item => (
            <div key={item.id} className="flex items-center gap-3 px-4 py-2.5">
              <Home className="w-4 h-4 text-gray-300 shrink-0" />
              <span className="flex-1 text-sm text-gray-500">
                {item.name}
                {(item.amount || item.unit) && (
                  <span className="text-xs text-gray-400 ml-2">{item.amount} {item.unit}</span>
                )}
              </span>
              <button
                onClick={() => store.updateShoppingItem(item.id, { isExcluded: false })}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-brand-600 border border-gray-200 hover:border-brand-200 px-2 py-1 rounded-lg shrink-0"
              >
                <Undo2 className="w-3 h-3" /> Lägg tillbaka
              </button>
              <button
                onClick={() => store.deleteShoppingItem(item.id)}
                className="text-gray-300 hover:text-red-400 p-1 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </CollapsibleSection>
      )}
    </div>
  )
}

function CollapsibleSection({
  title, count, children,
}: {
  title: string
  count: number
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-sm font-medium text-gray-600">
          {title} <span className="text-gray-400">({count})</span>
        </span>
        {open
          ? <ChevronUp className="w-4 h-4 text-gray-400" />
          : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && (
        <div className="divide-y divide-gray-50 border-t border-gray-100">
          {children}
        </div>
      )}
    </div>
  )
}

function MergeSuggestionsPanel({
  suggestions, onApprove, onDismiss,
}: {
  suggestions: MergeSuggestion[]
  onApprove: (s: MergeSuggestion) => void
  onDismiss: (key: string) => void
}) {
  const [open, setOpen] = useState(true)

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold text-amber-800">
          Förslag på sammanslagning ({suggestions.length})
        </span>
        {open
          ? <ChevronUp className="w-4 h-4 text-amber-500" />
          : <ChevronDown className="w-4 h-4 text-amber-500" />}
      </button>

      {open && (
        <div className="divide-y divide-amber-100 border-t border-amber-200">
          {suggestions.map(s => (
            <div key={s.key} className="px-4 py-3 space-y-2">
              <div className="flex flex-wrap gap-1 items-center text-sm text-gray-700">
                {s.items.map((item, i) => (
                  <span key={item.id}>
                    {i > 0 && <span className="text-gray-400 mx-1">+</span>}
                    <span className="font-medium">{item.name}</span>
                    {(item.amount || item.unit) && (
                      <span className="text-gray-400 ml-1">({item.amount} {item.unit})</span>
                    )}
                  </span>
                ))}
                {s.suggestedAmount && (
                  <>
                    <span className="text-gray-400 mx-1">→</span>
                    <span className="font-medium text-amber-800">
                      {s.suggestedName} ({s.suggestedAmount} {s.suggestedUnit})
                    </span>
                  </>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => onApprove(s)}
                  className="text-xs bg-amber-600 hover:bg-amber-700 text-white px-3 py-1 rounded-lg font-medium"
                >
                  Slå ihop
                </button>
                <button
                  onClick={() => onDismiss(s.key)}
                  className="text-xs border border-amber-300 text-amber-700 hover:bg-amber-100 px-3 py-1 rounded-lg"
                >
                  Behåll separat
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AiCleanupPanel({
  result, items, onApplyMerge, onApplyRecat, onApplyTranslation, onApplyAll, onDismiss,
}: {
  result: AiCleanupResult
  items: ShoppingItem[]
  onApplyMerge: (m: AiCleanupResult['merges'][number]) => void
  onApplyRecat: (r: AiCleanupResult['recategorizations'][number]) => void
  onApplyTranslation: (t: AiCleanupResult['translations'][number]) => void
  onApplyAll: () => void
  onDismiss: () => void
}) {
  const nameOf = (id: string) => items.find(i => i.id === id)?.name ?? '?'
  const total = result.merges.length + result.recategorizations.length + result.translations.length

  if (total === 0) {
    return (
      <div className="bg-violet-50 border border-violet-200 rounded-2xl px-4 py-3 flex items-center justify-between">
        <span className="text-sm text-violet-800">AI hittade inget att städa. 🎉</span>
        <button onClick={onDismiss} className="text-violet-400 hover:text-violet-600 text-sm">✕</button>
      </div>
    )
  }

  return (
    <div className="bg-violet-50 border border-violet-200 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm font-semibold text-violet-800">AI-förslag ({total})</span>
        <div className="flex gap-2">
          <button
            onClick={onApplyAll}
            className="text-xs bg-violet-600 hover:bg-violet-700 text-white px-3 py-1 rounded-lg font-medium"
          >
            Tillämpa alla
          </button>
          <button
            onClick={onDismiss}
            className="text-xs border border-violet-300 text-violet-700 hover:bg-violet-100 px-3 py-1 rounded-lg"
          >
            Stäng
          </button>
        </div>
      </div>

      <div className="divide-y divide-violet-100 border-t border-violet-200">
        {result.merges.map((m, idx) => (
          <div key={`m${idx}`} className="px-4 py-3 flex items-center justify-between gap-2">
            <span className="text-sm text-gray-700">
              <span className="text-violet-500 text-xs uppercase mr-2">Slå ihop</span>
              {m.itemIds.map(nameOf).join(' + ')}
              <span className="text-gray-400 mx-1">→</span>
              <span className="font-medium text-violet-800">{m.name}</span>
            </span>
            <button
              onClick={() => onApplyMerge(m)}
              className="text-xs bg-violet-600 hover:bg-violet-700 text-white px-3 py-1 rounded-lg font-medium shrink-0"
            >
              Tillämpa
            </button>
          </div>
        ))}
        {result.recategorizations.map((r, idx) => (
          <div key={`r${idx}`} className="px-4 py-3 flex items-center justify-between gap-2">
            <span className="text-sm text-gray-700">
              <span className="text-violet-500 text-xs uppercase mr-2">Kategori</span>
              <span className="font-medium">{nameOf(r.itemId)}</span>
              <span className="text-gray-400 mx-1">→</span>
              <span className="font-medium text-violet-800">{CATEGORY_LABELS[r.category]}</span>
            </span>
            <button
              onClick={() => onApplyRecat(r)}
              className="text-xs bg-violet-600 hover:bg-violet-700 text-white px-3 py-1 rounded-lg font-medium shrink-0"
            >
              Tillämpa
            </button>
          </div>
        ))}
        {result.translations.map((t, idx) => (
          <div key={`t${idx}`} className="px-4 py-3 flex items-center justify-between gap-2">
            <span className="text-sm text-gray-700">
              <span className="text-violet-500 text-xs uppercase mr-2">Översätt</span>
              <span className="font-medium">{nameOf(t.itemId)}</span>
              <span className="text-gray-400 mx-1">→</span>
              <span className="font-medium text-violet-800">{t.name}</span>
            </span>
            <button
              onClick={() => onApplyTranslation(t)}
              className="text-xs bg-violet-600 hover:bg-violet-700 text-white px-3 py-1 rounded-lg font-medium shrink-0"
            >
              Tillämpa
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function ShoppingItemRow({
  item, recipeNames, onToggle, onExclude, onDelete, onUpdate,
}: {
  item: ShoppingItem
  recipeNames: string[]
  onToggle: () => void
  onExclude: () => void
  onDelete: () => void
  onUpdate: (p: Partial<ShoppingItem>) => void
}) {
  const [editing, setEditing] = useState(false)

  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 ${item.isPurchased ? 'opacity-50' : ''}`}>
      {/* Purchased checkbox */}
      <button
        onClick={onToggle}
        className={`w-6 h-6 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors
          ${item.isPurchased ? 'bg-brand-500 border-brand-500 text-white' : 'border-gray-300 hover:border-brand-400'}`}
      >
        {item.isPurchased && <Check className="w-3.5 h-3.5" />}
      </button>

      {/* Name & amount */}
      {editing ? (
        <div className="flex flex-1 gap-2 flex-wrap">
          <input
            autoFocus
            value={item.name}
            onChange={e => onUpdate({ name: e.target.value })}
            onKeyDown={e => e.key === 'Enter' && setEditing(false)}
            className="flex-1 min-w-[100px] border border-gray-200 rounded-lg px-2 py-1 text-sm"
          />
          <input
            value={item.amount}
            onChange={e => onUpdate({ amount: e.target.value })}
            placeholder="Mängd"
            className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-sm"
          />
          <input
            value={item.unit}
            onChange={e => onUpdate({ unit: e.target.value })}
            placeholder="Enhet"
            className="w-16 border border-gray-200 rounded-lg px-2 py-1 text-sm"
          />
          <button onClick={() => setEditing(false)} className="text-brand-600 text-sm font-medium">Klar</button>
        </div>
      ) : (
        <button onClick={() => setEditing(true)} className="flex-1 text-left">
          <span className="block">
            <span className={`text-sm ${item.isPurchased ? 'line-through text-gray-400' : 'text-gray-800'}`}>
              {item.name}
            </span>
            {(item.amount || item.unit) && (
              <span className="text-xs text-gray-400 ml-2">
                {item.amount} {item.unit}
              </span>
            )}
          </span>
          {recipeNames.length > 0 && (
            <span className="flex flex-wrap gap-1 mt-1">
              {recipeNames.map(name => (
                <span
                  key={name}
                  className="text-[10px] leading-tight bg-brand-50 text-brand-600 rounded-full px-1.5 py-0.5"
                >
                  {name}
                </span>
              ))}
            </span>
          )}
        </button>
      )}

      {/* Actions */}
      <div className="flex gap-0.5 shrink-0">
        <button
          onClick={onExclude}
          title="Har hemma – flytta från listan"
          className="text-gray-300 hover:text-brand-500 p-1.5"
        >
          <Home className="w-4 h-4" />
        </button>
        <button
          onClick={onDelete}
          title="Ta bort"
          className="text-gray-300 hover:text-red-400 p-1.5"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
