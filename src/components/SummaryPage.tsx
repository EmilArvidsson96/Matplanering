import { useState } from 'react'
import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { sv } from 'date-fns/locale'
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
  mealPrimaryDishId, isExtraMeal,
} from '../utils/weekUtils'
import { ExtraTypeIcon, EXTRA_LABELS } from './steps/ExtraCookingSection'
import { weekPlanImpact, climateGrade, CLIMATE_COLORS, formatSEK, formatCO2e } from '../utils/ingredientImpact'
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
  const eaten        = week.meals.filter(m => !isExtraMeal(m))
  const schemaAuto   = eaten.length > 0 && eaten.every(meal =>
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
    <div className="space-y-5">
      {/* 1. Planning status — always at the top */}
      <PlanningStatus statuses={statuses} nextStep={nextStep} onUndo={handleUndo} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
        {/* Today first on mobile, right column on desktop */}
        <div className="space-y-4 lg:col-start-2 lg:row-start-1">
          <TodayCard week={week} dishMap={dishMap} today={today} />
          {week.schedule.length > 0 && <CostCard week={week} needed={needed} />}
          {week.schedule.length > 0 && <ClimateCard week={week} />}
        </div>
        <div className="lg:col-start-1 lg:row-start-1 min-w-0 space-y-5">
          <WeekOverview week={week} dishMap={dishMap} today={today} />
          {/* Baking & freezer cooking */}
          <ExtraCookingCard week={week} dishMap={dishMap} today={today} />
        </div>
      </div>
    </div>
  )
}

function ClimateCard({ week }: { week: WeekPlan }) {
  const dishes = useLibraryStore(s => s.dishes)
  const conversions = useSettingsStore(s => s.settings.unitConversions)
  const overrides = useSettingsStore(s => s.settings.costOverrides)
  const impact = weekPlanImpact(week, dishes, conversions, overrides ?? {})
  const totalPortions = week.schedule.reduce(
    (s, sl) => s + (sl.assignments ?? []).reduce((a, x) => a + (x.portions || 0), 0), 0,
  )
  if (!impact.matched || totalPortions === 0) {
    return (
      <div className="card p-5">
        <h2 className="eyebrow mb-1.5">Klimat & uppskattad kostnad</h2>
        <p className="text-sm text-ink-muted">Lägg till ingredienser med kvantitet och enhet på rätterna så räknas klimat och kostnad automatiskt.</p>
      </div>
    )
  }
  const co2Pp = impact.co2eKg / totalPortions
  const grade = climateGrade(co2Pp)
  const costPp = impact.costSEK / totalPortions
  return (
    <div className="card p-5 space-y-3">
      <h2 className="eyebrow">Klimat & uppskattad kostnad</h2>
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-3xl flex items-center justify-center text-white text-2xl font-display font-extrabold shrink-0" style={{ background: CLIMATE_COLORS[grade] }}>
          {grade}
        </div>
        <div className="flex-1 grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-ink-muted">Klimat / portion</p>
            <p className="text-lg font-display font-extrabold">{formatCO2e(co2Pp)} CO₂e</p>
          </div>
          <div>
            <p className="text-xs text-ink-muted">Kostnad / portion</p>
            <p className="text-lg font-display font-extrabold">{formatSEK(costPp)}</p>
          </div>
          <div>
            <p className="text-xs text-ink-muted">Vecka totalt</p>
            <p className="text-sm font-semibold">{formatCO2e(impact.co2eKg)} · {formatSEK(impact.costSEK)}</p>
          </div>
          <div>
            <p className="text-xs text-ink-muted">Portioner</p>
            <p className="text-sm font-semibold">{totalPortions}</p>
          </div>
        </div>
      </div>
      <p className="text-xs text-ink-muted">Uppskattat från ingredienslexikonet. Se Spel för detaljer och hur det påverkar dina poäng.</p>
    </div>
  )
}

// ─── Baking & freezer cooking ─────────────────────────────────────────────────

