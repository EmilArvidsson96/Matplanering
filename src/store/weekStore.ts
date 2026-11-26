import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import type { WeekPlan, PlannedMeal, MealComponent, ScheduleSlot, ShoppingItem, MealType, MealAssignment, StepsCompleted } from '../types'
import { record } from './undoStore'
import { currentWeekId, createEmptyWeek, applyWeekWindow, scaleMealComponents } from '../utils/weekUtils'

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
  setWeekWindow: (startDate: string, startMeal: 'lunch' | 'middag', endDate: string, endMeal: 'lunch' | 'middag') => void

  // Meals (brainstorm)
  addMeal: (meal: Omit<PlannedMeal, 'id'>) => string
  updateMeal: (id: string, patch: Partial<PlannedMeal>) => void
  deleteMeal: (id: string) => void
  scaleMealToTotal: (id: string, newTotal: number) => void
  addMealComponent: (id: string, component: Omit<MealComponent, 'id'>) => void
  updateMealComponent: (id: string, componentId: string, patch: Partial<MealComponent>) => void
  removeMealComponent: (id: string, componentId: string) => void

  // Schedule assignment
  assignMeal: (date: string, type: MealType, mealId: string, portions: number) => void
  unassignMeal: (date: string, type: MealType, mealId: string) => void

  // Planning step completion
  markStepCompleted: (step: keyof StepsCompleted) => void
  unmarkStepCompleted: (step: keyof StepsCompleted) => void
  setActualCost: (cost: number | null) => void

  // Shopping list
  addShoppingItem: (item: Omit<ShoppingItem, 'id'>) => void
  updateShoppingItem: (id: string, patch: Partial<ShoppingItem>) => void
  /** Soft delete: the row stays (deletedAt) so it can be restored from Borttagna. */
  deleteShoppingItem: (id: string) => void
  /** Merge: remove these rows for good and add one in their place (one undo step). */
  replaceShoppingItems: (removeIds: string[], add: Omit<ShoppingItem, 'id'>) => void
  /** Bring back a row that was deleted or marked as at home. */
  restoreShoppingItem: (id: string) => void
  /** Patch several rows of a given week at once (used by background jobs). */
  patchShoppingItems: (weekId: string, patches: Record<string, Partial<ShoppingItem>>) => void
  rebuildShoppingFromIngredients: (items: ShoppingItem[]) => void
  dismissMergeSuggestion: (key: string) => void
}

