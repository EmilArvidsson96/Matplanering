import { useWeekStore, activeWeek } from '../../store/weekStore'
import { prevWeekId, formatWeekLabel, currentWeekId, nextWeekWindow } from '../../utils/weekUtils'
import { useWeekLoader } from '../../hooks/useWeekLoader'

export default function WeekNavigator() {
  const store = useWeekStore()
  const week  = activeWeek(store)
  const loadWeek = useWeekLoader()

  function go(weekId: string, opts?: { startDate?: string; startMeal?: 'lunch' | 'middag' }) {
    store.setActiveWeek(weekId)
    loadWeek(weekId, opts)
  }

  function goNext() {
    const nw = nextWeekWindow(week)
    go(nw.weekId, { startDate: nw.startDate, startMeal: nw.startMeal })
  }

  const isCurrentWeek = store.activeWeekId === currentWeekId()

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => go(prevWeekId(store.activeWeekId))}
        className="p-1 rounded-lg hover:bg-gray-100 text-gray-600 font-bold text-lg leading-none"
        aria-label="Föregående vecka"
      >
        ‹
      </button>

      <button
        onClick={() => go(currentWeekId())}
        className={`text-sm font-medium px-2 py-1 rounded-lg transition-colors ${
          isCurrentWeek
            ? 'text-brand-700 bg-brand-50'
            : 'text-gray-600 hover:bg-gray-100'
        }`}
      >
        {formatWeekLabel(store.activeWeekId)}
      </button>

      <button
        onClick={goNext}
        className="p-1 rounded-lg hover:bg-gray-100 text-gray-600 font-bold text-lg leading-none"
        aria-label="Nästa vecka"
      >
        ›
      </button>
    </div>
  )
}
