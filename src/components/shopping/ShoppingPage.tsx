import { useState, useMemo } from 'react'
import { RefreshCw, Sparkles, CheckCheck, ShoppingCart, Plus, Check, Home, X } from 'lucide-react'
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

  const activeItems = items.filter(i => !i.isExcluded)
  const purchasedCount = activeItems.filter(i => i.isPurchased).length
  const progressPct = activeItems.length ? Math.round((purchasedCount / activeItems.length) * 100) : 0

  return (
    <div className="max-w-2xl space-y-5">
      {/* Progress */}
      {activeItems.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[13px]">
            <span className="font-semibold">{purchasedCount} av {activeItems.length} klara</span>
            <button
              onClick={() => setShowPurchased(v => !v)}
              aria-pressed={showPurchased}
              className="text-ink-muted hover:text-ink font-medium"
            >
              {showPurchased ? 'Dölj handlade' : 'Visa handlade'}
            </button>
          </div>
          <div className="h-2 rounded-full bg-line overflow-hidden">
            <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap pb-0.5 [scrollbar-width:none]">
        <button onClick={rebuildAutoItems} className="chip chip-off shrink-0 font-medium">
          <RefreshCw className="w-4 h-4" /> Uppdatera från recept
        </button>
        <button
          onClick={runAiCleanup}
          disabled={aiLoading}
          className="chip chip-off shrink-0 font-medium disabled:opacity-50"
        >
          <Sparkles className="w-4 h-4" /> {aiLoading ? 'Städar…' : 'Städa med AI'}
        </button>
        {unpurchasedCount > 0 && (
          <button onClick={markAllPurchased} className="chip chip-off shrink-0 font-medium">
            <CheckCheck className="w-4 h-4" /> Allt handlat ({unpurchasedCount})
          </button>
        )}
      </div>

      {/* AI cleanup */}
      {aiError && (
        <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-3xl px-4 py-3">
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

      {/* Grouped list */}
      {grouped.length === 0 ? (
        <div className="card px-6 py-10 text-center">
          <ShoppingCart className="w-8 h-8 text-ink-faint mx-auto mb-3" />
          <p className="text-[15px] font-semibold">Inköpslistan är tom</p>
          <p className="text-sm text-ink-muted mt-1">Tryck "Uppdatera från recept" eller lägg till varor nedan.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map(([cat, catItems]) => (
            <section key={cat} className="space-y-2">
              <h2 className="eyebrow px-1 font-sans tracking-wider">{CATEGORY_LABELS[cat]}</h2>
              <div className="card overflow-hidden divide-y divide-line-soft">
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
            </section>
          ))}
        </div>
      )}

      {/* Add item — sticks above the tab bar on mobile so it stays in thumb reach */}
      <div className="sticky bottom-28 md:bottom-6 z-10">
        <div className="bg-white rounded-full shadow-[0_8px_24px_rgba(21,23,26,0.10),0_0_0_1px_rgba(21,23,26,0.06)] p-1.5 pl-4 flex items-center gap-2">
          <Plus className="w-[18px] h-[18px] text-ink-muted shrink-0" />
          <input
            type="text"
            aria-label="Lägg till vara"
            placeholder="Lägg till vara"
            value={newItem}
            onChange={e => setNewItem(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addManual()}
            className="flex-1 min-w-0 h-10 bg-transparent text-base text-ink placeholder:text-ink-faint focus:outline-none"
          />
          <select
            aria-label="Kategori"
            value={newCat}
            onChange={e => setNewCat(e.target.value as ShoppingCategory)}
            className="h-10 max-w-[120px] rounded-full bg-canvas px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-300"
          >
            {CATEGORY_ORDER.map(c => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </select>
          <button
            onClick={addManual}
            disabled={!newItem.trim()}
            aria-label="Lägg till"
            className="w-10 h-10 rounded-full bg-brand-600 hover:bg-brand-700 text-white flex items-center justify-center shrink-0 disabled:opacity-40"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </div>
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
    <div className="bg-amber-50 border border-amber-200 rounded-3xl overflow-hidden">
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
      <div className="bg-violet-50 border border-violet-200 rounded-3xl px-4 py-3 flex items-center justify-between">
        <span className="text-sm text-violet-800">AI hittade inget att städa. 🎉</span>
        <button onClick={onDismiss} className="text-violet-400 hover:text-violet-600 text-sm">✕</button>
      </div>
    )
  }

  return (
    <div className="bg-violet-50 border border-violet-200 rounded-3xl overflow-hidden">
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
    <div className="flex items-center gap-1 pl-2 pr-1.5 min-h-[56px]">
      {/* Purchased checkbox */}
      <button
        onClick={onToggle}
        role="checkbox"
        aria-checked={item.isPurchased}
        aria-label={item.name}
        className="w-11 h-11 shrink-0 flex items-center justify-center"
      >
        <span className={`w-6 h-6 rounded-lg flex items-center justify-center transition-colors
          ${item.isPurchased ? 'bg-brand-600 text-white' : 'border-2 border-ink-faint/60'}`}>
          {item.isPurchased && <Check className="w-4 h-4" strokeWidth={3} />}
        </span>
      </button>

      {/* Name & amount */}
      {editing ? (
        <div className="flex flex-1 gap-2 py-2 items-center min-w-0">
          <input
            autoFocus
            aria-label="Namn"
            value={item.name}
            onChange={e => onUpdate({ name: e.target.value })}
            className="cell flex-1 text-base"
          />
          <input
            aria-label="Mängd"
            value={item.amount}
            onChange={e => onUpdate({ amount: e.target.value })}
            placeholder="Mängd"
            className="cell w-16 text-base"
          />
          <input
            aria-label="Enhet"
            value={item.unit}
            onChange={e => onUpdate({ unit: e.target.value })}
            placeholder="Enhet"
            className="cell w-14 text-base"
          />
          <button onClick={() => setEditing(false)} className="h-10 px-3 rounded-full bg-ink text-white text-sm font-semibold shrink-0">Klar</button>
        </div>
      ) : (
        <button onClick={() => setEditing(true)} className="flex-1 min-w-0 text-left py-2">
          <span className="flex items-baseline gap-2">
            <span className={`text-[15px] font-medium truncate ${item.isPurchased ? 'line-through text-ink-faint' : 'text-ink'}`}>
              {item.name}
            </span>
            {(item.amount || item.unit) && (
              <span className={`text-[13px] whitespace-nowrap ${item.isPurchased ? 'text-ink-faint' : 'text-ink-muted'}`}>
                {item.amount} {item.unit}
              </span>
            )}
          </span>
          {recipeNames.length > 0 && !item.isPurchased && (
            <span className="flex flex-wrap gap-1 mt-1">
              {recipeNames.map(name => (
                <span
                  key={name}
                  className="text-[11px] leading-tight bg-mint text-mint-ink rounded-full px-2 py-0.5"
                >
                  {name}
                </span>
              ))}
            </span>
          )}
        </button>
      )}

      {/* Actions */}
      {!editing && (
        <div className="flex shrink-0">
          <button
            onClick={onExclude}
            title="Har hemma"
            aria-label={`${item.name}: har hemma`}
            className="w-10 h-10 rounded-full flex items-center justify-center text-ink-faint hover:text-brand-700 hover:bg-canvas"
          >
            <Home className="w-[18px] h-[18px]" />
          </button>
          <button
            onClick={onDelete}
            title="Ta bort"
            aria-label={`Ta bort ${item.name}`}
            className="w-10 h-10 rounded-full flex items-center justify-center text-ink-faint hover:text-red-700 hover:bg-red-50"
          >
            <X className="w-[18px] h-[18px]" />
          </button>
        </div>
      )}
    </div>
  )
}
