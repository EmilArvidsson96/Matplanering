import { useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import {
  Users, Lightbulb, CalendarDays, ExternalLink,
  ChevronDown, ChevronRight, Pencil,
} from 'lucide-react'
import { useWeekStore, activeWeek } from '../store/weekStore'
import { useLibraryStore } from '../store/libraryStore'
import { useSettingsStore } from '../store/settingsStore'
import {
  formatDayLabel, formatDayShort,
  totalPlannedPortions, totalNeededPortions, remainderPortions,
} from '../utils/weekUtils'
import type { WeekPlan, PlannedMeal, Dish, ScheduleSlot } from '../types'

// ─── Step-status logic ────────────────────────────────────────────────────────

type StepStatus = 'done' | 'started' | 'active' | 'locked'
type StepId = 'portioner' | 'brainstorm' | 'schema'

interface StepInfo { status: StepStatus; canUndo: boolean }
interface StepStatuses { portioner: StepInfo; brainstorm: StepInfo; schema: StepInfo }

const STEP_META: Record<StepId, { label: string; shortLabel: string; desc: string; Icon: React.FC<{ className?: string }> }> = {
  portioner:  { label: 'Sätt portioner',     shortLabel: 'Portioner',  desc: 'Hur många äter? Vilket datum gäller?',         Icon: Users        },
  brainstorm: { label: 'Brainstorma rätter', shortLabel: 'Brainstorm', desc: 'Planera portioner tills det räcker för veckan', Icon: Lightbulb    },
  schema:     { label: 'Fördela i schemat',  shortLabel: 'Schema',     desc: 'Tilldela rätter till veckans måltider',         Icon: CalendarDays },
}

function getStepStatuses(week: WeekPlan, needed: number, planned: number): StepStatuses {
  const portionerForced   = week.stepsCompleted?.portioner === true
  const brainstormForced  = week.stepsCompleted?.brainstorm === true
  const brainstormAuto    = week.meals.length > 0 && needed > 0 && (planned + remainderPortions(week.meals)) >= needed
  const brainstormDone    = brainstormForced || brainstormAuto
  const brainstormStarted = week.meals.length > 0
  const schemaForced = week.stepsCompleted?.schema === true
  const schemaAuto   = week.meals.length > 0 && week.meals.every(meal =>
    week.schedule.some(slot => slot.assignments.some(a => a.mealId === meal.id))
  )
  const schemaDone = schemaForced || schemaAuto
  // Note: Portioner has no auto-detection — only explicit "Klar" marks it done

  return {
    portioner: {
      status:  portionerForced ? 'done' : 'active',
      canUndo: portionerForced,
    },
    brainstorm: {
      status:  brainstormDone ? 'done' : brainstormStarted ? 'started' : portionerForced ? 'active' : 'locked',
      canUndo: brainstormForced && !brainstormAuto,
    },
    schema: {
      status:  schemaDone ? 'done' : brainstormDone ? 'active' : 'locked',
      canUndo: schemaForced && !schemaAuto,
    },
  }
}

function getNextStep(statuses: StepStatuses): StepId | null {
  if (statuses.portioner.status  !== 'done') return 'portioner'
  if (statuses.brainstorm.status !== 'done') return 'brainstorm'
  if (statuses.schema.status     !== 'done') return 'schema'
  return null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getAssignedMeals(slot: ScheduleSlot, week: WeekPlan) {
  return (slot.assignments ?? [])
    .map(a => ({ assignment: a, meal: week.meals.find(m => m.id === a.mealId) }))
    .filter((x): x is { assignment: typeof x.assignment; meal: PlannedMeal } => x.meal !== undefined)
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SummaryPage() {
  const store    = useWeekStore()
  const week     = activeWeek(store)
  const dishes   = useLibraryStore(s => s.dishes)
  const dishMap  = new Map(dishes.map(d => [d.id, d]))
  const today    = format(new Date(), 'yyyy-MM-dd')

  const needed   = totalNeededPortions(week.schedule)
  const planned  = totalPlannedPortions(week.meals)
  const statuses = getStepStatuses(week, needed, planned)
  const nextStep = getNextStep(statuses)

  function handleUndo(step: StepId) {
    store.unmarkStepCompleted(step)
  }

  return (
    <div className="max-w-2xl space-y-4">
      {/* 1. Planning status — always at the top */}
      <PlanningStatus statuses={statuses} nextStep={nextStep} onUndo={handleUndo} />

      {/* 2. Today's meals */}
      <TodayCard week={week} dishMap={dishMap} today={today} />

      {/* 3. Rest of week — only days with content */}
      <WeekOverview week={week} dishMap={dishMap} today={today} />

      {/* 4. Cost card — only when the week has slots */}
      {week.schedule.length > 0 && (
        <CostCard week={week} needed={needed} />
      )}
    </div>
  )
}

// ─── Planning status ──────────────────────────────────────────────────────────

function PlanningStatus({
  statuses,
  nextStep,
  onUndo,
}: {
  statuses: StepStatuses
  nextStep: StepId | null
  onUndo: (step: StepId) => void
}) {
  const STEPS: StepId[] = ['portioner', 'brainstorm', 'schema']

  const statusColors: Record<StepStatus, string> = {
    done:    'text-green-700 bg-green-50',
    started: 'text-amber-700 bg-amber-50',
    active:  'text-blue-700 bg-blue-50',   // distinct from done (green)
    locked:  'text-gray-400 bg-gray-50',
  }
  const dotColors: Record<StepStatus, string> = {
    done:    'bg-green-500',
    started: 'bg-amber-400',
    active:  'bg-blue-500',
    locked:  'bg-gray-200',
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
        {nextStep ? (
          <>
            <div>
              <p className="text-sm font-semibold text-gray-800">{STEP_META[nextStep].label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{STEP_META[nextStep].desc}</p>
            </div>
            <Link
              to={`/planera?steg=${nextStep}`}
              className="shrink-0 flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold px-3 py-2 rounded-xl transition-colors"
            >
              {STEP_META[nextStep].shortLabel} <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-green-700">Veckan är fullt planerad ✓</p>
            <Link
              to="/planera"
              className="shrink-0 flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-xl transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" /> Redigera
            </Link>
          </>
        )}
      </div>

      {/* Step pills */}
      <div className="flex divide-x divide-gray-100">
        {STEPS.map(step => {
          const info = statuses[step]
          const meta = STEP_META[step]
          return (
            <div
              key={step}
              className={`flex-1 flex flex-col items-center gap-1 py-3 text-center ${statusColors[info.status]}`}
            >
              <Link
                to={`/planera?steg=${step}`}
                className="flex flex-col items-center gap-1 w-full hover:opacity-80 transition-opacity"
              >
                <meta.Icon className="w-4 h-4" />
                <span className="text-xs font-medium leading-tight">{meta.shortLabel}</span>
                {info.status === 'done'
                  ? <span className="text-xs font-bold text-green-600">✓</span>
                  : <span className={`w-2 h-2 rounded-full ${dotColors[info.status]}`} />
                }
              </Link>
              {info.canUndo && (
                <button
                  onClick={() => onUndo(step)}
                  className="text-xs text-gray-400 hover:text-red-500 transition-colors mt-0.5 leading-none"
                  title="Ångra markering"
                >
                  ↩ ångra
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Today card ───────────────────────────────────────────────────────────────

function TodayCard({ week, dishMap, today }: { week: WeekPlan; dishMap: Map<string, Dish>; today: string }) {
  const store      = useWeekStore()
  const todaySlots = week.schedule.filter(s => s.date === today)
  if (todaySlots.length === 0) return null

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 bg-brand-600 text-white">
        <p className="text-sm font-bold">Idag</p>
        <p className="text-xs opacity-75 capitalize">{formatDayLabel(today)}</p>
      </div>
      {todaySlots.map(slot => {
        const meals = getAssignedMeals(slot, week)
        return (
          <div key={slot.type} className="px-4 py-3 border-b border-gray-50 last:border-0">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              {slot.type === 'lunch' ? 'Lunch' : 'Middag'}
            </p>
            {meals.length === 0 ? (
              <p className="text-sm text-gray-400 italic mb-2">Inget planerat</p>
            ) : (
              <div className="space-y-2 mb-2">
                {meals.map(({ meal, assignment }) => (
                  <MealRow
                    key={meal.id}
                    meal={meal}
                    dish={meal.dishId ? dishMap.get(meal.dishId) : undefined}
                    portions={assignment.portions}
                  />
                ))}
              </div>
            )}
            <input
              type="text"
              placeholder="Notering…"
              value={slot.event ?? ''}
              onChange={e => store.updateSlot(slot.date, slot.type, { event: e.target.value })}
              className="w-full text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-200 placeholder:text-gray-400 italic"
            />
          </div>
        )
      })}
    </div>
  )
}

// ─── Week overview ────────────────────────────────────────────────────────────

function WeekOverview({ week, dishMap, today }: { week: WeekPlan; dishMap: Map<string, Dish>; today: string }) {
  const dates = [...new Set(week.schedule.map(s => s.date))]

  const relevantDates = dates.filter(date => {
    if (date === today) return false
    const slots = week.schedule.filter(s => s.date === date)
    return slots.some(s => s.assignments.length > 0 || s.event?.trim())
  })

  if (relevantDates.length === 0) return null

  return (
    <div className="space-y-2">
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1">Övriga dagar</h2>
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden divide-y divide-gray-100">
        {relevantDates.map(date => (
          <DayRow key={date} date={date} week={week} dishMap={dishMap} today={today} />
        ))}
      </div>
    </div>
  )
}

function DayRow({ date, week, dishMap, today }: { date: string; week: WeekPlan; dishMap: Map<string, Dish>; today: string }) {
  const store    = useWeekStore()
  const daySlots = week.schedule.filter(s => s.date === date)
  const isPast   = date < today

  return (
    <div className={`px-4 py-3 ${isPast ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-semibold text-gray-700 capitalize">{formatDayShort(date)}</span>
      </div>
      <div className="space-y-2.5 pl-1">
        {daySlots.map(slot => {
          const meals = getAssignedMeals(slot, week)
          if (meals.length === 0 && !slot.event && isPast) return null
          return (
            <div key={slot.type} className="flex items-start gap-3">
              <span className="text-xs font-medium text-gray-400 w-12 shrink-0 pt-0.5">
                {slot.type === 'lunch' ? 'Lunch' : 'Middag'}
              </span>
              <div className="flex-1 space-y-1.5">
                {meals.map(({ meal, assignment }) => (
                  <MealRow
                    key={meal.id}
                    meal={meal}
                    dish={meal.dishId ? dishMap.get(meal.dishId) : undefined}
                    portions={assignment.portions}
                    compact
                  />
                ))}
                <input
                  type="text"
                  placeholder="Notering…"
                  value={slot.event ?? ''}
                  onChange={e => store.updateSlot(slot.date, slot.type, { event: e.target.value })}
                  className="w-full text-xs text-gray-500 bg-transparent border-none focus:outline-none placeholder:text-gray-300 italic"
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Meal row ─────────────────────────────────────────────────────────────────

function MealRow({ meal, dish, portions, compact = false }: {
  meal: PlannedMeal; dish: Dish | undefined; portions: number; compact?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const hasIngredients = (dish?.ingredients.length ?? 0) > 0

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap">
        {meal.isRemainder && (
          <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium shrink-0">Rester</span>
        )}
        <span className={`font-medium ${compact ? 'text-sm' : 'text-base'} ${meal.isRemainder ? 'text-amber-800' : 'text-gray-800'}`}>
          {meal.name}
        </span>
        {dish?.recipeUrl && (
          <a
            href={dish.recipeUrl} target="_blank" rel="noopener noreferrer"
            className="text-brand-500 hover:text-brand-700 shrink-0" title="Öppna recept"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
        {hasIngredients && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-gray-400 hover:text-gray-600 shrink-0"
            title={expanded ? 'Dölj ingredienser' : 'Visa ingredienser'}
          >
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      {meal.notes && (
        <p className="text-xs text-gray-500 italic mt-0.5">{meal.notes}</p>
      )}

      {expanded && dish && (
        <div className="mt-2 pl-3 border-l-2 border-gray-200 space-y-0.5">
          {dish.ingredients.map(ing => {
            const base    = ing.portionsBase > 0 ? ing.portionsBase : 1
            const scaled  = (ing.amount * portions) / base
            const display = scaled % 1 === 0 ? scaled.toFixed(0) : scaled.toFixed(1)
            return (
              <p key={ing.id} className="text-xs text-gray-600">
                <span className="font-medium tabular-nums">{display} {ing.unit}</span>{' '}{ing.name}
              </p>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Cost card ────────────────────────────────────────────────────────────────

function CostCard({ week, needed }: { week: WeekPlan; needed: number }) {
  const store          = useWeekStore()
  const costPerPortion = useSettingsStore(s => s.settings.costPerPortion)
  const estimated      = costPerPortion * needed
  const [inputVal, setInputVal] = useState(week.actualCost != null ? String(week.actualCost) : '')

  function commitCost() {
    const val = parseFloat(inputVal.replace(',', '.'))
    store.setActualCost(isNaN(val) ? null : val)
  }

  const diff = week.actualCost != null ? week.actualCost - estimated : null

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Kostnad</h2>

      <div className="flex flex-wrap gap-5 items-end">
        <div>
          <p className="text-2xl font-bold text-gray-800">{estimated} kr</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Estimerat · {needed} port. × {costPerPortion} kr
          </p>
        </div>

        {week.actualCost != null && (
          <div>
            <p className="text-2xl font-bold text-brand-700">{week.actualCost} kr</p>
            <p className="text-xs mt-0.5">
              Faktisk kostnad
              {diff !== null && (
                <span className={`ml-1.5 font-semibold ${diff > 0 ? 'text-red-500' : 'text-green-600'}`}>
                  {diff > 0 ? `+${diff}` : diff} kr
                </span>
              )}
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="number"
          min={0}
          placeholder="Faktisk kostnad (kr)…"
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          onBlur={commitCost}
          onKeyDown={e => e.key === 'Enter' && commitCost()}
          className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
        />
        {week.actualCost != null && (
          <button
            onClick={() => { setInputVal(''); store.setActualCost(null) }}
            className="text-xs text-gray-400 hover:text-red-500 px-2 py-2"
            title="Rensa faktisk kostnad"
          >✕</button>
        )}
      </div>
    </div>
  )
}
