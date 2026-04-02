import { useState } from 'react'
import { useWeekStore, activeWeek } from '../../store/weekStore'
import { computeBalances, slotKey, formatDayShort } from '../../utils/weekUtils'
import Modal from '../common/Modal'
import type { ScheduleSlot, PlannedMeal } from '../../types'

export default function ScheduleStep() {
  const store  = useWeekStore()
  const week   = activeWeek(store)
  const [pickingSlot, setPickingSlot] = useState<ScheduleSlot | null>(null)

  const balances = computeBalances(week)
  const dates    = [...new Set(week.schedule.map(s => s.date))]

  return (
    <div className="max-w-3xl space-y-3">
      {/* Legend */}
      <div className="flex gap-4 text-xs text-gray-400 mb-1">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-brand-400 inline-block"></span> Portioner räcker</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block"></span> Knappt</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block"></span> Portioner saknas</span>
      </div>

      {dates.map(date => {
        const daySlots = week.schedule.filter(s => s.date === date)
        const dayEvent = daySlots[0]?.event ?? ''

        return (
          <div key={date} className="bg-white rounded-2xl shadow-sm overflow-hidden">
            {/* Day header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-50 bg-gray-50/60">
              <span className="font-semibold text-sm text-gray-700 capitalize">
                {formatDayShort(date)}
              </span>
              {dayEvent && (
                <span className="text-xs text-gray-400 italic truncate max-w-[200px]">{dayEvent}</span>
              )}
            </div>

            {/* Slots */}
            {daySlots.map(slot => {
              const balance = balances.get(slotKey(slot)) ?? 0
              const assignedMeals = week.meals.filter(m => slot.assignedMealIds.includes(m.id))
              return (
                <SlotRow
                  key={slotKey(slot)}
                  slot={slot}
                  balance={balance}
                  assignedMeals={assignedMeals}
                  onAssign={() => setPickingSlot(slot)}
                  onUnassign={(mealId) => store.unassignMeal(slot.date, slot.type, mealId)}
                  onUpdatePortions={(v) => store.updateSlot(slot.date, slot.type, { portionsNeeded: Math.max(0, v) })}
                />
              )
            })}
          </div>
        )
      })}

      {pickingSlot && (
        <MealAssignPicker
          slot={pickingSlot}
          meals={week.meals}
          onAssign={(mealId) => {
            store.assignMeal(pickingSlot.date, pickingSlot.type, mealId)
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
  assignedMeals: PlannedMeal[]
  onAssign: () => void
  onUnassign: (mealId: string) => void
  onUpdatePortions: (v: number) => void
}) {
  const balanceColor =
    balance < 0  ? 'bg-red-100 text-red-700 border-red-200' :
    balance <= 1  ? 'bg-amber-100 text-amber-700 border-amber-200' :
                    'bg-brand-100 text-brand-700 border-brand-200'

  const dotColor =
    balance < 0  ? 'bg-red-400' :
    balance <= 1  ? 'bg-amber-400' : 'bg-brand-400'

  return (
    <div className="flex items-start gap-3 px-4 py-3 border-b border-gray-50 last:border-0">
      {/* Balance dot */}
      <div className="flex flex-col items-center gap-1 pt-0.5 shrink-0">
        <div className={`w-2 h-2 rounded-full mt-1 ${dotColor}`} />
      </div>

      {/* Meal type label */}
      <div className="w-14 shrink-0 pt-0.5">
        <span className="text-xs font-medium text-gray-500">
          {slot.type === 'lunch' ? 'Lunch' : 'Middag'}
        </span>
      </div>

      {/* Assigned meals */}
      <div className="flex-1 min-w-0">
        {assignedMeals.length === 0 ? (
          <span className="text-xs text-gray-300 italic">Inget tillagat</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {assignedMeals.map(meal => (
              <span
                key={meal.id}
                className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border
                  ${meal.isRemainder ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-gray-50 border-gray-200 text-gray-700'}`}
              >
                {meal.name}
                <button
                  onClick={() => onUnassign(meal.id)}
                  className="text-gray-300 hover:text-red-400 ml-0.5 leading-none"
                >✕</button>
              </span>
            ))}
          </div>
        )}

        {/* Add cooking button */}
        <button
          onClick={onAssign}
          className="mt-1.5 text-xs text-brand-600 hover:text-brand-800 font-medium"
        >
          + Lägg till matlagning
        </button>
      </div>

      {/* Portions needed */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => onUpdatePortions(slot.portionsNeeded - 1)}
          className="w-6 h-6 rounded-full bg-gray-100 hover:bg-gray-200 text-xs font-bold leading-none flex items-center justify-center"
        >−</button>
        <span className="w-5 text-center text-sm font-semibold">{slot.portionsNeeded}</span>
        <button
          onClick={() => onUpdatePortions(slot.portionsNeeded + 1)}
          className="w-6 h-6 rounded-full bg-gray-100 hover:bg-gray-200 text-xs font-bold leading-none flex items-center justify-center"
        >+</button>
      </div>

      {/* Balance badge */}
      <div className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full border ${balanceColor}`}>
        {balance > 0 ? `+${balance}` : balance}
      </div>
    </div>
  )
}

function MealAssignPicker({
  slot, meals, onAssign, onClose,
}: {
  slot: ScheduleSlot
  meals: PlannedMeal[]
  onAssign: (mealId: string) => void
  onClose: () => void
}) {
  const available = meals.filter(m => !slot.assignedMealIds.includes(m.id))

  return (
    <Modal
      title={`Tilldela matlagning – ${slot.type === 'lunch' ? 'Lunch' : 'Middag'}`}
      onClose={onClose}
    >
      {available.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">
          Alla planerade rätter är redan tilldelade till detta tillfälle.
        </p>
      ) : (
        <div className="space-y-1">
          {available.map(meal => (
            <button
              key={meal.id}
              onClick={() => onAssign(meal.id)}
              className="w-full text-left flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-brand-50 transition-colors border border-transparent hover:border-brand-100"
            >
              {meal.isRemainder && (
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full shrink-0">Rester</span>
              )}
              <span className="flex-1 font-medium text-sm text-gray-800">{meal.name}</span>
              <span className="text-sm text-gray-400">{meal.portions} port.</span>
            </button>
          ))}
        </div>
      )}
      <p className="text-xs text-gray-400 mt-3 pt-3 border-t border-gray-100">
        Rätten kokas vid detta tillfälle och alla dess portioner läggs till i balansen.
      </p>
    </Modal>
  )
}
