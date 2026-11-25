import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useWeekStore, activeWeek } from '../../store/weekStore'
import { prevWeekId, formatWeekParts, currentWeekId, nextWeekWindow } from '../../utils/weekUtils'
import { useWeekLoader } from '../../hooks/useWeekLoader'

export default function WeekNavigator({ size = 'md' }: { size?: 'md' | 'lg' }) {
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
  const { title, range } = formatWeekParts(store.activeWeekId)

  return (
    <div className="flex items-end justify-between gap-3 w-full">
      <div className="flex flex-col gap-1 min-w-0">
        <span className="text-[13px] font-medium text-ink-muted flex items-center gap-2">
          {range}
          {!isCurrentWeek && (
            <button
              onClick={() => go(currentWeekId())}
              className="px-2 py-0.5 rounded-full bg-mint text-mint-ink text-xs font-semibold"
            >
              Till denna vecka
            </button>
          )}
        </span>
        <h1 className={`font-display font-extrabold tracking-tight leading-none text-ink ${size === 'lg' ? 'text-[44px]' : 'text-[32px]'}`}>
          {title}
        </h1>
      </div>
      <div className="flex gap-2 shrink-0">
        <button
          onClick={() => go(prevWeekId(store.activeWeekId))}
          className="icon-btn bg-white border border-line text-ink hover:bg-canvas"
          aria-label="Föregående vecka"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button
          onClick={goNext}
          className="icon-btn bg-white border border-line text-ink hover:bg-canvas"
          aria-label="Nästa vecka"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  )
}
