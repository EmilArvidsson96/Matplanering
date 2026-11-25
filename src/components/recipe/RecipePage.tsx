import { useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, CalendarDays, X } from 'lucide-react'
import { useLibraryStore } from '../../store/libraryStore'
import { useWeekStore } from '../../store/weekStore'
import { useIsDesktop } from '../../hooks/useDevice'
import { componentCookPortions, mealCookPortions, isExtraMeal } from '../../utils/weekUtils'
import type { Dish, ExtraType } from '../../types'
import { ExtraTypeIcon } from '../steps/ExtraCookingSection'

type WeekItem = { key: string; dish: Dish | null; name: string; portions: number; extra: ExtraType | null }
import RecipeDetail from './RecipeDetail'

export default function RecipePage() {
  const isDesktop = useIsDesktop()
  const dishes = useLibraryStore(s => s.dishes)
  const activeWeekId = useWeekStore(s => s.activeWeekId)
  const weeks = useWeekStore(s => s.weeks)

  const [search, setSearch] = useState('')
  const [weekFilter, setWeekFilter] = useState(false)
  // Selection lives in the URL (?dish=<id>) so links from elsewhere in the app
  // (e.g. Veckoplanen) can deep-link straight into a recipe.
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedId = searchParams.get('dish')

  // Dish IDs scheduled in the active week (across all components)
  const weekDishIds = useMemo(() => {
    const plan = weeks[activeWeekId]
    if (!plan) return new Set<string>()
    const ids = new Set<string>()
    for (const meal of plan.meals) {
      for (const comp of meal.components) {
        if (comp.dishId) ids.add(comp.dishId)
      }
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

  // Week meals grouped for the cooking view: combined meals keep their
  // components together under the meal name instead of scattering them
  // across the alphabetical list.
  const weekGroups = useMemo(() => {
    const plan = weeks[activeWeekId]
    if (!plan) return []
    const q = search.trim().toLowerCase()
    const groups: {
      mealId: string
      mealName: string
      isCombo: boolean
      total: number
      items: WeekItem[]
    }[] = []
    for (const meal of plan.meals) {
      // Portions to cook: includes extra for the freezer / baking batches
      const total = mealCookPortions(meal)
      const extra: ExtraType | null = isExtraMeal(meal)
        ? (meal.extraType ?? 'frys')
        : (meal.freezePortions ?? 0) > 0 ? 'frys' : null
      const items = meal.components.map(comp => ({
        key: comp.id,
        dish: comp.dishId ? dishes.find(d => d.id === comp.dishId) ?? null : null,
        name: comp.name,
        portions: Math.round(componentCookPortions(comp, meal)),
        extra,
      }))
      // Nothing cookable (e.g. a free-text "Rester" meal) → skip
      if (!items.some(it => it.dish)) continue
      if (q) {
        const matches =
          meal.name.toLowerCase().includes(q) ||
          items.some(it => it.name.toLowerCase().includes(q))
        if (!matches) continue
      }
      groups.push({
        mealId: meal.id,
        mealName: meal.name,
        isCombo: meal.components.length > 1,
        total,
        items,
      })
    }
    return groups
  }, [weeks, activeWeekId, dishes, search])

  const selectedDish = dishes.find(d => d.id === selectedId) ?? null

  // Portions planned for the selected dish this week
  const plannedPortions = useMemo(() => {
    if (!selectedId) return null
    const plan = weeks[activeWeekId]
    if (!plan) return null
    for (const meal of plan.meals) {
      const comp = meal.components.find(c => c.dishId === selectedId)
      if (comp) return Math.round(componentCookPortions(comp, meal))
    }
    return null
  }, [selectedId, weeks, activeWeekId])

  function handleSelect(dish: Dish) {
    setSearchParams({ dish: dish.id }, { replace: true })
  }

  // On mobile, show detail if selected
  if (!isDesktop && selectedDish) {
    return (
      <RecipeDetail
        dish={selectedDish}
        plannedPortions={plannedPortions}
        onBack={() => setSearchParams({}, { replace: true })}
      />
    )
  }

  function renderItem(it: WeekItem) {
    if (!it.dish) {
      // Free-text component (e.g. a sauce) — shown for context, no recipe to open
      return (
        <li key={it.key} className="px-4 py-2 flex items-center justify-between gap-2 text-gray-400">
          <span className="text-sm truncate">
            {it.name} <span className="text-xs">(fritext)</span>
          </span>
          <span className="text-xs shrink-0">{it.portions}p</span>
        </li>
      )
    }
    const dish = it.dish
    return (
      <li key={it.key}>
        <button
          onClick={() => handleSelect(dish)}
          className={`w-full text-left px-4 py-2.5 hover:bg-gray-50 transition-colors flex items-center justify-between gap-2 ${
            selectedId === dish.id ? 'bg-brand-50 border-l-2 border-brand-500' : ''
          }`}
        >
          <span className="text-sm font-medium text-gray-800 truncate">{dish.name}</span>
          <span className="shrink-0 flex items-center gap-1 text-xs text-gray-400">
            {it.extra && (
              <ExtraTypeIcon
                type={it.extra}
                className={`w-3 h-3 ${it.extra === 'bak' ? 'text-pink-400' : 'text-sky-400'}`}
              />
            )}
            {it.portions}{dish.yieldUnit?.trim() ? ` ${dish.yieldUnit.trim()}` : 'p'}
          </span>
        </button>
      </li>
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
      {weekFilter ? (
        // Cooking view: group each combined meal's components together
        <div className="flex-1 overflow-y-auto">
          {weekGroups.length === 0 ? (
            <p className="p-6 text-center text-sm text-gray-400">
              Inga rätter planerade den här veckan
            </p>
          ) : (
            weekGroups.map(group =>
              group.isCombo ? (
                <div key={group.mealId} className="border-b border-gray-100 py-1">
                  <div className="px-4 pt-1.5 pb-1 flex items-baseline gap-1.5">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide truncate">
                      {group.mealName}
                    </span>
                    <span className="text-[10px] text-gray-400 shrink-0">· {group.total}p</span>
                  </div>
                  <ul className="ml-3 border-l-2 border-brand-100">
                    {group.items.map(it => renderItem(it))}
                  </ul>
                </div>
              ) : (
                <ul key={group.mealId} className="border-b border-gray-100">
                  {group.items.filter(it => it.dish).map(it => renderItem(it))}
                </ul>
              )
            )
          )}
        </div>
      ) : (
        <ul className="flex-1 overflow-y-auto divide-y divide-gray-100">
          {filtered.length === 0 && (
            <li className="p-6 text-center text-sm text-gray-400">
              Inga recept hittades
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
      )}
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
