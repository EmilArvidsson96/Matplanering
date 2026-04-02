import { useState, useMemo } from 'react'
import { useLibraryStore } from '../../store/libraryStore'
import { useWeekStore } from '../../store/weekStore'
import { dishPopularity, dishLastCooked, dayOfYear } from '../../utils/weekUtils'
import Modal from '../common/Modal'
import type { Dish, Protein, Carb, SortOrder } from '../../types'

const PROTEIN_LABELS: Record<Protein, string> = {
  kyckling: 'Kyckling', nöt: 'Nöt', fläsk: 'Fläsk', fisk: 'Fisk',
  skaldjur: 'Skaldjur', lamm: 'Lamm', vilt: 'Vilt',
  vegetarisk: 'Vegetarisk', vegan: 'Vegan',
}
const CARB_LABELS: Record<Carb, string> = {
  ris: 'Ris', pasta: 'Pasta', potatis: 'Potatis',
  nudlar: 'Nudlar', bröd: 'Bröd', ingen: 'Lågkolhydrat',
}

interface Props {
  onSelect: (dish: Dish) => void
  onClose: () => void
  weekMealIds: string[]
}

export default function DishPicker({ onSelect, onClose, weekMealIds }: Props) {
  const { dishes } = useLibraryStore()
  const weeks = Object.values(useWeekStore().weeks)

  const [search, setSearch]           = useState('')
  const [proteins, setProteins]       = useState<Set<Protein>>(new Set())
  const [carbs, setCarbs]             = useState<Set<Carb>>(new Set())
  const [sort, setSort]               = useState<SortOrder>('alfabetisk')

  const today = new Date().toISOString().slice(0, 10)

  const filtered = useMemo(() => {
    let list = dishes.filter(d => {
      if (search && !d.name.toLowerCase().includes(search.toLowerCase())) return false
      if (proteins.size && !d.protein.some(p => proteins.has(p))) return false
      if (carbs.size    && !d.carb.some(c => carbs.has(c)))       return false
      return true
    })

    list = [...list].sort((a, b) => {
      if (sort === 'alfabetisk')   return a.name.localeCompare(b.name, 'sv')
      if (sort === 'popularitet') {
        return dishPopularity(b.id, weeks) - dishPopularity(a.id, weeks)
      }
      // säsong: closest day-of-year to today
      const todayDoy = dayOfYear(today)
      const lastA = dishLastCooked(a.id, weeks)
      const lastB = dishLastCooked(b.id, weeks)
      const proxA = lastA ? Math.abs(dayOfYear(lastA) - todayDoy) : 999
      const proxB = lastB ? Math.abs(dayOfYear(lastB) - todayDoy) : 999
      return proxA - proxB
    })

    return list
  }, [dishes, search, proteins, carbs, sort, weeks, today])

  function toggle<T>(set: Set<T>, value: T): Set<T> {
    const next = new Set(set)
    next.has(value) ? next.delete(value) : next.add(value)
    return next
  }

  return (
    <Modal title="Välj rätt från biblioteket" onClose={onClose} wide>
      {/* Search */}
      <div className="flex gap-2 mb-4">
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
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-300"
        >
          <option value="alfabetisk">A–Ö</option>
          <option value="popularitet">Populärast</option>
          <option value="säsong">Säsong</option>
        </select>
      </div>

      {/* Protein filters */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {(Object.keys(PROTEIN_LABELS) as Protein[]).map(p => (
          <FilterChip
            key={p}
            label={PROTEIN_LABELS[p]}
            active={proteins.has(p)}
            onClick={() => setProteins(toggle(proteins, p))}
          />
        ))}
      </div>

      {/* Carb filters */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {(Object.keys(CARB_LABELS) as Carb[]).map(c => (
          <FilterChip
            key={c}
            label={CARB_LABELS[c]}
            active={carbs.has(c)}
            onClick={() => setCarbs(toggle(carbs, c))}
          />
        ))}
      </div>

      {/* Results */}
      <p className="text-xs text-gray-400 mb-2">{filtered.length} rätter</p>
      <div className="space-y-1">
        {filtered.map(dish => {
          const alreadyAdded = weekMealIds.includes(dish.id)
          const pop = dishPopularity(dish.id, weeks)
          const lastCooked = dishLastCooked(dish.id, weeks)
          return (
            <button
              key={dish.id}
              onClick={() => onSelect(dish)}
              className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl
                hover:bg-brand-50 transition-colors
                ${alreadyAdded ? 'opacity-50' : ''}`}
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm text-gray-800 truncate">{dish.name}</div>
                <div className="text-xs text-gray-400 flex gap-2 flex-wrap">
                  {dish.protein.map(p => PROTEIN_LABELS[p]).join(', ')}
                  {dish.carb.length > 0 && <span>· {dish.carb.join(', ')}</span>}
                  {lastCooked && <span>· Senast {lastCooked.slice(0, 7)}</span>}
                </div>
              </div>
              {pop > 0 && (
                <span className="text-xs text-gray-300 shrink-0">×{pop}</span>
              )}
              {alreadyAdded && (
                <span className="text-xs text-brand-400 shrink-0">Tillagd</span>
              )}
            </button>
          )
        })}
        {filtered.length === 0 && (
          <p className="text-sm text-gray-400 py-6 text-center">Inga rätter matchar filtret.</p>
        )}
      </div>
    </Modal>
  )
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-2.5 py-1 rounded-full border transition-colors font-medium
        ${active
          ? 'bg-brand-600 text-white border-brand-600'
          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
        }`}
    >
      {label}
    </button>
  )
}
