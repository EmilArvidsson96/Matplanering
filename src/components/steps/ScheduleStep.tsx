import { useState, useRef } from 'react'
import SegmentedControl from '../common/SegmentedControl'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, ChevronRight } from 'lucide-react'
import { useWeekStore, activeWeek } from '../../store/weekStore'
import { computeBalances, slotKey, formatDayShort, mealTotalPortions, eatenMeals } from '../../utils/weekUtils'
import Modal, { type ModalHandle } from '../common/Modal'
import type { ScheduleSlot, PlannedMeal, MealType, WeekPlan } from '../../types'

export default function ScheduleStep() {
  const store    = useWeekStore()
  const week     = activeWeek(store)
  const navigate = useNavigate()
  const [pickingSlot, setPickingSlot] = useState<ScheduleSlot | null>(null)

  const unassignedMeals = eatenMeals(week.meals).filter(meal =>
    !week.schedule.some(slot => slot.assignments.some(a => a.mealId === meal.id))
  )
  const allAssigned = eatenMeals(week.meals).length > 0 && unassignedMeals.length === 0

  function markDoneAndFinish() {
    store.markStepCompleted('schema')
    navigate('/')
  }

  const balances = computeBalances(week)
  const dates    = [...new Set(week.schedule.map(s => s.date))]
  const startMeal = week.startMealType ?? 'middag'
  const endMeal   = week.endMealType   ?? 'lunch'

  function setWindow(startDate: string, sm: MealType, endDate: string, em: MealType) {
    if (!startDate || !endDate) return
    if (endDate < startDate || (endDate === startDate && sm === 'middag' && em === 'lunch')) return
    store.setWeekWindow(startDate, sm, endDate, em)
  }

  return (
    <div className="space-y-4">
      {/* Week window – compact */}
      <section className="card p-5">
        <h2 className="font-display text-lg font-bold text-ink mb-3">Planeringsfönster</h2>
        <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:gap-3 items-start">
          <div className="space-y-2 min-w-0">
            <label className="field-label mb-0">Från</label>
            <input
              type="date"
              value={week.startDate}
              onChange={e => setWindow(e.target.value, startMeal, week.endDate, endMeal)}
              className="field px-3"
            />
            <MealToggle value={startMeal} onChange={m => setWindow(week.startDate, m, week.endDate, endMeal)} />
          </div>
          <div className="hidden sm:flex items-center pt-10 text-ink-faint text-xl" aria-hidden="true">→</div>
          <div className="space-y-2 min-w-0">
            <label className="field-label mb-0">Till</label>
            <input
              type="date"
              value={week.endDate}
              min={week.startDate}
              onChange={e => setWindow(week.startDate, startMeal, e.target.value, endMeal)}
              className="field px-3"
            />
            <MealToggle value={endMeal} onChange={m => setWindow(week.startDate, startMeal, week.endDate, m)} />
          </div>
        </div>
      </section>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted px-1">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-brand-400 inline-block" /> Portioner räcker</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" /> Knappt</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block" /> Portioner saknas</span>
      </div>

      {dates.map(date => {
          const daySlots = week.schedule.filter(s => s.date === date)

          return (
            <div key={date} className="card overflow-hidden">
              {/* Day header */}
              <div className="flex items-center gap-3 px-4 pt-3.5 pb-1">
                <span className="font-display font-bold text-[15px] text-ink shrink-0 capitalize">
                  {formatDayShort(date)}
                </span>
              </div>

              {/* Slots */}
              {daySlots.map(slot => {
                const balance      = balances.get(slotKey(slot)) ?? 0
                const assignedMeals = (slot.assignments ?? []).map(a => ({
                  assignment: a,
                  meal: week.meals.find(m => m.id === a.mealId),
                })).filter(x => x.meal !== undefined) as { assignment: { mealId: string; portions: number }; meal: PlannedMeal }[]

                return (
                  <SlotRow
                    key={slotKey(slot)}
                    slot={slot}
                    balance={balance}
                    assignedMeals={assignedMeals}
                    onAssign={() => setPickingSlot(slot)}
                    onUnassign={mealId => store.unassignMeal(slot.date, slot.type, mealId)}
                    onUpdatePortions={v => store.updateSlot(slot.date, slot.type, { portionsNeeded: Math.max(0, v) })}
                    onUpdateEvent={v => store.updateSlot(slot.date, slot.type, { event: v })}
                  />
                )
              })}
            </div>
          )
        })}

      {/* Next-step CTA */}
      <div className="flex items-center justify-between gap-3 card p-4">
        {allAssigned ? (
          <p className="text-sm text-brand-700 font-medium flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" /> Alla måltider är tilldelade
          </p>
        ) : (
          <p className="text-sm text-ink-muted">
            {unassignedMeals.length === 0
              ? 'Inga brainstormade rätter att fördela'
              : `${unassignedMeals.length} rätt${unassignedMeals.length > 1 ? 'er' : ''} ej fördelade: ${unassignedMeals.map(m => m.name).join(', ')}`}
          </p>
        )}
        <button
          onClick={markDoneAndFinish}
          className={`flex items-center gap-2 font-semibold px-5 py-2.5 rounded-full transition-colors text-sm shrink-0
            ${allAssigned
              ? 'bg-brand-600 hover:bg-brand-700 text-white'
              : 'bg-line-soft hover:bg-line-soft text-ink-soft'}`}
        >
          {allAssigned ? 'Klar – tillbaka till sammanfattning' : 'Forcera & gå till sammanfattning'}
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {pickingSlot && (
        <MealAssignPicker
          slot={pickingSlot}
          week={week}
          onAssign={(mealId, portions) => {
            store.assignMeal(pickingSlot.date, pickingSlot.type, mealId, portions)
            setPickingSlot(null)
          }}
          onClose={() => setPickingSlot(null)}
        />
      )}
    </div>
  )
}

