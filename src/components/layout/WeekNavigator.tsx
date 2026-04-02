import { useWeekStore } from '../../store/weekStore'
import { prevWeekId, nextWeekId, formatWeekLabel, currentWeekId } from '../../utils/weekUtils'
import { useWeekLoader } from '../../hooks/useWeekLoader'

export default function WeekNavigator() {
  const { activeWeekId, setActiveWeek } = useWeekStore()
  const loadWeek = useWeekLoader()

  const go = (id: string) => {
    setActiveWeek(id)
    loadWeek(id)
  }

  const isCurrentWeek = activeWeekId === currentWeekId()

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => go(prevWeekId(activeWeekId))}
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
        {formatWeekLabel(activeWeekId)}
      </button>

      <button
        onClick={() => go(nextWeekId(activeWeekId))}
        className="p-1 rounded-lg hover:bg-gray-100 text-gray-600 font-bold text-lg leading-none"
        aria-label="Nästa vecka"
      >
        ›
      </button>
    </div>
  )
}
