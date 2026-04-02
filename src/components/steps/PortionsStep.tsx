import { useWeekStore, activeWeek } from '../../store/weekStore'
import { formatDayLabel, formatDayShort, scheduleDates, getSaturdayOf, toWeekId } from '../../utils/weekUtils'
import type { MealType } from '../../types'

export default function PortionsStep() {
  const store = useWeekStore()
  const week  = activeWeek(store)
  const dates = scheduleDates(week)

  /** Navigate to the Saturday on-or-before the picked date. */
  function handleStartDateChange(raw: string) {
    if (!raw) return
    const sat = getSaturdayOf(new Date(raw + 'T12:00:00'))
    store.setActiveWeek(toWeekId(sat))
  }

  function updatePortions(date: string, type: MealType, value: number) {
    store.updateSlot(date, type, { portionsNeeded: Math.max(0, value) })
  }

  function updateEvent(date: string, value: string) {
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

  function hasSlot(date: string, type: MealType): boolean {
    return week.schedule.some(s => s.date === date && s.type === type)
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Household size */}
      <section className="bg-white rounded-2xl p-5 shadow-sm">
        <h2 className="font-semibold text-gray-700 mb-4">Antal i hushållet (standard)</h2>
        <div className="flex items-center gap-3">
          <Stepper
            value={week.householdSize}
            min={1}
            onChange={v => store.updateHouseholdSize(v)}
          />
          <span className="text-sm text-gray-400">portioner per måltid som standard</span>
        </div>
      </section>

      {/* Week window */}
      <section className="bg-white rounded-2xl p-5 shadow-sm">
        <h2 className="font-semibold text-gray-700 mb-3">Planeringsfönster</h2>

        {/* Start date picker */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Startar (lördag)</label>
            <input
              type="date"
              value={week.startDate}
              onChange={e => handleStartDateChange(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
            />
          </div>
          <div className="text-xs text-gray-400 mt-4">
            {formatDayShort(week.startDate)} – {formatDayShort(week.endDate)} · {dates.length} dagar
          </div>
        </div>

        {/* Extend / shrink */}
        <div className="flex gap-2">
          <button
            onClick={() => store.shrinkWeek()}
            disabled={dates.length <= 2}
            className="border border-gray-200 hover:bg-gray-50 disabled:opacity-30 text-gray-600 px-3 py-1.5 rounded-xl text-sm"
          >
            − Ta bort sista dag
          </button>
          <button
            onClick={() => store.extendWeek()}
            className="border border-gray-200 hover:bg-gray-50 text-gray-600 px-3 py-1.5 rounded-xl text-sm"
          >
            + Lägg till dag
          </button>
        </div>
      </section>

      {/* Per-day overrides */}
      <section className="bg-white rounded-2xl p-5 shadow-sm">
        <h2 className="font-semibold text-gray-700 mb-4">Portioner per dag &amp; händelser</h2>
        <div className="space-y-3">
          {dates.map((date) => (
            <div key={date} className="border border-gray-100 rounded-xl p-3 flex flex-wrap items-center gap-3">
              <div className="w-28 shrink-0">
                <span className="text-sm font-medium text-gray-700 capitalize">
                  {formatDayLabel(date)}
                </span>
              </div>

              <div className="flex flex-wrap gap-3 flex-1">
                {hasSlot(date, 'lunch') && (
                  <PortionPicker
                    label="Lunch"
                    value={slotPortions(date, 'lunch')}
                    onChange={v => updatePortions(date, 'lunch', v)}
                  />
                )}
                {hasSlot(date, 'middag') && (
                  <PortionPicker
                    label="Middag"
                    value={slotPortions(date, 'middag')}
                    onChange={v => updatePortions(date, 'middag', v)}
                  />
                )}
              </div>

              <input
                type="text"
                placeholder="Händelse…"
                value={eventForDate(date)}
                onChange={e => updateEvent(date, e.target.value)}
                className="flex-1 min-w-[140px] text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-300"
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function PortionPicker({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-gray-500 w-12">{label}</span>
      <Stepper value={value} min={0} onChange={onChange} small />
    </div>
  )
}

function Stepper({ value, min, onChange, small }: { value: number; min: number; onChange: (v: number) => void; small?: boolean }) {
  const cls = small
    ? 'w-6 h-6 text-xs'
    : 'w-9 h-9 text-lg'
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        className={`${cls} rounded-full bg-gray-100 hover:bg-gray-200 font-bold leading-none flex items-center justify-center`}
      >−</button>
      <span className={`${small ? 'w-5 text-sm' : 'w-8 text-xl'} text-center font-semibold`}>{value}</span>
      <button
        onClick={() => onChange(value + 1)}
        className={`${cls} rounded-full bg-gray-100 hover:bg-gray-200 font-bold leading-none flex items-center justify-center`}
      >+</button>
    </div>
  )
}
