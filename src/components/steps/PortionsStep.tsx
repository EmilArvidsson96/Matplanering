import { useWeekStore, activeWeek } from '../../store/weekStore'
import { formatDayLabel } from '../../utils/weekUtils'
import type { MealType } from '../../types'

export default function PortionsStep() {
  const store = useWeekStore()
  const week  = activeWeek(store)

  const DAYS_WITH_LUNCH = week.schedule.filter(s => s.type === 'lunch').map(s => s.date)
  const ALL_DATES = [...new Set(week.schedule.map(s => s.date))]

  function updatePortions(date: string, type: MealType, value: number) {
    store.updateSlot(date, type, { portionsNeeded: Math.max(0, value) })
  }

  function updateEvent(date: string, value: string) {
    // Update event on both lunch and dinner for the same day
    week.schedule
      .filter(s => s.date === date)
      .forEach(s => store.updateSlot(date, s.type, { event: value }))
  }

  function eventForDate(date: string): string {
    return week.schedule.find(s => s.date === date)?.event ?? ''
  }

  function slotPortions(date: string, type: MealType): number {
    return week.schedule.find(s => s.date === date && s.type === type)?.portionsNeeded ?? week.householdSize
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Household size */}
      <section className="bg-white rounded-2xl p-5 shadow-sm">
        <h2 className="font-semibold text-gray-700 mb-4">Antal i hushållet (standard)</h2>
        <div className="flex items-center gap-3">
          <button
            onClick={() => store.updateHouseholdSize(Math.max(1, week.householdSize - 1))}
            className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 text-lg font-bold leading-none flex items-center justify-center"
          >−</button>
          <span className="w-8 text-center text-xl font-semibold">{week.householdSize}</span>
          <button
            onClick={() => store.updateHouseholdSize(week.householdSize + 1)}
            className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 text-lg font-bold leading-none flex items-center justify-center"
          >+</button>
          <span className="text-sm text-gray-400">portioner per måltid som standard</span>
        </div>
      </section>

      {/* Per-day overrides */}
      <section className="bg-white rounded-2xl p-5 shadow-sm">
        <h2 className="font-semibold text-gray-700 mb-4">Portioner per dag &amp; händelser</h2>
        <div className="space-y-4">
          {ALL_DATES.map((date) => {
            const hasLunch = DAYS_WITH_LUNCH.includes(date)
            return (
              <div key={date} className="border border-gray-100 rounded-xl p-4">
                <div className="flex flex-wrap items-start gap-3">
                  {/* Day label */}
                  <div className="w-36 pt-1">
                    <span className="text-sm font-medium text-gray-700 capitalize">
                      {formatDayLabel(date)}
                    </span>
                  </div>

                  {/* Portion pickers */}
                  <div className="flex flex-wrap gap-4 flex-1">
                    {hasLunch && (
                      <PortionPicker
                        label="Lunch"
                        value={slotPortions(date, 'lunch')}
                        onChange={(v) => updatePortions(date, 'lunch', v)}
                      />
                    )}
                    <PortionPicker
                      label="Middag"
                      value={slotPortions(date, 'middag')}
                      onChange={(v) => updatePortions(date, 'middag', v)}
                    />
                  </div>

                  {/* Event note */}
                  <input
                    type="text"
                    placeholder="Händelse / notering…"
                    value={eventForDate(date)}
                    onChange={(e) => updateEvent(date, e.target.value)}
                    className="flex-1 min-w-[160px] text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-300"
                  />
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function PortionPicker({
  label, value, onChange,
}: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 w-12">{label}</span>
      <button
        onClick={() => onChange(Math.max(0, value - 1))}
        className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 text-sm font-bold leading-none flex items-center justify-center"
      >−</button>
      <span className="w-5 text-center text-sm font-semibold">{value}</span>
      <button
        onClick={() => onChange(value + 1)}
        className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 text-sm font-bold leading-none flex items-center justify-center"
      >+</button>
    </div>
  )
}
