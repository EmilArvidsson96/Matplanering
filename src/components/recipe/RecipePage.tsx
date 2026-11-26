import { useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, CalendarDays, X } from 'lucide-react'
import { useLibraryStore } from '../../store/libraryStore'
import { useWeekStore } from '../../store/weekStore'
import { useIsDesktop } from '../../hooks/useDevice'
import { componentCookPortions, mealCookPortions, isExtraMeal } from '../../utils/weekUtils'
import type { Dish, ExtraType } from '../../types'
import { ExtraTypeIcon } from '../steps/ExtraCookingSection'
import DishImage from '../common/DishImage'

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
      <div key={selectedDish.id} className="h-full motion-safe:animate-page-from-right">
        <RecipeDetail
          dish={selectedDish}
          plannedPortions={plannedPortions}
          onBack={() => setSearchParams({}, { replace: true })}
        />
      </div>
    )
  }

  function renderItem(it: WeekItem) {
    if (!it.dish) {
      // Free-text component (e.g. a sauce) — shown for context, no recipe to open
      return (
        <li key={it.key} className="px-4 py-2 flex items-center justify-between gap-2 text-ink-faint">
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
          className={`w-full text-left px-4 min-h-[52px] hover:bg-canvas transition-colors flex items-center justify-between gap-2 ${
            selectedId === dish.id ? 'bg-mint' : ''
          }`}
        >
          <span className="flex items-center gap-3 min-w-0">
            <DishImage dish={dish} className="w-9 h-9 rounded-lg object-cover shrink-0 bg-canvas" fallback={<span className="w-9 h-9 rounded-lg bg-canvas shrink-0" />} />
            <span className="text-[15px] font-medium text-ink truncate">{dish.name}</span>
          </span>
          <span className="shrink-0 flex items-center gap-1 text-xs text-ink-muted">
            {it.extra && (
              <ExtraTypeIcon
                type={it.extra}
                className={`w-3.5 h-3.5 ${it.extra === 'bak' ? 'text-pink-600' : 'text-sky-600'}`}
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
      <div className="px-4 pt-4 pb-3 space-y-3 border-b border-line-soft">
        <h1 className="font-display text-[32px] font-extrabold tracking-tight leading-none md:text-2xl">Recept</h1>
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-ink-muted" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Sök recept…"
            className="field pl-11 pr-10 rounded-full bg-white border-line md:bg-canvas md:border-transparent"
          />
          {search && (
            <button onClick={() => setSearch('')} aria-label="Rensa sökning" className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-ink-muted hover:text-ink">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <button
          onClick={() => setWeekFilter(v => !v)}
          className={`chip ${weekFilter ? 'chip-on' : 'chip-off'}`}
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
            <p className="p-6 text-center text-sm text-ink-faint">
              Inga rätter planerade den här veckan
            </p>
          ) : (
            weekGroups.map(group =>
              group.isCombo ? (
                <div key={group.mealId} className="border-b border-line-soft py-1">
                  <div className="px-4 pt-1.5 pb-1 flex items-baseline gap-1.5">
                    <span className="eyebrow truncate">
                      {group.mealName}
                    </span>
                    <span className="text-[10px] text-ink-faint shrink-0">· {group.total}p</span>
                  </div>
                  <ul className="ml-3 border-l-2 border-brand-100">
                    {group.items.map(it => renderItem(it))}
                  </ul>
                </div>
              ) : (
                <ul key={group.mealId} className="border-b border-line-soft">
                  {group.items.filter(it => it.dish).map(it => renderItem(it))}
                </ul>
              )
            )
          )}
        </div>
      ) : (
        <ul className="flex-1 overflow-y-auto divide-y divide-line-soft">
          {filtered.length === 0 && (
            <li className="p-6 text-center text-sm text-ink-faint">
              Inga recept hittades
            </li>
          )}
          {filtered.map(dish => (
            <li key={dish.id}>
              <button
                onClick={() => handleSelect(dish)}
                className={`w-full text-left px-4 min-h-[52px] hover:bg-canvas transition-colors flex items-center justify-between gap-2 ${
                  selectedId === dish.id ? 'bg-mint' : ''
                }`}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <DishImage dish={dish} className="w-9 h-9 rounded-lg object-cover shrink-0 bg-canvas" fallback={<span className="w-9 h-9 rounded-lg bg-canvas shrink-0" />} />
                  <span className="text-[15px] font-medium text-ink truncate">{dish.name}</span>
                </span>
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
      <div className="flex h-full overflow-hidden">
        {/* Recipe list sidebar */}
        <aside className="w-72 shrink-0 border-r border-line-soft bg-white flex flex-col overflow-hidden">
          {listPanel}
        </aside>

        {/* Recipe detail */}
        <div className="flex-1 overflow-hidden bg-canvas">
          {selectedDish ? (
            <div key={selectedDish.id} className="h-full motion-safe:animate-fade-up">
            <RecipeDetail
              dish={selectedDish}
              plannedPortions={plannedPortions}
              onBack={null}
            />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-ink-faint text-sm">
              Välj ett recept
            </div>
          )}
        </div>
      </div>
    )
  }

  // Mobile: list view
  return <div className="flex flex-col h-full motion-safe:animate-page-from-left">{listPanel}</div>
}
