import { useState } from 'react'
import { useWeekStore, activeWeek } from '../../store/weekStore'
import { computeBalances, slotKey, formatDayShort } from '../../utils/weekUtils'
import Modal from '../common/Modal'
import type { ScheduleSlot, PlannedMeal, MealType, WeekPlan } from '../../types'

export default function ScheduleStep() {
  const store  = useWeekStore()
  const week   = activeWeek(store)
  const [pickingSlot, setPickingSlot] = useState<ScheduleSlot | null>(null)

  const balances = computeBalances(week)
  const dates    = [...new Set(week.schedule.map(s => s.date))]
  const startMeal = week.startMealType ?? 'middag'
  const endMeal   = week.endMealType   ?? 'lunch'

  function setWindow(startDate: string, sm: MealType, endDate: string, em: MealType) {
    if (!startDate || !endDate) return
    if (endDate < startDate || (endDate === startDate && sm === 'middag' && em === 'lunch')) return
    store.setWeekWindow(startDate, sm, endDate, em)
  }

  function updateEvent(date: string, value: string) {
    week.schedule
      .filter(s => s.date === date)
      .forEach(s => store.updateSlot(date, s.type, { event: value }))
  }

  return (
    <div className="max-w-3xl space-y-4">
      {/* Week window – compact */}
      <section className="bg-white rounded-2xl p-4 shadow-sm">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Planeringsfönster</h2>
        <div className="flex flex-wrap gap-4">
          <div className="space-y-1.5">
            <label className="block text-xs text-gray-400">Från</label>
            <input
              type="date"
              value={week.startDate}
              onChange={e => setWindow(e.target.value, startMeal, week.endDate, endMeal)}
              className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
            />
            <MealToggle value={startMeal} onChange={m => setWindow(week.startDate, m, week.endDate, endMeal)} />
          </div>
          <div className="flex items-center pt-6 text-gray-300 text-xl">→</div>
          <div className="space-y-1.5">
            <label className="block text-xs text-gray-400">Till</label>
            <input
              type="date"
              value={week.endDate}
              min={week.startDate}
              onChange={e => setWindow(week.startDate, startMeal, e.target.value, endMeal)}
              className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
            />
            <MealToggle value={endMeal} onChange={m => setWindow(week.startDate, startMeal, week.endDate, m)} />
          </div>
        </div>
      </section>

      {/* Legend */}
      <div className="flex gap-4 text-xs text-gray-400">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-brand-400 inline-block" /> Portioner räcker</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" /> Knappt</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block" /> Portioner saknas</span>
      </div>

      {dates.map(date => {
        const daySlots = week.schedule.filter(s => s.date === date)
        const dayEvent = daySlots[0]?.event ?? ''

        return (
          <div key={date} className="bg-white rounded-2xl shadow-sm overflow-hidden">
            {/* Day header with editable note */}
            <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-100 bg-gray-50/60">
              <span className="font-semibold text-sm text-gray-700 shrink-0 capitalize">
                {formatDayShort(date)}
              </span>
              <input
                type="text"
                placeholder="Notering för dagen…"
                value={dayEvent}
                onChange={e => updateEvent(date, e.target.value)}
                className="flex-1 text-xs text-gray-500 bg-transparent border-none focus:outline-none placeholder:text-gray-300 italic"
              />
            </div>

            {/* Slots */}
            {daySlots.map(slot => {
              const balance      = balances.get(slotKey(slot)) ?? 0
              const assignedMeals = slot.assignments.map(a => ({
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
                />
              )
            })}
          </div>
        )
      })}

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
  slot, balance, assignedMeals, onAssign, onUnassign, onUpdatePortions,
}: {
  slot: ScheduleSlot
  balance: number
  assignedMeals: { assignment: { mealId: string; portions: number }; meal: PlannedMeal }[]
  onAssign: () => void
  onUnassign: (mealId: string) => void
  onUpdatePortions: (v: number) => void
}) {
  const balanceColor =
    balance < 0   ? 'bg-red-100 text-red-700 border-red-200' :
    balance <= 1  ? 'bg-amber-100 text-amber-700 border-amber-200' :
                    'bg-brand-100 text-brand-700 border-brand-200'
  const dotColor =
    balance < 0   ? 'bg-red-400' :
    balance <= 1  ? 'bg-amber-400' : 'bg-brand-400'

  return (
    <div className="flex items-start gap-3 px-4 py-3 border-b border-gray-50 last:border-0">
      <div className="pt-1 shrink-0"><div className={`w-2 h-2 rounded-full ${dotColor}`} /></div>

      <div className="w-14 shrink-0 pt-0.5">
        <span className="text-xs font-medium text-gray-500">
          {slot.type === 'lunch' ? 'Lunch' : 'Middag'}
        </span>
      </div>

      <div className="flex-1 min-w-0">
        {assignedMeals.length === 0 ? (
          <span className="text-xs text-gray-300 italic">Inget tillagat</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {assignedMeals.map(({ assignment, meal }) => (
              <span
                key={meal.id}
                className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border
                  ${meal.isRemainder ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-gray-50 border-gray-200 text-gray-700'}`}
              >
                {meal.name}
                {assignment.portions < meal.portions && (
                  <span className="text-gray-400 ml-0.5">({assignment.portions}p)</span>
                )}
                <button onClick={() => onUnassign(meal.id)} className="text-gray-300 hover:text-red-400 ml-0.5 leading-none">✕</button>
              </span>
            ))}
          </div>
        )}
        <button onClick={onAssign} className="mt-1.5 text-xs text-brand-600 hover:text-brand-800 font-medium">
          + Lägg till matlagning
        </button>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button onClick={() => onUpdatePortions(slot.portionsNeeded - 1)} className="w-6 h-6 rounded-full bg-gray-100 hover:bg-gray-200 text-xs font-bold leading-none flex items-center justify-center">−</button>
        <span className="w-5 text-center text-sm font-semibold">{slot.portionsNeeded}</span>
        <button onClick={() => onUpdatePortions(slot.portionsNeeded + 1)} className="w-6 h-6 rounded-full bg-gray-100 hover:bg-gray-200 text-xs font-bold leading-none flex items-center justify-center">+</button>
      </div>

      <div className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full border ${balanceColor}`}>
        {balance > 0 ? `+${balance}` : balance}
      </div>
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
  // Which meals are already assigned to THIS slot
  const inThisSlot = new Set(slot.assignments.map(a => a.mealId))

  // Portions already assigned to OTHER slots per meal
  function portionsElsewhere(mealId: string): number {
    return week.schedule
      .filter(s => !(s.date === slot.date && s.type === slot.type))
      .flatMap(s => s.assignments)
      .filter(a => a.mealId === mealId)
      .reduce((sum, a) => sum + a.portions, 0)
  }

  function remaining(meal: PlannedMeal): number {
    return Math.max(1, meal.portions - portionsElsewhere(meal.id))
  }

  // Local portion counts for unassigned meals (stepper state)
  const [counts, setCounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(week.meals.filter(m => !inThisSlot.has(m.id)).map(m => [m.id, remaining(m)]))
  )

  function setCount(mealId: string, max: number, delta: number) {
    setCounts(c => ({ ...c, [mealId]: Math.min(max, Math.max(1, (c[mealId] ?? 1) + delta)) }))
  }

  const unassigned = week.meals.filter(m => !inThisSlot.has(m.id))
  const assigned   = week.meals.filter(m => inThisSlot.has(m.id))

  return (
    <Modal title={`Tilldela matlagning – ${slot.type === 'lunch' ? 'Lunch' : 'Middag'} ${slot.date}`} onClose={onClose}>
      <div className="space-y-1">
        {unassigned.length === 0 && assigned.length === 0 && (
          <p className="text-sm text-gray-400 py-4 text-center">Inga planerade rätter.</p>
        )}

        {/* Unassigned meals — assignable */}
        {unassigned.map(meal => {
          const max   = meal.portions
          const count = counts[meal.id] ?? remaining(meal)
          const elsewhere = portionsElsewhere(meal.id)

          return (
            <div
              key={meal.id}
              className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-brand-50 transition-colors border border-transparent hover:border-brand-100"
            >
              {meal.isRemainder && (
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full shrink-0">Rester</span>
              )}
              <span className="flex-1 font-medium text-sm text-gray-800">{meal.name}</span>

              {/* Portion stepper */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => setCount(meal.id, max, -1)}
                  className="w-6 h-6 rounded-full bg-gray-100 hover:bg-gray-200 text-xs font-bold leading-none flex items-center justify-center"
                >−</button>
                <span className="w-6 text-center text-sm font-semibold">{count}</span>
                <button
                  onClick={() => setCount(meal.id, max, +1)}
                  className="w-6 h-6 rounded-full bg-gray-100 hover:bg-gray-200 text-xs font-bold leading-none flex items-center justify-center"
                >+</button>
                <span className="text-xs text-gray-300 ml-0.5">/ {max}</span>
              </div>
              {elsewhere > 0 && (
                <span className="text-xs text-gray-300 shrink-0">{elsewhere}p ann.</span>
              )}

              <button
                onClick={() => onAssign(meal.id, count)}
                className="shrink-0 text-xs bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5 rounded-lg font-medium"
              >
                Tilldela
              </button>
            </div>
          )
        })}

        {/* Already assigned meals — greyed out */}
        {assigned.map(meal => {
          const a = slot.assignments.find(x => x.mealId === meal.id)!
          return (
            <div key={meal.id} className="flex items-center gap-3 px-3 py-3 rounded-xl opacity-40">
              {meal.isRemainder && (
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full shrink-0">Rester</span>
              )}
              <span className="flex-1 font-medium text-sm text-gray-800">{meal.name}</span>
              <span className="text-xs text-gray-500">{a.portions}p tilldelade</span>
              <span className="text-xs text-gray-400 italic">Redan tillagd</span>
            </div>
          )
        })}
      </div>
    </Modal>
  )
}

function MealToggle({ value, onChange }: { value: MealType; onChange: (v: MealType) => void }) {
  return (
    <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
      {(['lunch', 'middag'] as MealType[]).map(m => (
        <button key={m} type="button" onClick={() => onChange(m)}
          className={`px-3 py-1.5 font-medium transition-colors ${value === m ? 'bg-brand-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
        >
          {m === 'lunch' ? 'Lunch' : 'Middag'}
        </button>
      ))}
    </div>
  )
}