function SlotRow({
  slot, balance, assignedMeals, onAssign, onUnassign, onUpdatePortions, onUpdateEvent,
}: {
  slot: ScheduleSlot
  balance: number
  assignedMeals: { assignment: { mealId: string; portions: number }; meal: PlannedMeal }[]
  onAssign: () => void
  onUnassign: (mealId: string) => void
  onUpdatePortions: (v: number) => void
  onUpdateEvent: (v: string) => void
}) {
  const balanceColor =
    balance < 0   ? 'bg-red-100 text-red-700 border-red-200' :
    balance <= 1  ? 'bg-amber-100 text-amber-700 border-amber-200' :
                    'bg-brand-100 text-brand-700 border-brand-200'
  const dotColor =
    balance < 0   ? 'bg-red-400' :
    balance <= 1  ? 'bg-amber-400' : 'bg-brand-400'

  return (
    <div className="px-4 py-3 border-t border-line-soft first-of-type:border-0 space-y-2">
      {/* Row 1: meal type, balance, portions needed */}
      <div className="flex items-center gap-2.5">
        <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} aria-hidden="true" />
        <span className="text-[15px] font-semibold text-ink flex-1">
          {slot.type === 'lunch' ? 'Lunch' : 'Middag'}
        </span>
        <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full border ${balanceColor}`} title="Portioner över/under behovet">
          {balance > 0 ? `+${balance}` : balance}
        </span>
        <div className="flex items-center gap-1 shrink-0" aria-label="Portioner som behövs">
          <button onClick={() => onUpdatePortions(slot.portionsNeeded - 1)} aria-label="Färre portioner" className="w-9 h-9 shrink-0 rounded-full bg-line-soft hover:bg-line text-base font-bold leading-none flex items-center justify-center">−</button>
          <span className="w-6 text-center font-display font-extrabold tabular-nums">{slot.portionsNeeded}</span>
          <button onClick={() => onUpdatePortions(slot.portionsNeeded + 1)} aria-label="Fler portioner" className="w-9 h-9 shrink-0 rounded-full bg-line-soft hover:bg-line text-base font-bold leading-none flex items-center justify-center">+</button>
        </div>
      </div>

      {/* Row 2: assigned cooking */}
      <div className="flex flex-wrap gap-1.5 pl-[18px]">
        {assignedMeals.map(({ assignment, meal }) => (
          <span
            key={meal.id}
            className={`flex items-center gap-1 text-[13px] pl-3 pr-1 h-8 rounded-full border
              ${meal.isRemainder ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-canvas border-line text-ink'}`}
          >
            {meal.name}
            {assignment.portions < mealTotalPortions(meal) && (
              <span className="text-ink-muted ml-0.5">({assignment.portions}p)</span>
            )}
            <button onClick={() => onUnassign(meal.id)} aria-label={`Ta bort ${meal.name}`} className="w-6 h-6 rounded-full flex items-center justify-center text-ink-faint hover:text-red-700 hover:bg-red-50 leading-none">✕</button>
          </span>
        ))}
        <button onClick={onAssign} className="h-8 px-3 rounded-full border border-dashed border-ink-faint/60 text-[13px] font-semibold text-brand-700 hover:bg-mint">
          + Lägg till matlagning
        </button>
      </div>
      <input
        type="text"
        aria-label="Notering"
        placeholder="Notering…"
        value={slot.event ?? ''}
        onChange={e => onUpdateEvent(e.target.value)}
        className="ml-[18px] w-[calc(100%-18px)] text-[13px] text-ink-muted bg-transparent border-none focus:outline-none placeholder:text-ink-faint"
      />
    </div>
  )
}

