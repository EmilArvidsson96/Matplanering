import { addDays, format, parseISO, getISOWeek, getYear } from 'date-fns'
import { sv } from 'date-fns/locale'
import type { ScheduleSlot, WeekPlan, PlannedMeal } from '../types'

/** Returns the most recent Saturday on or before `date`. */
export function getSaturdayOf(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay() // 0=Sun … 6=Sat
  const diff = day === 6 ? 0 : -(day + 1)
  d.setDate(d.getDate() + diff)
  return d
}

/** Format a Saturday date as week ID string "YYYY-MM-DD". */
export function toWeekId(saturday: Date): string {
  return format(saturday, 'yyyy-MM-dd')
}

export function currentWeekId(): string {
  return toWeekId(getSaturdayOf(new Date()))
}

export function prevWeekId(id: string): string {
  return toWeekId(addDays(parseISO(id), -7))
}

export function nextWeekId(id: string): string {
  return toWeekId(addDays(parseISO(id), 7))
}

/** 7 date strings for the week starting at `startDate`. */
export function weekDates(startDate: string): string[] {
  const start = parseISO(startDate)
  return Array.from({ length: 7 }, (_, i) => format(addDays(start, i), 'yyyy-MM-dd'))
}

export function formatWeekLabel(weekId: string): string {
  const start = parseISO(weekId)
  const end = addDays(start, 6)
  const startStr = format(start, 'd MMM', { locale: sv })
  const endStr = format(end, 'd MMM yyyy', { locale: sv })
  const week = getISOWeek(start)
  return `v.${week} · ${startStr} – ${endStr}`
}

export function formatDayLabel(date: string): string {
  return format(parseISO(date), 'EEEE d MMM', { locale: sv })
}

export function formatDayShort(date: string): string {
  return format(parseISO(date), 'EEE d/M', { locale: sv })
}

export function createEmptyWeek(startDate: string, householdSize: number): WeekPlan {
  const dates = weekDates(startDate)
  const schedule: ScheduleSlot[] = []

  dates.forEach((date, i) => {
    if (i === 0) {
      // Saturday: middag only (lunch = last week's leftovers)
      schedule.push({ date, type: 'middag', assignedMealIds: [], portionsNeeded: householdSize, event: '' })
    } else {
      schedule.push({ date, type: 'lunch',  assignedMealIds: [], portionsNeeded: householdSize, event: '' })
      schedule.push({ date, type: 'middag', assignedMealIds: [], portionsNeeded: householdSize, event: '' })
    }
  })

  return {
    id: startDate,
    startDate,
    endDate: dates[6],
    householdSize,
    meals: [],
    schedule,
    shoppingList: [],
  }
}

/** Running portion balance after each schedule slot.
 *
 * Algorithm:
 *  - Remainder meals contribute their portions at the very start (before any slot).
 *  - Non-remainder meals contribute their portions at the slot they are assigned to.
 *  - Each slot consumes `portionsNeeded` portions.
 *  - Balance is recorded *after* the slot's consumption.
 */
export function computeBalances(week: WeekPlan): Map<string, number> {
  const portionsByMeal = new Map(week.meals.map(m => [m.id, m.portions]))

  // Remainder meals start available immediately.
  let balance = week.meals
    .filter(m => m.isRemainder)
    .reduce((s, m) => s + m.portions, 0)

  const result = new Map<string, number>()

  for (const slot of week.schedule) {
    const key = slotKey(slot)
    // Add portions for non-remainder meals cooked at this slot.
    for (const mealId of slot.assignedMealIds) {
      const meal = week.meals.find(m => m.id === mealId)
      if (meal && !meal.isRemainder) {
        balance += portionsByMeal.get(mealId) ?? 0
      }
    }
    balance -= slot.portionsNeeded
    result.set(key, balance)
  }

  return result
}

export function slotKey(slot: ScheduleSlot): string {
  return `${slot.date}-${slot.type}`
}

export function totalPlannedPortions(meals: PlannedMeal[]): number {
  return meals.filter(m => !m.isRemainder).reduce((s, m) => s + m.portions, 0)
}

export function totalNeededPortions(schedule: ScheduleSlot[]): number {
  return schedule.reduce((s, sl) => s + sl.portionsNeeded, 0)
}

export function remainderPortions(meals: PlannedMeal[]): number {
  return meals.filter(m => m.isRemainder).reduce((s, m) => s + m.portions, 0)
}

/** How many times a dish has been cooked (from all weeks stored locally). */
export function dishPopularity(dishId: string, weeks: WeekPlan[]): number {
  return weeks.reduce((count, week) =>
    count + week.meals.filter(m => m.dishId === dishId && !m.isRemainder).length, 0)
}

/** The most recent week a dish was cooked, for seasonal sorting. */
export function dishLastCooked(dishId: string, weeks: WeekPlan[]): string | null {
  const ids = weeks
    .filter(w => w.meals.some(m => m.dishId === dishId))
    .map(w => w.id)
    .sort()
  return ids.length ? ids[ids.length - 1] : null
}

/** Day-of-year number for seasonal proximity sorting. */
export function dayOfYear(dateStr: string): number {
  const d = parseISO(dateStr)
  const start = new Date(getYear(d), 0, 0)
  return Math.floor((d.getTime() - start.getTime()) / 86400000)
}
