import { useState, useMemo } from 'react'
import { v4 as uuid } from 'uuid'
import { useWeekStore, activeWeek } from '../../store/weekStore'
import { useLibraryStore } from '../../store/libraryStore'
import { useSettingsStore } from '../../store/settingsStore'
import type { ShoppingItem, ShoppingCategory } from '../../types'
import { mergeExactDuplicates, computeMergeSuggestions, computeMergedAmount } from '../../utils/ingredientMerge'
import type { MergeSuggestion } from '../../utils/ingredientMerge'
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
  const [showPurchased, setShowPurchased] = useState(false)
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

    store.rebuildShoppingFromIngredients(
      mergeExactDuplicates(raw, settings.unitConversions)
    )
  }

  function addManual() {
    if (!newItem.trim()) return
    store.addShoppingItem({
      name: newItem.trim(), amount: '', unit: '', category: newCat,
      isAutoAdded: false, dishIds: [], isPurchased: false, isExcluded: false,
    })
    setNewItem('')
  }

  function markAllPurchased() {
    items.filter(i => !i.isPurchased).forEach(i =>
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

  const grouped = useMemo(() => {
    const visible = items.filter(i => !i.isExcluded && (showPurchased || !i.isPurchased))
    const map = new Map<ShoppingCategory, ShoppingItem[]>()
    for (const cat of CATEGORY_ORDER) map.set(cat, [])
    for (const item of visible) {
      const list = map.get(item.category) ?? map.get('övrigt')!
      list.push(item)
    }
    return [...map.entries()].filter(([, list]) => list.length > 0)
  }, [items, showPurchased])

  const suggestions = useMemo(
    () => computeMergeSuggestions(items, dismissed, settings.unitConversions),
    [items, dismissed, settings.unitConversions]
  )

  const dishNameById = useMemo(
    () => new Map(dishes.map(d => [d.id, d.name])),
    [dishes]
  )

  const unpurchasedCount = items.filter(i => !i.isPurchased && !i.isExcluded).length

  return (
    <div className="max-w-2xl space-y-4">
      {/* Top actions */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={rebuildAutoItems}
          className="border border-gray-200 hover:bg-gray-50 text-gray-600 px-3 py-2 rounded-xl text-sm font-medium"
        >
          ↺ Uppdatera från recept
        </button>
        <button
          onClick={runAiCleanup}
          disabled={aiLoading}
          className="border border-violet-200 text-violet-600 hover:bg-violet-50 disabled:opacity-50 px-3 py-2 rounded-xl text-sm font-medium"
        >
          {aiLoading ? '✨ Städar…' : '✨ Städa med AI'}
        </button>
        {unpurchasedCount > 0 && (
          <button
            onClick={markAllPurchased}
            className="border border-brand-200 text-brand-600 hover:bg-brand-50 px-3 py-2 rounded-xl text-sm font-medium"
          >
            ✓ Markera allt som handlat ({unpurchasedCount})
          </button>
        )}
        <label className="flex items-center gap-2 text-sm text-gray-500 ml-auto cursor-pointer">
          <input
            type="checkbox"
            checked={showPurchased}
            onChange={e => setShowPurchased(e.target.checked)}
            className="accent-brand-600 rounded"
          />
          Visa handlade
        </label>
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
          onChange={e => setNewItem(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addManual()}
          className="flex-1 min-w-[180px] border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
        />
        <select
          value={newCat}
          onChange={e => setNewCat(e.target.value as ShoppingCategory)}
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
        <p className="text-sm text-gray-400 py-8 text-center">
          Inköpslistan är tom. Tryck "Uppdatera från recept" eller lägg till varor manuellt.
        </p>
      ) : (
        <div className="space-y-3">
          {grouped.map(([cat, catItems]) => (
            <div key={cat} className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="px-4 py-2 bg-gray-50/60 border-b border-gray-100">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {CATEGORY_LABELS[cat]}
                </span>
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
        <span className="text-amber-500 text-xs">{open ? '▲' : '▼'}</span>
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
        className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors
          ${item.isPurchased ? 'bg-brand-500 border-brand-500 text-white' : 'border-gray-300'}`}
      >
        {item.isPurchased && <span className="text-xs leading-none">✓</span>}
      </button>

      {/* Name & amount */}
      {editing ? (
        <div className="flex flex-1 gap-2 flex-wrap">
          <input
            autoFocus
            value={item.name}
            onChange={e => onUpdate({ name: e.target.value })}
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
      <div className="flex gap-1 shrink-0">
        <button
          onClick={onExclude}
          title="Har hemma"
          className="text-xs text-gray-300 hover:text-brand-400 px-1"
        >
          🏠
        </button>
        <button
          onClick={onDelete}
          className="text-gray-300 hover:text-red-400 text-sm px-1"
        >✕</button>
      </div>
    </div>
  )
}
