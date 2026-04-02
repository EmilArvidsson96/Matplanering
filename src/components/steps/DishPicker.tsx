import { useState, useMemo } from 'react'
import { useLibraryStore } from '../../store/libraryStore'
import { useWeekStore } from '../../store/weekStore'
import { dishPopularity, dishLastCooked, dayOfYear } from '../../utils/weekUtils'
import Modal from '../common/Modal'
import type { Dish, SortOrder } from '../../types'

const FILTERS: { key: string; label: string; values: { id: string; label: string }[] }[] = [
  { key: 'protein', label: 'Protein', values: [
    { id: 'kyckling', label: 'Kyckling' }, { id: 'nöt', label: 'Nöt' },
    { id: 'fläsk', label: 'Fläsk' }, { id: 'fisk', label: 'Fisk' },
    { id: 'skaldjur', label: 'Skaldjur' }, { id: 'lamm', label: 'Lamm' },
    { id: 'vilt', label: 'Vilt' }, { id: 'vegetarisk', label: 'Vegetarisk' },
    { id: 'vegan', label: 'Vegan' },
  ]},
  { key: 'carb', label: 'Kolhydrat', values: [
    { id: 'ris', label: 'Ris' }, { id: 'pasta', label: 'Pasta' },
    { id: 'potatis', label: 'Potatis' }, { id: 'nudlar', label: 'Nudlar' },
    { id: 'bröd', label: 'Bröd' }, { id: 'ingen', label: 'Lågkolhydrat' },
  ]},
  { key: 'cuisine', label: 'Kök', values: [
    { id: 'svensk', label: 'Svensk' }, { id: 'italiensk', label: 'Italiensk' },
    { id: 'asiatisk', label: 'Asiatisk' }, { id: 'japansk', label: 'Japansk' },
    { id: 'koreansk', label: 'Koreansk' }, { id: 'indisk', label: 'Indisk' },
    { id: 'mellanöstern', label: 'Mellanöstern' }, { id: 'mexikansk', label: 'Mexikansk' },
    { id: 'fransk', label: 'Fransk' }, { id: 'nordafrikansk', label: 'Nordafrikansk' },
  ]},
  { key: 'type', label: 'Typ', values: [
    { id: 'soppa', label: 'Soppa' }, { id: 'sallad', label: 'Sallad' },
    { id: 'paj', label: 'Paj' }, { id: 'gryta', label: 'Gryta' },
    { id: 'grillat', label: 'Grillat' }, { id: 'bowl', label: 'Bowl' },
    { id: 'burgare', label: 'Burgare' }, { id: 'taco', label: 'Taco' },
    { id: 'wrap', label: 'Wrap' }, { id: 'pizza', label: 'Pizza' },
  ]},
  { key: 'tags', label: 'Taggar', values: [
    { id: 'snabb', label: 'Snabb' }, { id: 'festlig', label: 'Festlig' },
    { id: 'barnvänlig', label: 'Barnvänlig' }, { id: 'lowfodmap', label: 'Low FODMAP' },
    { id: 'lchf', label: 'LCHF' }, { id: 'lågfett', label: 'Låg fetthalt' },
    { id: 'stark', label: 'Stark' },
  ]},
]

interface Props {
  onSelect: (dish: Dish) => void
  onClose: () => void
  weekMealIds: string[]
}

