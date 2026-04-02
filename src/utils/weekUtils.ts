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

export interface WeekWindowOpts {
  startDate?: string      // defaults to weekId (Saturday)
  startMeal?: 'lunch' | 'middag'  // defaults to 'middag'
  endDate?: string        // defaults to weekId + 7 days
  endMeal?: 'lunch' | 'middag'    // defaults to 'lunch'
}

/**
 * Build a WeekPlan schedule for any arbitrary window.
 * weekId = the stable Saturday identifier used for storage/navigation.
 * startDate/endDate can be any dates; startMeal/endMeal define the first/last slot.
 *
 * First day: only slots from startMeal onwards (dinner-only if startMeal='middag')
 * Middle days: lunch + dinner
 * Last day: only slots up to endMeal (lunch-only if endMeal='lunch')
 */
export function createEmptyWeek(weekId: string, householdSize: number, opts: WeekWindowOpts = {}): WeekPlan {
  const startDate  = opts.startDate ?? weekId
  const startMeal  = opts.startMeal ?? 'middag'
  const endDate    = opts.endDate   ?? format(addDays(parseISO(weekId), 7), 'yyyy-MM-dd')
  const endMeal    = opts.endMeal   ?? 'lunch'

  const schedule: ScheduleSlot[] = []
  let current = parseISO(startDate)
  const end   = parseISO(endDate)

  while (current <= end) {
    const date    = format(current, 'yyyy-MM-dd')
    const isFirst = date === startDate
    const isLast  = date === endDate
    const hasLunch  = !isFirst || startMeal === 'lunch'
    const hasDinner = !isLast  || endMeal   === 'middag'
    if (hasLunch)  schedule.push({ date, type: 'lunch',  assignments: [], portionsNeeded: householdSize, event: '' })
    if (hasDinner) schedule.push({ date, type: 'middag', assignments: [], portionsNeeded: householdSize, event: '' })
    current = addDays(current, 1)
  }

  return {
    id: weekId, startDate, startMealType: startMeal,
    endDate, endMealType: endMeal,
    householdSize, meals: [], schedule, shoppingList: [],
  }
}

/**
 * Compute the default window for the next planning cycle after prevWeek.
 *
 * Normal case (prev ends on/before its natural Saturday):
 *   → Standard Saturday dinner → next-next Saturday lunch.
 *
 * Extended case (prev ends after its natural Saturday, e.g. Sunday/Monday):
 *   → Start from the meal immediately after prev week's end.
 *   → End on the next Saturday at lunch (to get back on the standard cadence).
 */
export function nextWeekWindow(prevWeek: WeekPlan): WeekWindowOpts & { weekId: string } {
  const naturalEndSat = format(addDays(parseISO(prevWeek.id), 7), 'yyyy-MM-dd')
  const nextId        = naturalEndSat   // next week's stable Saturday ID

  if (prevWeek.endDate <= naturalEndSat) {
    // Standard next week
    return {
      weekId: nextId,
      startDate: nextId,
      startMeal: 'middag',
      endDate: format(addDays(parseISO(nextId), 7), 'yyyy-MM-dd'),
      endMeal: 'lunch',
    }
  }

  // Extended: start from next meal after prev end
  let nextStart: string
  let nextStartMeal: 'lunch' | 'middag'
  if (prevWeek.endMealType === 'middag') {
    nextStart     = format(addDays(parseISO(prevWeek.endDate), 1), 'yyyy-MM-dd')
    nextStartMeal = 'lunch'
  } else {
    nextStart     = prevWeek.endDate
    nextStartMeal = 'middag'
  }

  // End on the Saturday on-or-after nextStart (min 1 day away), at lunch
  const startParsed  = parseISO(nextStart)
  const dayOfWeek    = startParsed.getDay()           // 0=Sun … 6=Sat
  const daysToSat    = dayOfWeek === 6 ? 7 : (6 - dayOfWeek + 7) % 7 || 7
  const nextEnd      = format(addDays(startParsed, daysToSat), 'yyyy-MM-dd')

  return { weekId: nextId, startDate: nextStart, startMeal: nextStartMeal, endDate: nextEnd, endMeal: 'lunch' }
}

