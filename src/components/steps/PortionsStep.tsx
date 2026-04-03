import { useWeekStore, activeWeek } from '../../store/weekStore'
import { formatDayLabel, scheduleDates } from '../../utils/weekUtils'
import type { MealType } from '../../types'

export default function PortionsStep() {
  const store = useWeekStore()
  const week  = activeWeek(store)
  const dates = scheduleDates(week)

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

  function dayEvent(date: string): string {
    return week.schedule.find(s => s.date === date)?.event ?? ''
  }

  function updatePortions(date: string, type: MealType, value: number) {
    store.updateSlot(date, type, { portionsNeeded: Math.max(0, value) })
  }

  function slotPortions(date: string, type: MealType): number {
    return week.schedule.find(s => s.date === date && s.type === type)?.portionsNeeded ?? week.householdSize
  }

  function hasSlot(date: string, type: MealType): boolean {
    return week.schedule.some(s => s.date === date && s.type === type)
  }

  return (
    <div className="space-y-6">
      {/* Household size */}
      <section className="bg-white rounded-2xl p-5 shadow-sm">
        <h2 className="font-semibold text-gray-700 mb-4">Antal i hushållet (standard)</h2>
        <div className="flex items-center gap-3">
          <Stepper
            value={week.householdSize}
            min={1}
            onChange={v => store.updateHouseholdSize(v)}
          />
          <span className="text-sm text-gray-600">portioner per måltid som standard</span>
        </div>
      </section>

      {/* Week window */}
      <section className="bg-white rounded-2xl p-5 shadow-sm">
        <h2 className="font-semibold text-gray-700 mb-1">Planeringsfönster</h2>
        <p className="text-xs text-gray-500 mb-4">{dates.length} dagar · {week.schedule.length} måltider</p>

        <div className="flex flex-wrap gap-6">
          {/* Start */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-gray-600">Från</label>
            <input
              type="date"
              value={week.startDate}
              onChange={e => setWindow(e.target.value, startMeal, week.endDate, endMeal)}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
            />
            <MealToggle
              value={startMeal}
              onChange={m => setWindow(week.startDate, m, week.endDate, endMeal)}
            />
          </div>

          <div className="flex items-center pt-7 text-gray-400 text-xl">→</div>

          {/* End */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-gray-600">Till</label>
            <input
              type="date"
              value={week.endDate}
              min={week.startDate}
              onChange={e => setWindow(week.startDate, startMeal, e.target.value, endMeal)}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
            />
            <MealToggle
              value={endMeal}
              onChange={m => setWindow(week.startDate, startMeal, week.endDate, m)}
            />
          </div>
        </div>
      </section>

      {/* Per-day portion overrides */}
      <section className="bg-white rounded-2xl p-5 shadow-sm">
        <h2 className="font-semibold text-gray-700 mb-4">Portioner per dag</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {dates.map((date) => (
            <div key={date} className="border border-gray-100 rounded-xl overflow-hidden">
              <div className="p-3 flex flex-wrap items-center gap-3">
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
              </div>
              <div className="border-t border-gray-50 bg-gray-50 px-3 py-1.5">
                <input
                  type="text"
                  placeholder="Notering för dagen…"
                  value={dayEvent(date)}
                  onChange={e => updateEvent(date, e.target.value)}
                  className="w-full text-xs text-gray-600 bg-transparent border-none focus:outline-none placeholder:text-gray-400 italic"
                />
              </div>
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
      <span className="text-xs text-gray-600 w-12">{label}</span>
      <Stepper value={value} min={0} onChange={onChange} small />
    </div>
  )
}

function MealToggle({ value, onChange }: { value: MealType; onChange: (v: MealType) => void }) {
  return (
    <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
      {(['lunch', 'middag'] as MealType[]).map(m => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={`px-3 py-1.5 font-medium transition-colors capitalize
            ${value === m ? 'bg-brand-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
        >
          {m === 'lunch' ? 'Lunch' : 'Middag'}
        </button>
      ))}
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
