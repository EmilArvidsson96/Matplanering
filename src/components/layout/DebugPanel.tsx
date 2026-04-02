import { useState } from 'react'
import { useWeekStore, activeWeek } from '../../store/weekStore'
import { useLibraryStore } from '../../store/libraryStore'
import { useSettingsStore } from '../../store/settingsStore'
import type { SaveStatus, SaveError } from '../../hooks/useAutoSave'

interface Props {
  onClose: () => void
  saveStatus: SaveStatus
  saveError: SaveError
}

export default function DebugPanel({ onClose, saveStatus, saveError }: Props) {
  const weekStore    = useWeekStore()
  const libraryStore = useLibraryStore()
  const settingsStore = useSettingsStore()
  const week = activeWeek(weekStore)

  const [tab, setTab] = useState<'save' | 'week' | 'store'>('save')

  const TAB_CLS = (t: typeof tab) =>
    `px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
      tab === t ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-gray-200'
    }`

  return (
    <div className="fixed bottom-0 right-0 z-50 w-full max-w-lg bg-gray-900 text-gray-100 rounded-t-2xl shadow-2xl font-mono text-xs">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-gray-400">🐛 Debug</span>
          <span className="text-gray-600">Ctrl+Shift+D</span>
        </div>
        <div className="flex gap-1">
          <button onClick={() => setTab('save')} className={TAB_CLS('save')}>Spara</button>
          <button onClick={() => setTab('week')} className={TAB_CLS('week')}>Vecka</button>
          <button onClick={() => setTab('store')} className={TAB_CLS('store')}>Store</button>
          <button onClick={onClose} className="ml-2 text-gray-500 hover:text-gray-300 text-sm">✕</button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 max-h-64 overflow-y-auto space-y-2">
        {tab === 'save' && (
          <>
            <Row label="Status" value={saveStatus} color={saveStatus === 'error' ? 'text-red-400' : saveStatus === 'saved' ? 'text-green-400' : 'text-gray-300'} />
            <Row label="Fel" value={saveError ?? '—'} color="text-red-300" />
            <Row label="Dirty veckor" value={[...weekStore.dirtyWeeks].join(', ') || '—'} />
            <Row label="Library dirty" value={String(libraryStore.isDirty)} />
            <Row label="Settings dirty" value={String(settingsStore.isDirty)} />
            <Row label="Library SHA" value={libraryStore.sha ?? '(ingen)'} />
          </>
        )}

        {tab === 'week' && (
          <>
            <Row label="Aktiv vecka" value={weekStore.activeWeekId} />
            <Row label="startDate" value={week.startDate} />
            <Row label="endDate" value={week.endDate} />
            <Row label="Slots" value={String(week.schedule.length)} />
            <Row label="Måltider" value={String(week.meals.length)} />
            <div className="mt-2 space-y-0.5">
              {week.schedule.map(s => (
                <div key={`${s.date}-${s.type}`} className="text-gray-400">
                  {s.date} {s.type.padEnd(6)} port:{s.portionsNeeded} assigned:{s.assignedMealIds.length}
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'store' && (
          <pre className="text-gray-400 text-xs whitespace-pre-wrap break-all">
            {JSON.stringify({
              activeWeekId: weekStore.activeWeekId,
              loadedWeeks: Object.keys(weekStore.weeks),
              dirtyWeeks: [...weekStore.dirtyWeeks],
              libraryDishes: libraryStore.dishes.length,
              librarySha: libraryStore.sha,
              settings: settingsStore.settings,
            }, null, 2)}
          </pre>
        )}
      </div>
    </div>
  )
}

function Row({ label, value, color = 'text-gray-300' }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-gray-500 w-28 shrink-0">{label}</span>
      <span className={color}>{value}</span>
    </div>
  )
}