function MealAssignPicker({
  slot, week, onAssign, onClose,
}: {
  slot: ScheduleSlot
  week: WeekPlan
  onAssign: (mealId: string, portions: number) => void
  onClose: () => void
}) {
  const modalRef = useRef<ModalHandle>(null)
  const inThisSlot = new Set((slot.assignments ?? []).map(a => a.mealId))

  function portionsElsewhere(mealId: string): number {
    return week.schedule
      .filter(s => !(s.date === slot.date && s.type === slot.type))
      .flatMap(s => s.assignments)
      .filter(a => a.mealId === mealId)
      .reduce((sum, a) => sum + a.portions, 0)
  }

  function remaining(meal: PlannedMeal): number {
    return mealTotalPortions(meal) - portionsElsewhere(meal.id)
  }

  const [counts, setCounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      eatenMeals(week.meals).filter(m => !inThisSlot.has(m.id))
               .map(m => [m.id, Math.max(1, remaining(m))])
    )
  )

  function setCount(mealId: string, max: number, delta: number) {
    setCounts(c => ({ ...c, [mealId]: Math.min(max, Math.max(1, (c[mealId] ?? 1) + delta)) }))
  }

  const unassigned = eatenMeals(week.meals).filter(m => !inThisSlot.has(m.id))
  const assigned   = eatenMeals(week.meals).filter(m => inThisSlot.has(m.id))

  return (
    <Modal ref={modalRef} title={`Tilldela matlagning – ${slot.type === 'lunch' ? 'Lunch' : 'Middag'} ${slot.date}`} onClose={onClose}>
      <div className="space-y-1">
        {unassigned.length === 0 && assigned.length === 0 && (
          <p className="text-sm text-ink-muted py-4 text-center">Inga planerade rätter.</p>
        )}

        {unassigned.map(meal => {
          const rem   = remaining(meal)
          const max   = Math.max(1, rem)
          const count = Math.min(counts[meal.id] ?? max, max)
          const full  = rem <= 0

          return (
            <div
              key={meal.id}
              className={`flex items-center gap-3 px-3 py-3 rounded-xl border transition-colors
                ${full
                  ? 'opacity-50 border-transparent'
                  : 'hover:bg-brand-50 border-transparent hover:border-brand-100'}`}
            >
              {meal.isRemainder && (
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full shrink-0">Rester</span>
              )}
              <span className="flex-1 font-medium text-sm text-ink">{meal.name}</span>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  disabled={full || count <= 1}
                  onClick={() => setCount(meal.id, max, -1)}
                  className="w-9 h-9 shrink-0 rounded-full bg-line-soft hover:bg-line disabled:opacity-30 text-xs font-bold leading-none flex items-center justify-center"
                >−</button>
                <span className="w-6 text-center text-sm font-semibold">{full ? 0 : count}</span>
                <button
                  disabled={full || count >= max}
                  onClick={() => setCount(meal.id, max, +1)}
                  className="w-9 h-9 shrink-0 rounded-full bg-line-soft hover:bg-line disabled:opacity-30 text-xs font-bold leading-none flex items-center justify-center"
                >+</button>
                <span className="text-xs text-ink-muted ml-0.5">/ {mealTotalPortions(meal)}</span>
              </div>

              <button
                disabled={full}
                onClick={() => modalRef.current ? modalRef.current.close(() => onAssign(meal.id, count)) : onAssign(meal.id, count)}
                className={`shrink-0 text-xs px-3 py-1.5 rounded-full font-medium transition-colors
                  ${full
                    ? 'bg-line-soft text-ink-faint cursor-not-allowed'
                    : 'bg-brand-600 hover:bg-brand-700 text-white'}`}
              >
                {full ? 'Fullt planerat' : 'Tilldela'}
              </button>
            </div>
          )
        })}

        {assigned.map(meal => {
          const a = (slot.assignments ?? []).find(x => x.mealId === meal.id) ?? { mealId: meal.id, portions: mealTotalPortions(meal) }
          return (
            <div key={meal.id} className="flex items-center gap-3 px-3 py-3 rounded-xl opacity-40">
              {meal.isRemainder && (
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full shrink-0">Rester</span>
              )}
              <span className="flex-1 font-medium text-sm text-ink">{meal.name}</span>
              <span className="text-xs text-ink-muted">{a.portions}p tilldelade</span>
              <span className="text-xs text-ink-faint italic">Redan tillagd</span>
            </div>
          )
        })}
      </div>
    </Modal>
  )
}

function MealToggle({ value, onChange }: { value: MealType; onChange: (v: MealType) => void }) {
  return (
    <SegmentedControl
      ariaLabel="Måltid"
      value={value}
      onChange={onChange}
      options={[{ id: 'lunch', label: 'Lunch' }, { id: 'middag', label: 'Middag' }]}
    />
  )
}