export default function DishPicker({ onSelect, onClose, weekMealIds }: Props) {
  const { dishes }  = useLibraryStore()
  const weeks       = Object.values(useWeekStore().weeks)
  const [search, setSearch]           = useState('')
  const [sort, setSort]               = useState<SortOrder>('alfabetisk')
  const [active, setActive]           = useState<Record<string, Set<string>>>({})
  const [openGroup, setOpenGroup]     = useState<string | null>(null)
  const today = new Date().toISOString().slice(0, 10)

  function toggleFilter(group: string, id: string) {
    setActive(prev => {
      const set = new Set(prev[group] ?? [])
      set.has(id) ? set.delete(id) : set.add(id)
      return { ...prev, [group]: set }
    })
  }

  const activeCount = Object.values(active).reduce((s, set) => s + set.size, 0)

  const filtered = useMemo(() => {
    let list = dishes.filter(d => {
      if (search && !d.name.toLowerCase().includes(search.toLowerCase())) return false
      for (const { key } of FILTERS) {
        const sel = active[key]
        if (!sel || sel.size === 0) continue
        const fieldValues: string[] =
          key === 'protein' ? d.protein :
          key === 'carb'    ? d.carb :
          key === 'cuisine' ? [d.cuisine] :
          key === 'type'    ? d.type :
          key === 'tags'    ? d.tags : []
        if (!fieldValues.some(v => sel.has(v))) return false
      }
      return true
    })

    return [...list].sort((a, b) => {
      if (sort === 'alfabetisk')  return a.name.localeCompare(b.name, 'sv')
      if (sort === 'popularitet') return dishPopularity(b.id, weeks) - dishPopularity(a.id, weeks)
      const todayDoy = dayOfYear(today)
      const la = dishLastCooked(a.id, weeks), lb = dishLastCooked(b.id, weeks)
      const pa = la ? Math.abs(dayOfYear(la) - todayDoy) : 999
      const pb = lb ? Math.abs(dayOfYear(lb) - todayDoy) : 999
      return pa - pb
    })
  }, [dishes, search, active, sort, weeks, today])

  return (
    <Modal title="Välj rätt från biblioteket" onClose={onClose} wide>
      {/* Search + sort */}
      <div className="flex gap-2 mb-3">
        <input
          autoFocus
          type="text"
          placeholder="Sök rätt…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
        />
        <select
          value={sort}
          onChange={e => setSort(e.target.value as SortOrder)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
        >
          <option value="alfabetisk">A–Ö</option>
          <option value="popularitet">Populärast</option>
          <option value="säsong">Säsong</option>
        </select>
      </div>

      {/* Filter groups — each group is a collapsible row */}
      <div className="border border-gray-100 rounded-xl overflow-hidden mb-3 divide-y divide-gray-100">
        {FILTERS.map(({ key, label, values }) => {
          const sel = active[key] ?? new Set()
          const isOpen = openGroup === key
          return (
            <div key={key}>
              <button
                onClick={() => setOpenGroup(isOpen ? null : key)}
                className="w-full flex items-center justify-between px-3 py-2 text-sm bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <span className="font-medium text-gray-600">{label}</span>
                <span className="flex items-center gap-2">
                  {sel.size > 0 && (
                    <span className="text-xs bg-brand-600 text-white px-1.5 py-0.5 rounded-full">
                      {sel.size}
                    </span>
                  )}
                  <span className="text-gray-400 text-xs">{isOpen ? '▲' : '▼'}</span>
                </span>
              </button>
              {isOpen && (
                <div className="px-3 py-2 flex flex-wrap gap-1.5 bg-white">
                  {values.map(v => (
                    <button
                      key={v.id}
                      onClick={() => toggleFilter(key, v.id)}
                      className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors
                        ${sel.has(v.id)
                          ? 'bg-brand-600 text-white border-brand-600'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Clear filters */}
      {activeCount > 0 && (
        <button
          onClick={() => setActive({})}
          className="text-xs text-red-400 hover:text-red-600 mb-2"
        >
          Rensa {activeCount} filter
        </button>
      )}

      {/* Results */}
      <p className="text-xs text-gray-400 mb-2">{filtered.length} rätter</p>
      <div className="space-y-0.5">
        {filtered.map(dish => {
          const alreadyAdded = weekMealIds.includes(dish.id)
          const pop = dishPopularity(dish.id, weeks)
          const last = dishLastCooked(dish.id, weeks)
          return (
            <button
              key={dish.id}
              onClick={() => onSelect(dish)}
              className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-brand-50 transition-colors ${alreadyAdded ? 'opacity-50' : ''}`}
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm text-gray-800 truncate">{dish.name}</div>
                <div className="text-xs text-gray-400 flex gap-1.5 flex-wrap">
                  {dish.protein.join(', ')}
                  {dish.carb.length > 0 && <span>· {dish.carb.join(', ')}</span>}
                  {last && <span>· {last.slice(0, 7)}</span>}
                  {dish.ingredients.length === 0 && (
                    <span className="text-amber-400">· ⚠️ inga ingredienser</span>
                  )}
                </div>
              </div>
              {pop > 0 && <span className="text-xs text-gray-300 shrink-0">×{pop}</span>}
              {alreadyAdded && <span className="text-xs text-brand-400 shrink-0">Tillagd</span>}
            </button>
          )
        })}
        {filtered.length === 0 && (
          <p className="text-sm text-gray-400 py-6 text-center">Inga rätter matchar.</p>
        )}
      </div>
    </Modal>
  )
}
