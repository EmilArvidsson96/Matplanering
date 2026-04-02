import { useState, useMemo } from 'react'
import { v4 as uuid } from 'uuid'
import { useWeekStore, activeWeek } from '../../store/weekStore'
import { useLibraryStore } from '../../store/libraryStore'
import { useSettingsStore } from '../../store/settingsStore'
import type { ShoppingItem, ShoppingCategory } from '../../types'

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

  const items = week.shoppingList

  // Rebuild auto-items from library ingredients when user asks
  function rebuildAutoItems() {
    const autoItems: ShoppingItem[] = []
    const pantry = new Set(settings.pantryItems.map(p => p.toLowerCase()))

    for (const meal of week.meals) {
      if (meal.isRemainder || !meal.dishId) continue
      const dish = dishes.find(d => d.id === meal.dishId)
      if (!dish || dish.ingredients.length === 0) continue

      for (const ing of dish.ingredients) {
        if (pantry.has(ing.name.toLowerCase())) continue
        const scale = meal.portions / ing.portionsBase
        autoItems.push({
          id: uuid(),
          name: ing.name,
          amount: (ing.amount * scale).toFixed(1).replace(/\.0$/, ''),
          unit: ing.unit,
          category: ing.category,
          isAutoAdded: true,
          dishId: meal.dishId,
          isPurchased: false,
          isExcluded: false,
        })
      }
    }
    store.rebuildShoppingFromIngredients(autoItems)
  }

  function addManual() {
    if (!newItem.trim()) return
    store.addShoppingItem({
      name: newItem.trim(), amount: '', unit: '', category: newCat,
      isAutoAdded: false, dishId: null, isPurchased: false, isExcluded: false,
    })
    setNewItem('')
  }

  function markAllPurchased() {
    items.filter(i => !i.isPurchased).forEach(i =>
      store.updateShoppingItem(i.id, { isPurchased: true })
    )
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

function ShoppingItemRow({
  item, onToggle, onExclude, onDelete, onUpdate,
}: {
  item: ShoppingItem
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
          <span className={`text-sm ${item.isPurchased ? 'line-through text-gray-400' : 'text-gray-800'}`}>
            {item.name}
          </span>
          {(item.amount || item.unit) && (
            <span className="text-xs text-gray-400 ml-2">
              {item.amount} {item.unit}
            </span>
          )}
          {item.isAutoAdded && (
            <span className="text-xs text-gray-300 ml-1">(recept)</span>
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