export const useWeekStore = create<WeekStore>((set, get) => {
  function restore(id: string, plan: WeekPlan) {
    set((s) => ({
      weeks: { ...s.weeks, [id]: plan },
      dirtyWeeks: new Set([...s.dirtyWeeks, id]),
    }))
  }

  /** Change the active week and record the change for undo. */
  function mutateActive(fn: (plan: WeekPlan) => WeekPlan, coalesceKey?: string) {
    const id = get().activeWeekId
    const before = get().weeks[id] ?? createEmptyWeek(id, 2)
    const after = fn(before)
    if (after === before) return
    restore(id, after)
    record(() => restore(id, before), () => restore(id, after), coalesceKey && `${id}:${coalesceKey}`)
  }

  /** Typing in a field: merge quick successive edits of the same thing into one undo step. */
  function textKey(id: string, patch: object): string | undefined {
    const vals = Object.values(patch)
    return vals.length > 0 && vals.every((v) => typeof v === 'string')
      ? `${id}:${Object.keys(patch).sort().join(',')}`
      : undefined
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

    setWeekWindow: (startDate, startMeal, endDate, endMeal) =>
      mutateActive((p) => applyWeekWindow(p, startDate, startMeal, endDate, endMeal)),

    updateSlot: (date, type, patch) =>
      mutateActive((p) =>
        mutateSlot(p, date, type, (sl) => ({ ...sl, ...patch })),
      textKey(`${date}:${type}`, patch)),

    addMeal: (meal) => {
      const id = uuid()
      mutateActive((p) => ({
        ...p,
        meals: [...p.meals, { ...meal, id }],
      }))
      return id
    },

    updateMeal: (id, patch) =>
      mutateActive((p) => ({
        ...p,
        meals: p.meals.map((m) => (m.id === id ? { ...m, ...patch } : m)),
      }), textKey(id, patch)),

    deleteMeal: (id) =>
      mutateActive((p) => ({
        ...p,
        meals: p.meals.filter((m) => m.id !== id),
        schedule: p.schedule.map((sl) => ({
          ...sl,
          assignments: (sl.assignments ?? []).filter((a: MealAssignment) => a.mealId !== id),
        })),
      })),

    scaleMealToTotal: (id, newTotal) =>
      mutateActive((p) => ({
        ...p,
        meals: p.meals.map((m) =>
          m.id === id ? { ...m, components: scaleMealComponents(m, newTotal) } : m
        ),
      })),

    addMealComponent: (id, component) =>
      mutateActive((p) => ({
        ...p,
        meals: p.meals.map((m) =>
          m.id === id ? { ...m, components: [...m.components, { ...component, id: uuid() }] } : m
        ),
      })),

    updateMealComponent: (id, componentId, patch) =>
      mutateActive((p) => ({
        ...p,
        meals: p.meals.map((m) =>
          m.id === id
            ? { ...m, components: m.components.map(c => c.id === componentId ? { ...c, ...patch } : c) }
            : m
        ),
      }), textKey(componentId, patch)),

    removeMealComponent: (id, componentId) =>
      mutateActive((p) => ({
        ...p,
        meals: p.meals.map((m) =>
          m.id === id ? { ...m, components: m.components.filter(c => c.id !== componentId) } : m
        ),
      })),

    assignMeal: (date, type, mealId, portions) =>
      mutateActive((p) =>
        mutateSlot(p, date, type, (sl) => {
          if ((sl.assignments ?? []).some((a: MealAssignment) => a.mealId === mealId)) return sl
          return { ...sl, assignments: [...(sl.assignments ?? []), { mealId, portions }] }
        }),
      ),

    unassignMeal: (date, type, mealId) =>
      mutateActive((p) =>
        mutateSlot(p, date, type, (sl) => ({
          ...sl,
          assignments: (sl.assignments ?? []).filter((a: MealAssignment) => a.mealId !== mealId),
        })),
      ),

    markStepCompleted: (step) =>
      mutateActive((p) => ({
        ...p,
        stepsCompleted: { ...p.stepsCompleted, [step]: true },
      })),

    unmarkStepCompleted: (step) =>
      mutateActive((p) => ({
        ...p,
        stepsCompleted: { ...p.stepsCompleted, [step]: false },
      })),

    setActualCost: (cost) =>
      mutateActive((p) => ({ ...p, actualCost: cost })),

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
      }), textKey(id, patch)),

    deleteShoppingItem: (id) =>
      mutateActive((p) => ({
        ...p,
        shoppingList: p.shoppingList.map((it) =>
          it.id === id ? { ...it, deletedAt: new Date().toISOString() } : it,
        ),
      })),

    replaceShoppingItems: (removeIds, add) =>
      mutateActive((p) => ({
        ...p,
        shoppingList: [...p.shoppingList.filter((it) => !removeIds.includes(it.id)), { ...add, id: uuid() }],
      })),

    restoreShoppingItem: (id) =>
      mutateActive((p) => ({
        ...p,
        shoppingList: p.shoppingList.map((it) =>
          it.id === id
            ? { ...it, deletedAt: undefined, isExcluded: false, excludedAt: undefined, excludedReason: undefined, homeAnswer: undefined }
            : it,
        ),
      })),

    patchShoppingItems: (weekId, patches) =>
      set((s) => {
        const plan = s.weeks[weekId]
        if (!plan || Object.keys(patches).length === 0) return s
        return {
          weeks: {
            ...s.weeks,
            [weekId]: {
              ...plan,
              shoppingList: plan.shoppingList.map((it) => patches[it.id] ? { ...it, ...patches[it.id] } : it),
            },
          },
          dirtyWeeks: new Set([...s.dirtyWeeks, weekId]),
        }
      }),

    rebuildShoppingFromIngredients: (items) =>
      mutateActive((p) => {
        // Deleted rows are dropped for good when the list is rebuilt.
        const manual = p.shoppingList.filter((it) => !it.isAutoAdded && !it.deletedAt)
        return { ...p, shoppingList: [...manual, ...items] }
      }),

    dismissMergeSuggestion: (key) =>
      mutateActive((p) => ({
        ...p,
        dismissedMergePairs: [...(p.dismissedMergePairs ?? []), key],
      })),
  }
})

export function activeWeek(store: WeekStore): WeekPlan {
  const id = store.activeWeekId
  return store.weeks[id] ?? createEmptyWeek(id, 2)
}
