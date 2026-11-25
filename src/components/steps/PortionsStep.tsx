import { useNavigate } from 'react-router-dom'
import SegmentedControl from '../common/SegmentedControl'
import { ChevronRight } from 'lucide-react'
import { useWeekStore, activeWeek } from '../../store/weekStore'
import { formatDayLabel, scheduleDates } from '../../utils/weekUtils'
import type { MealType } from '../../types'

export default function PortionsStep() {
  const store    = useWeekStore()
  const week     = activeWeek(store)
  const dates    = scheduleDates(week)
  const navigate = useNavigate()

  function markDoneAndNext() {
    store.markStepCompleted('portioner')
    navigate('/planera?steg=brainstorm')
  }

  const startMeal = week.startMealType ?? 'middag'
  const endMeal   = week.endMealType   ?? 'lunch'

  function setWindow(startDate: string, sm: MealType, endDate: string, em: MealType) {
    if (!startDate || !endDate) return
    if (endDate < startDate || (endDate === startDate && sm === 'middag' && em === 'lunch')) return
    store.setWeekWindow(startDate, sm, endDate, em)
  }

  function updateEvent(date: string, type: MealType, value: string) {
    store.updateSlot(date, type, { event: value })
  }

  function slotEvent(date: string, type: MealType): string {
    return week.schedule.find(s => s.date === date && s.type === type)?.event ?? ''
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
      <section className="card p-5">
        <h2 className="font-display text-lg font-bold text-ink mb-4">Antal i hushållet (standard)</h2>
        <div className="flex items-center gap-3">
          <Stepper
            value={week.householdSize}
            min={1}
            onChange={v => store.updateHouseholdSize(v)}
          />
          <span className="text-sm text-ink-muted">portioner per måltid som standard</span>
        </div>
      </section>

      {/* Week window */}
      <section className="card p-5">
        <h2 className="font-display text-lg font-bold text-ink mb-1">Planeringsfönster</h2>
        <p className="text-xs text-ink-muted mb-4">{dates.length} dagar · {week.schedule.length} måltider</p>

        <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:gap-3 items-start">
          {/* Start */}
          <div className="space-y-2 min-w-0">
            <label className="field-label mb-0">Från</label>
            <input
              type="date"
              value={week.startDate}
              onChange={e => setWindow(e.target.value, startMeal, week.endDate, endMeal)}
              className="field px-3"
            />
            <MealToggle
              value={startMeal}
              onChange={m => setWindow(week.startDate, m, week.endDate, endMeal)}
            />
          </div>

          <div className="hidden sm:flex items-center pt-10 text-ink-faint text-xl" aria-hidden="true">→</div>

          {/* End */}
          <div className="space-y-2 min-w-0">
            <label className="field-label mb-0">Till</label>
            <input
              type="date"
              value={week.endDate}
              min={week.startDate}
              onChange={e => setWindow(week.startDate, startMeal, e.target.value, endMeal)}
              className="field px-3"
            />
            <MealToggle
              value={endMeal}
              onChange={m => setWindow(week.startDate, startMeal, week.endDate, m)}
            />
          </div>
        </div>
      </section>

      {/* Per-day portion overrides */}
      <section className="card p-5">
        <h2 className="font-display text-lg font-bold text-ink mb-4">Portioner per dag</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {dates.map((date) => (
            <div key={date} className="border border-line-soft rounded-xl overflow-hidden">
              <div className="px-3 pt-3 pb-1">
                <span className="text-sm font-medium text-ink-soft capitalize">
                  {formatDayLabel(date)}
                </span>
              </div>
              {(['lunch', 'middag'] as MealType[]).filter(type => hasSlot(date, type)).map(type => (
                <div key={type} className="border-t border-line-soft px-3 py-2 flex flex-wrap items-center gap-3">
                  <PortionPicker
                    label={type === 'lunch' ? 'Lunch' : 'Middag'}
                    value={slotPortions(date, type)}
                    onChange={v => updatePortions(date, type, v)}
                  />
                  <input
                    type="text"
                    placeholder="Notering…"
                    value={slotEvent(date, type)}
                    onChange={e => updateEvent(date, type, e.target.value)}
                    className="flex-1 min-w-[120px] text-xs text-ink-muted bg-transparent border-none focus:outline-none placeholder:text-ink-faint italic"
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* Next-step CTA */}
      <div className="flex justify-end">
        <button
          onClick={markDoneAndNext}
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-semibold px-5 py-2.5 rounded-full transition-colors text-sm"
        >
          {week.stepsCompleted?.portioner ? 'Uppdaterat – gå till brainstorm' : 'Klar – gå till brainstorm'}
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

function PortionPicker({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-ink-muted w-12">{label}</span>
      <Stepper value={value} min={0} onChange={onChange} small />
    </div>
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

function Stepper({ value, min, onChange, small }: { value: number; min: number; onChange: (v: number) => void; small?: boolean }) {
  const cls = small
    ? 'w-9 h-9 text-base'
    : 'w-11 h-11 text-lg'
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        className={`${cls} rounded-full bg-line-soft hover:bg-line font-bold leading-none flex items-center justify-center`}
        aria-label="Minska"
      >−</button>
      <span className={`${small ? 'w-6 text-[15px]' : 'w-8 text-xl'} text-center font-display font-extrabold tabular-nums`}>{value}</span>
      <button
        onClick={() => onChange(value + 1)}
        className={`${cls} rounded-full bg-line-soft hover:bg-line font-bold leading-none flex items-center justify-center`}
        aria-label="Öka"
      >+</button>
    </div>
  )
}