function ExtraCookingCard({ week, dishMap, today }: { week: WeekPlan; dishMap: Map<string, Dish>; today: string }) {
  const extras = week.meals.filter(isExtraMeal)
  const freezeMeals = week.meals.filter(m => !isExtraMeal(m) && (m.freezePortions ?? 0) > 0)
  if (extras.length === 0 && freezeMeals.length === 0) return null

  // Dated items first (chronologically), then undated
  const sorted = [...extras].sort((a, b) =>
    (a.plannedDate ?? '9999').localeCompare(b.plannedDate ?? '9999'),
  )

  return (
    <div className="card p-4 space-y-2">
      <h2 className="eyebrow">Bak & till frysen</h2>
      {sorted.map(meal => {
        const type = meal.extraType ?? 'frys'
        const comp = meal.components[0]
        const dish = comp?.dishId ? dishMap.get(comp.dishId) : undefined
        const unit = dish?.yieldUnit?.trim() || 'port.'
        return (
          <div key={meal.id} className="flex items-center gap-2">
            <ExtraTypeIcon type={type} className={`w-4 h-4 shrink-0 ${type === 'bak' ? 'text-pink-500' : 'text-sky-500'}`} />
            <div className="flex-1 min-w-0">
              {dish ? (
                <Link to={`/recept?dish=${encodeURIComponent(dish.id)}`} className="text-sm font-medium text-ink hover:underline hover:text-brand-700">
                  {meal.name}
                </Link>
              ) : (
                <span className="text-sm font-medium text-ink">{meal.name}</span>
              )}
              <span className="text-xs text-ink-muted"> · {comp?.portions ?? 0} {unit}</span>
              {meal.notes && <p className="text-xs text-ink-muted italic">{meal.notes}</p>}
            </div>
            <span className={`text-xs shrink-0 ${meal.plannedDate === today ? 'text-brand-700 font-semibold' : 'text-ink-muted'}`}>
              {meal.plannedDate ? (meal.plannedDate === today ? 'Idag' : formatDayShort(meal.plannedDate)) : EXTRA_LABELS[type]}
            </span>
          </div>
        )
      })}
      {freezeMeals.map(meal => (
        <div key={meal.id} className="flex items-center gap-2">
          <ExtraTypeIcon type="frys" className="w-4 h-4 shrink-0 text-sky-500" />
          <span className="flex-1 text-sm text-ink-soft">
            Laga <span className="font-medium">{meal.freezePortions} port.</span> extra av {meal.name}
          </span>
        </div>
      ))}
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

  const barColors: Record<StepStatus, string> = {
    done:    'bg-brand-600',
    started: 'bg-gradient-to-r from-brand-600 from-50% to-line to-50%',
    active:  'bg-line',
    locked:  'bg-line',
  }
  const labelColors: Record<StepStatus, string> = {
    done:    'text-brand-700',
    started: 'text-ink',
    active:  'text-ink',
    locked:  'text-ink-faint',
  }

  return (
    <div className="space-y-3">
      {/* Progress bars */}
      <div className="grid grid-cols-3 gap-1.5">
        {STEPS.map(step => {
          const info = statuses[step]
          const meta = STEP_META[step]
          return (
            <div key={step} className="flex flex-col gap-1.5 min-w-0">
              <Link to={`/planera?steg=${step}`} className="flex flex-col gap-1.5 group" aria-label={`${meta.label}: ${info.status === 'done' ? 'klar' : 'ej klar'}`}>
                <span className={`h-1 rounded-full ${barColors[info.status]}`} />
                <span className={`text-xs font-semibold truncate group-hover:underline ${labelColors[info.status]}`}>
                  {meta.shortLabel}{info.status === 'done' ? ' ✓' : ''}
                </span>
              </Link>
              {info.canUndo && (
                <button
                  onClick={() => onUndo(step)}
                  className="self-start text-[11px] text-ink-muted hover:text-red-700 leading-none"
                  title="Ångra markering"
                >
                  Ångra
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Next step call-to-action */}
      {nextStep ? (
        <div className="card p-4 pl-5 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-semibold text-ink">{STEP_META[nextStep].label}</p>
            <p className="text-[13px] text-ink-muted mt-0.5">{STEP_META[nextStep].desc}</p>
          </div>
          <Link to={`/planera?steg=${nextStep}`} className="btn-primary h-11 px-4 text-sm shrink-0">
            {STEP_META[nextStep].shortLabel} <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      ) : (
        <div className="rounded-3xl bg-mint px-5 py-3 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-mint-ink">Veckan är fullt planerad</p>
          <Link to="/planera" className="h-10 px-4 rounded-full bg-white text-ink text-sm font-semibold flex items-center gap-1.5">
            <Pencil className="w-3.5 h-3.5" /> Redigera
          </Link>
        </div>
      )}
    </div>
  )
}

// ─── Today card ───────────────────────────────────────────────────────────────

function TodayCard({ week, dishMap, today }: { week: WeekPlan; dishMap: Map<string, Dish>; today: string }) {
  const store      = useWeekStore()
  const todaySlots = week.schedule.filter(s => s.date === today)
  if (todaySlots.length === 0) return null

  return (
    <div className="bg-ink text-white rounded-[28px] p-5 space-y-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-mint-bright">Idag</span>
        <span className="text-xs text-white/70 capitalize">{formatDayLabel(today)}</span>
      </div>
      {todaySlots.map((slot, i) => {
        const meals = getAssignedMeals(slot, week)
        return (
          <div key={slot.type} className={i > 0 ? 'pt-4 border-t border-white/10' : ''}>
            <p className="text-[13px] text-white/70 mb-1">
              {slot.type === 'lunch' ? 'Lunch' : 'Middag'}
            </p>
            {meals.length === 0 ? (
              <p className="text-base text-white/60 mb-2">Inget planerat</p>
            ) : (
              <div className="space-y-2 mb-3">
                {meals.map(({ meal, assignment }) => (
                  <MealRow
                    key={meal.id}
                    meal={meal}
                    dish={mealPrimaryDishId(meal) ? dishMap.get(mealPrimaryDishId(meal)!) : undefined}
                    portions={assignment.portions}
                    dark
                  />
                ))}
              </div>
            )}
            <input
              type="text"
              aria-label={`Notering ${slot.type}`}
              placeholder="Notering…"
              value={slot.event ?? ''}
              onChange={e => store.updateSlot(slot.date, slot.type, { event: e.target.value })}
              className="w-full h-10 text-sm text-white bg-white/10 rounded-xl px-3 focus:outline-none focus:ring-2 focus:ring-mint-bright/60 placeholder:text-white/50"
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
    <div className="space-y-2.5">
      <div className="flex items-baseline justify-between px-1">
        <h2 className="font-display text-lg font-bold">Resten av veckan</h2>
        <Link to="/planera" className="text-sm font-semibold text-brand-700 hover:text-brand-800">Planera</Link>
      </div>
      <div className="card overflow-hidden divide-y divide-line-soft">
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
    <div className={`px-4 py-3.5 flex gap-3 ${isPast ? 'opacity-50' : ''}`}>
      <div className="w-10 shrink-0 flex flex-col items-center pt-0.5" title={formatDayShort(date)}>
        <span className="text-[11px] font-semibold uppercase text-ink-muted">{format(parseISO(date), 'EEE', { locale: sv }).replace('.', '')}</span>
        <span className="font-display text-lg font-extrabold leading-tight">{format(parseISO(date), 'd')}</span>
      </div>
      <div className="flex-1 min-w-0 space-y-2.5">
        {daySlots.map(slot => {
          const meals = getAssignedMeals(slot, week)
          if (meals.length === 0 && !slot.event && isPast) return null
          return (
            <div key={slot.type} className="flex items-start gap-3">
              <span className="text-xs font-medium text-ink-muted w-12 shrink-0 pt-0.5">
                {slot.type === 'lunch' ? 'Lunch' : 'Middag'}
              </span>
              <div className="flex-1 space-y-1.5">
                {meals.map(({ meal, assignment }) => (
                  <MealRow
                    key={meal.id}
                    meal={meal}
                    dish={mealPrimaryDishId(meal) ? dishMap.get(mealPrimaryDishId(meal)!) : undefined}
                    portions={assignment.portions}
                    compact
                  />
                ))}
                <input
                  type="text"
                  placeholder="Notering…"
                  value={slot.event ?? ''}
                  onChange={e => store.updateSlot(slot.date, slot.type, { event: e.target.value })}
                  aria-label={`Notering ${slot.type}`}
                  className="w-full text-[13px] text-ink-muted bg-transparent border-none focus:outline-none placeholder:text-ink-faint/70"
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

function MealRow({ meal, dish, portions, compact = false, dark = false }: {
  meal: PlannedMeal; dish: Dish | undefined; portions: number; compact?: boolean; dark?: boolean
}) {
  const nameColor = dark ? 'text-white' : meal.isRemainder ? 'text-amber-800' : 'text-ink'
  const size = compact
    ? 'text-[15px] font-semibold'
    : 'font-display text-[22px] font-bold leading-tight tracking-tight'

  const [expanded, setExpanded] = useState(false)
  const hasIngredients = (dish?.ingredients.length ?? 0) > 0

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap">
        {meal.isRemainder && (
          <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-semibold shrink-0">Rester</span>
        )}
        {dish ? (
          <Link
            to={`/recept?dish=${encodeURIComponent(dish.id)}`}
            className={`hover:underline ${size} ${nameColor}`}
          >
            {meal.name}
          </Link>
        ) : (
          <span className={`${size} ${nameColor}`}>
            {meal.name}
          </span>
        )}
        {dish?.recipeUrl && (
          <a
            href={dish.recipeUrl} target="_blank" rel="noopener noreferrer"
            className={`shrink-0 ${dark ? 'text-mint-bright' : 'text-brand-600 hover:text-brand-700'}`} title="Öppna originalrecept" aria-label="Öppna originalrecept"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
        {hasIngredients && (
          <button
            onClick={() => setExpanded(e => !e)}
            className={`shrink-0 w-8 h-8 -my-1 rounded-full flex items-center justify-center ${dark ? 'text-white/70 hover:bg-white/10' : 'text-ink-muted hover:bg-canvas'}`}
            title={expanded ? 'Dölj ingredienser' : 'Visa ingredienser'}
            aria-label={expanded ? 'Dölj ingredienser' : 'Visa ingredienser'}
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      {meal.notes && (
        <p className={`text-[13px] mt-0.5 ${dark ? 'text-white/70' : 'text-ink-muted'}`}>{meal.notes}</p>
      )}

      {expanded && dish && (
        <div className={`mt-2 pl-3 border-l-2 space-y-0.5 ${dark ? 'border-white/20' : 'border-line'}`}>
          {dish.ingredients.map(ing => {
            const base    = ing.portionsBase > 0 ? ing.portionsBase : 1
            const scaled  = (ing.amount * portions) / base
            const display = scaled % 1 === 0 ? scaled.toFixed(0) : scaled.toFixed(1)
            return (
              <p key={ing.id} className={`text-[13px] ${dark ? 'text-white/80' : 'text-ink-soft'}`}>
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
    <div className="card p-5 space-y-3">
      <h2 className="eyebrow">Kostnad</h2>

      <div className="flex flex-wrap gap-5 items-end">
        <div>
          <p className="font-display text-[26px] font-extrabold tracking-tight">{estimated} kr</p>
          <p className="text-xs text-ink-muted mt-0.5">
            Estimerat · {needed} port. × {costPerPortion} kr
          </p>
        </div>

        {week.actualCost != null && (
          <div>
            <p className="font-display text-[26px] font-extrabold tracking-tight text-brand-700">{week.actualCost} kr</p>
            <p className="text-xs mt-0.5">
              Faktisk kostnad
              {diff !== null && (
                <span className={`ml-1.5 font-semibold ${diff > 0 ? 'text-red-700' : 'text-brand-700'}`}>
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
          aria-label="Faktisk kostnad i kronor"
          className="field flex-1 bg-canvas border-transparent"
        />
        {week.actualCost != null && (
          <button
            onClick={() => { setInputVal(''); store.setActualCost(null) }}
            className="icon-btn text-ink-muted hover:text-red-700 hover:bg-red-50"
            title="Rensa faktisk kostnad"
            aria-label="Rensa faktisk kostnad"
          >✕</button>
        )}
      </div>
    </div>
  )
}