/** Rebuild the schedule for a week after changing start/end date or meal type. Preserves existing slot data. */
export function applyWeekWindow(
  week: WeekPlan,
  startDate: string,
  startMeal: 'lunch' | 'middag',
  endDate: string,
  endMeal: 'lunch' | 'middag',
): WeekPlan {
  const fresh     = createEmptyWeek(week.id, week.householdSize, { startDate, startMeal, endDate, endMeal })
  const oldByKey  = new Map(week.schedule.map(s => [`${s.date}-${s.type}`, s]))
  const merged    = fresh.schedule.map(slot => {
    const old = oldByKey.get(`${slot.date}-${slot.type}`)
    return old ? { ...slot, portionsNeeded: old.portionsNeeded, event: old.event, assignments: old.assignments } : slot
  })
  return { ...week, startDate, startMealType: startMeal, endDate, endMealType: endMeal, schedule: merged }
}

/** @deprecated – use applyWeekWindow. Kept for internal migration use. */
export function addDayToSchedule(week: WeekPlan, _mealTypes: ('lunch' | 'middag')[]): WeekPlan {
  const newEnd  = format(addDays(parseISO(week.endDate), 1), 'yyyy-MM-dd')
  return applyWeekWindow(week, week.startDate, week.startMealType ?? 'middag', newEnd, 'middag')
}

/** @deprecated – use applyWeekWindow. */
export function removLastDayFromSchedule(week: WeekPlan): WeekPlan {
  const dates = scheduleDates(week)
  if (dates.length <= 1) return week
  const newEnd = dates[dates.length - 2]
  return applyWeekWindow(week, week.startDate, week.startMealType ?? 'middag', newEnd, 'middag')
}

/** Running portion balance after each schedule slot. */
export function computeBalances(week: WeekPlan): Map<string, number> {
  let balance = week.meals
    .filter(m => m.isRemainder)
    .reduce((s, m) => s + m.portions, 0)

  const result = new Map<string, number>()

  for (const slot of week.schedule) {
    const key = slotKey(slot)
    for (const { mealId, portions } of slot.assignments) {
      const meal = week.meals.find(m => m.id === mealId)
      if (meal && !meal.isRemainder) {
        balance += portions   // only the portions cooked at this specific slot
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
 * Migrate a week plan saved with the old structure (pre startMealType/endMealType fields,
 * or old 7-day Sat–Fri window). Adds missing fields and regenerates the schedule if needed.
 */
export function migrateWeek(plan: WeekPlan): WeekPlan {
  // 1. Convert old assignedMealIds → assignments
  const migratedSchedule = plan.schedule.map(slot => {
    const s = slot as ScheduleSlot & { assignedMealIds?: string[] }
    if (s.assignedMealIds && !s.assignments?.length) {
      const assignments = s.assignedMealIds.map(mealId => ({
        mealId,
        portions: plan.meals.find(m => m.id === mealId)?.portions ?? 1,
      }))
      const { assignedMealIds: _dropped, ...rest } = s as typeof s & Record<string, unknown>
      return { ...rest, assignments } as ScheduleSlot
    }
    return { ...slot, assignments: slot.assignments ?? [] }
  })
  const migrated = { ...plan, schedule: migratedSchedule }

  // 2. Fill missing meal-type fields
  const startMeal: 'lunch' | 'middag' = (migrated.startMealType as 'lunch' | 'middag' | undefined) ?? 'middag'
  const endMeal:   'lunch' | 'middag' = (migrated.endMealType   as 'lunch' | 'middag' | undefined) ?? 'lunch'
  const expectedEnd = format(addDays(parseISO(migrated.startDate), 7), 'yyyy-MM-dd')

  if (migrated.endDate === expectedEnd && migrated.startMealType && migrated.endMealType) return migrated

  return applyWeekWindow(
    { ...migrated, startMealType: startMeal, endMealType: endMeal },
    migrated.startDate, startMeal,
    migrated.endDate === expectedEnd ? migrated.endDate : expectedEnd,
    endMeal,
  )
}
