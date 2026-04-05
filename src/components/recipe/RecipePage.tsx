import { useState, useMemo } from 'react'
import { Search, CalendarDays, X } from 'lucide-react'
import { useLibraryStore } from '../../store/libraryStore'
import { useWeekStore } from '../../store/weekStore'
import { useIsDesktop } from '../../hooks/useDevice'
import type { Dish } from '../../types'
import RecipeDetail from './RecipeDetail'

export default function RecipePage() {
  const isDesktop = useIsDesktop()
  const dishes = useLibraryStore(s => s.dishes)
  const activeWeekId = useWeekStore(s => s.activeWeekId)
  const weeks = useWeekStore(s => s.weeks)

  const [search, setSearch] = useState('')
  const [weekFilter, setWeekFilter] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Dish IDs scheduled in the active week
  const weekDishIds = useMemo(() => {
    const plan = weeks[activeWeekId]
    if (!plan) return new Set<string>()
    const ids = new Set<string>()
    for (const meal of plan.meals) {
      if (meal.dishId) ids.add(meal.dishId)
    }
    return ids
  }, [weeks, activeWeekId])

  const filtered = useMemo(() => {
    let list = dishes
    if (weekFilter) list = list.filter(d => weekDishIds.has(d.id))
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(d => d.name.toLowerCase().includes(q))
    }
    return [...list].sort((a, b) => a.name.localeCompare(b.name, 'sv'))
  }, [dishes, search, weekFilter, weekDishIds])

  const selectedDish = dishes.find(d => d.id === selectedId) ?? null

  // Portions planned for the selected dish this week
  const plannedPortions = useMemo(() => {
    if (!selectedId) return null
    const plan = weeks[activeWeekId]
    if (!plan) return null
    for (const meal of plan.meals) {
      if (meal.dishId === selectedId) return meal.portions
    }
    return null
  }, [selectedId, weeks, activeWeekId])

  function handleSelect(dish: Dish) {
    setSelectedId(dish.id)
  }

  // On mobile, show detail if selected
  if (!isDesktop && selectedDish) {
    return (
      <RecipeDetail
        dish={selectedDish}
        plannedPortions={plannedPortions}
        onBack={() => setSelectedId(null)}
      />
    )
  }

  const listPanel = (
    <div className="flex flex-col h-full">
      {/* Search + filter bar */}
      <div className="p-3 space-y-2 border-b border-gray-200 bg-white">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Sök recept…"
            className="w-full pl-8 pr-8 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <button
          onClick={() => setWeekFilter(v => !v)}
          className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors ${
            weekFilter
              ? 'bg-brand-100 border-brand-300 text-brand-700'
              : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          <CalendarDays className="w-3.5 h-3.5" />
          Veckans rätter
          {weekFilter && <span className="ml-0.5 font-semibold">({weekDishIds.size})</span>}
        </button>
      </div>

      {/* Dish list */}
      <ul className="flex-1 overflow-y-auto divide-y divide-gray-100">
        {filtered.length === 0 && (
          <li className="p-6 text-center text-sm text-gray-400">
            {weekFilter && weekDishIds.size === 0
              ? 'Inga rätter planerade den här veckan'
              : 'Inga recept hittades'}
          </li>
        )}
        {filtered.map(dish => (
          <li key={dish.id}>
            <button
              onClick={() => handleSelect(dish)}
              className={`w-full text-left px-4 py-2.5 hover:bg-gray-50 transition-colors flex items-center justify-between gap-2 ${
                selectedId === dish.id ? 'bg-brand-50 border-l-2 border-brand-500' : ''
              }`}
            >
              <span className="text-sm font-medium text-gray-800 truncate">{dish.name}</span>
              {weekDishIds.has(dish.id) && (
                <span className="shrink-0 text-xs bg-brand-100 text-brand-700 rounded-full px-1.5 py-0.5">
                  denna vecka
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )

  if (isDesktop) {
    return (
      <div className="flex h-full -m-6 overflow-hidden">
        {/* Recipe list sidebar */}
        <aside className="w-64 shrink-0 border-r border-gray-200 bg-white flex flex-col overflow-hidden">
          {listPanel}
        </aside>

        {/* Recipe detail */}
        <div className="flex-1 overflow-hidden bg-gray-50">
          {selectedDish ? (
            <RecipeDetail
              dish={selectedDish}
              plannedPortions={plannedPortions}
              onBack={null}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              Välj ett recept
            </div>
          )}
        </div>
      </div>
    )
  }

  // Mobile: list view
  return <div className="flex flex-col h-full bg-white">{listPanel}</div>
}
