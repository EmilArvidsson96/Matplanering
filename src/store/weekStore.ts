import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import type { WeekPlan, PlannedMeal, ScheduleSlot, ShoppingItem, MealType } from '../types'
import { currentWeekId, createEmptyWeek } from '../utils/weekUtils'

interface WeekStore {
  weeks: Record<string, WeekPlan>       // weekId -> WeekPlan
  shas: Record<string, string | undefined>  // weekId -> GitHub SHA
  dirtyWeeks: Set<string>
  activeWeekId: string

  // Navigation
  setActiveWeek: (id: string) => void

  // Load / persist
  loadWeek: (plan: WeekPlan, sha: string | undefined) => void
  markClean: (weekId: string, sha: string | undefined) => void

  // Active week helpers (all mutations mark week as dirty)
  updateHouseholdSize: (size: number) => void
  updateSlot: (date: string, type: MealType, patch: Partial<Omit<ScheduleSlot, 'date' | 'type'>>) => void

  // Meals (brainstorm)
  addMeal: (meal: Omit<PlannedMeal, 'id'>) => string
  updateMeal: (id: string, patch: Partial<PlannedMeal>) => void
  deleteMeal: (id: string) => void

  // Schedule assignment
  assignMeal: (date: string, type: MealType, mealId: string) => void
  unassignMeal: (date: string, type: MealType, mealId: string) => void

  // Shopping list
  addShoppingItem: (item: Omit<ShoppingItem, 'id'>) => void
  updateShoppingItem: (id: string, patch: Partial<ShoppingItem>) => void
  deleteShoppingItem: (id: string) => void
  rebuildShoppingFromIngredients: (items: ShoppingItem[]) => void
}

export const useWeekStore = create<WeekStore>((set, get) => {
  function mutateActive(fn: (plan: WeekPlan) => WeekPlan) {
    const id = get().activeWeekId
    set((s) => {
      const plan = s.weeks[id] ?? createEmptyWeek(id, 2)
      return {
        weeks: { ...s.weeks, [id]: fn(plan) },
        dirtyWeeks: new Set([...s.dirtyWeeks, id]),
      }
    })
  }

  function mutateSlot(
    plan: WeekPlan,
    date: string,
    type: MealType,
    fn: (slot: ScheduleSlot) => ScheduleSlot,
  ): WeekPlan {
    return {
      ...plan,
      schedule: plan.schedule.map((sl) =>
        sl.date === date && sl.type === type ? fn(sl) : sl,
      ),
    }
  }

  return {
    weeks: {},
    shas: {},
    dirtyWeeks: new Set(),
    activeWeekId: currentWeekId(),

    setActiveWeek: (id) => set({ activeWeekId: id }),

    loadWeek: (plan, sha) =>
      set((s) => ({
        weeks: { ...s.weeks, [plan.id]: plan },
        shas: { ...s.shas, [plan.id]: sha },
        dirtyWeeks: new Set([...s.dirtyWeeks].filter((id) => id !== plan.id)),
      })),

    markClean: (weekId, sha) =>
      set((s) => {
        const dirty = new Set(s.dirtyWeeks)
        dirty.delete(weekId)
        return {
          shas: { ...s.shas, [weekId]: sha },
          dirtyWeeks: dirty,
        }
      }),

    updateHouseholdSize: (size) =>
      mutateActive((p) => ({ ...p, householdSize: size })),

    updateSlot: (date, type, patch) =>
      mutateActive((p) =>
        mutateSlot(p, date, type, (sl) => ({ ...sl, ...patch })),
      ),

    addMeal: (meal) => {
      const id = uuid()
      mutateActive((p) => ({ ...p, meals: [...p.meals, { ...meal, id }] }))
      return id
    },

    updateMeal: (id, patch) =>
      mutateActive((p) => ({
        ...p,
        meals: p.meals.map((m) => (m.id === id ? { ...m, ...patch } : m)),
      })),

    deleteMeal: (id) =>
      mutateActive((p) => ({
        ...p,
        meals: p.meals.filter((m) => m.id !== id),
        schedule: p.schedule.map((sl) => ({
          ...sl,
          assignedMealIds: sl.assignedMealIds.filter((mid) => mid !== id),
        })),
      })),

    assignMeal: (date, type, mealId) =>
      mutateActive((p) =>
        mutateSlot(p, date, type, (sl) =>
          sl.assignedMealIds.includes(mealId)
            ? sl
            : { ...sl, assignedMealIds: [...sl.assignedMealIds, mealId] },
        ),
      ),

    unassignMeal: (date, type, mealId) =>
      mutateActive((p) =>
        mutateSlot(p, date, type, (sl) => ({
          ...sl,
          assignedMealIds: sl.assignedMealIds.filter((id) => id !== mealId),
        })),
      ),

    addShoppingItem: (item) =>
      mutateActive((p) => ({
        ...p,
        shoppingList: [...p.shoppingList, { ...item, id: uuid() }],
      })),

    updateShoppingItem: (id, patch) =>
      mutateActive((p) => ({
        ...p,
        shoppingList: p.shoppingList.map((it) =>
          it.id === id ? { ...it, ...patch } : it,
        ),
      })),

    deleteShoppingItem: (id) =>
      mutateActive((p) => ({
        ...p,
        shoppingList: p.shoppingList.filter((it) => it.id !== id),
      })),

    rebuildShoppingFromIngredients: (items) =>
      mutateActive((p) => {
        const manual = p.shoppingList.filter((it) => !it.isAutoAdded)
        return { ...p, shoppingList: [...manual, ...items] }
      }),
  }
})

export function activeWeek(store: WeekStore): WeekPlan {
  const id = store.activeWeekId
  return store.weeks[id] ?? createEmptyWeek(id, 2)
}
