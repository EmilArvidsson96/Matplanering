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

/** All unique dates in a WeekPlan's schedule, in order. */
export function scheduleDates(week: WeekPlan): string[] {
  return [...new Set(week.schedule.map(s => s.date))]
}

export function formatWeekLabel(weekId: string): string {
  const start = parseISO(weekId)
  const end = addDays(start, 7)   // next Saturday
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

/**
 * Default schedule: Sat Middag → next Sat Lunch (8 days, 14 slots).
 *
 * Day 0 (Sat start): Middag only
 * Day 1–6 (Sun–Fri): Lunch + Middag
 * Day 7 (Sat end):   Lunch only
 */
export function createEmptyWeek(startDate: string, householdSize: number): WeekPlan {
  const start = parseISO(startDate)
  const schedule: ScheduleSlot[] = []

  for (let i = 0; i <= 7; i++) {
    const date = format(addDays(start, i), 'yyyy-MM-dd')
    if (i === 0) {
      schedule.push({ date, type: 'middag', assignedMealIds: [], portionsNeeded: householdSize, event: '' })
    } else if (i === 7) {
      schedule.push({ date, type: 'lunch', assignedMealIds: [], portionsNeeded: householdSize, event: '' })
    } else {
      schedule.push({ date, type: 'lunch',  assignedMealIds: [], portionsNeeded: householdSize, event: '' })
      schedule.push({ date, type: 'middag', assignedMealIds: [], portionsNeeded: householdSize, event: '' })
    }
  }

  const endDate = format(addDays(start, 7), 'yyyy-MM-dd')
  return { id: startDate, startDate, endDate, householdSize, meals: [], schedule, shoppingList: [] }
}

/** Add a day's slots (lunch + middag, or just one) at the end of the schedule. */
export function addDayToSchedule(week: WeekPlan, mealTypes: ('lunch' | 'middag')[]): WeekPlan {
  const lastDate = week.schedule[week.schedule.length - 1]?.date ?? week.endDate
  const newDate  = format(addDays(parseISO(lastDate), 1), 'yyyy-MM-dd')
  const newSlots = mealTypes.map(type => ({
    date: newDate, type, assignedMealIds: [], portionsNeeded: week.householdSize, event: '',
  }))
  return { ...week, endDate: newDate, schedule: [...week.schedule, ...newSlots] }
}

/** Remove the last day entirely from the schedule. */
export function removLastDayFromSchedule(week: WeekPlan): WeekPlan {
  const dates = scheduleDates(week)
  if (dates.length <= 1) return week
  const lastDate = dates[dates.length - 1]
  const newSchedule = week.schedule.filter(s => s.date !== lastDate)
  const newEnd = newSchedule[newSchedule.length - 1]?.date ?? week.startDate
  return { ...week, endDate: newEnd, schedule: newSchedule }
}

/** Running portion balance after each schedule slot. */
export function computeBalances(week: WeekPlan): Map<string, number> {
  const portionsByMeal = new Map(week.meals.map(m => [m.id, m.portions]))

  let balance = week.meals
    .filter(m => m.isRemainder)
    .reduce((s, m) => s + m.portions, 0)

  const result = new Map<string, number>()

  for (const slot of week.schedule) {
    const key = slotKey(slot)
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

export function dishPopularity(dishId: string, weeks: WeekPlan[]): number {
  return weeks.reduce((count, week) =>
    count + week.meals.filter(m => m.dishId === dishId && !m.isRemainder).length, 0)
}

export function dishLastCooked(dishId: string, weeks: WeekPlan[]): string | null {
  const ids = weeks
    .filter(w => w.meals.some(m => m.dishId === dishId))
    .map(w => w.id)
    .sort()
  return ids.length ? ids[ids.length - 1] : null
}

/** Most common month (1–12) this dish has been cooked, based on history. */
export function dishMostCommonMonth(dishId: string, weeks: WeekPlan[]): number | null {
  const counts = new Array(13).fill(0)
  for (const week of weeks) {
    if (week.meals.some(m => m.dishId === dishId && !m.isRemainder)) {
      const month = parseISO(week.id).getMonth() + 1
      counts[month]++
    }
  }
  const max = Math.max(...counts.slice(1))
  if (max === 0) return null
  return counts.indexOf(max)
}

export function dayOfYear(dateStr: string): number {
  const d = parseISO(dateStr)
  const start = new Date(getYear(d), 0, 0)
  return Math.floor((d.getTime() - start.getTime()) / 86400000)
}

export const MONTH_NAMES = [
  '', 'Jan','Feb','Mar','Apr','Maj','Jun','Jul','Aug','Sep','Okt','Nov','Dec',
]

/**
 * Migrate a week plan that was saved with the old 7-day structure (Sat–Fri).
 * Regenerates the schedule slots to the correct 8-day window (Sat dinner → next Sat lunch)
 * while preserving meals, events, portionsNeeded overrides, and meal assignments
 * on slots that still exist in the new structure.
 */
export function migrateWeek(plan: WeekPlan): WeekPlan {
  const expectedEnd = format(addDays(parseISO(plan.startDate), 7), 'yyyy-MM-dd')
  if (plan.endDate === expectedEnd) return plan   // already correct

  const fresh = createEmptyWeek(plan.startDate, plan.householdSize)

  // Re-apply any per-slot overrides (portionsNeeded, event, assignedMealIds)
  // from the old schedule where dates/types overlap.
  const oldByKey = new Map(plan.schedule.map(s => [`${s.date}-${s.type}`, s]))
  const mergedSchedule = fresh.schedule.map(slot => {
    const old = oldByKey.get(`${slot.date}-${slot.type}`)
    return old
      ? { ...slot, portionsNeeded: old.portionsNeeded, event: old.event, assignedMealIds: old.assignedMealIds }
      : slot
  })

  return { ...plan, endDate: fresh.endDate, schedule: mergedSchedule }
}
