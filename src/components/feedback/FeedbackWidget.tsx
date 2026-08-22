import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Bug, Lightbulb, Loader2, MessageSquarePlus, Send } from 'lucide-react'
import Modal from '../common/Modal'
import { useIsDesktop } from '../../hooks/useDevice'
import { useNearBottom } from '../../hooks/useNearBottom'
import { useWeekStore } from '../../store/weekStore'
import { useLibraryStore } from '../../store/libraryStore'
import { useSettingsStore } from '../../store/settingsStore'
import { useGameStore } from '../../store/gameStore'
import { getRecentLogs } from '../../utils/clientLog'
import { submitFeedback } from '../../api/feedback'
import type { FeedbackType } from '../../api/feedback'

const PAGE_LABELS: Record<string, string> = {
  '/': 'Veckoplanen',
  '/recept': 'Recept',
  '/bibliotek': 'Bibliotek',
  '/inkop': 'Inköp',
  '/inst': 'Inställningar',
  '/spel': 'Spel',
}

type SubmitState = 'idle' | 'sending' | 'sent' | 'error'

export default function FeedbackWidget() {
  const isDesktop = useIsDesktop()
  const nearBottom = useNearBottom()
  const location = useLocation()

  const [open, setOpen] = useState(false)
  const [type, setType] = useState<FeedbackType>('bug')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [state, setState] = useState<SubmitState>('idle')
  const [error, setError] = useState<string | null>(null)

  const weekStore = useWeekStore()
  const libraryStore = useLibraryStore()
  const settingsStore = useSettingsStore()
  const gameStore = useGameStore()

  function close() {
    setOpen(false)
    setType('bug')
    setTitle('')
    setDescription('')
    setState('idle')
    setError(null)
  }

  async function handleSubmit() {
    if (!title.trim()) return
    setState('sending')
    setError(null)
    try {
      await submitFeedback({
        type,
        title,
        description,
        context: {
          page: PAGE_LABELS[location.pathname] ?? location.pathname,
          path: location.pathname,
          device: isDesktop ? 'desktop' : 'mobile',
          viewport: `${window.innerWidth}×${window.innerHeight}`,
          userAgent: navigator.userAgent,
          gameMode: gameStore.data.gameMode,
          activeWeekId: weekStore.activeWeekId,
          dirty: {
            weeks: weekStore.dirtyWeeks.size,
            library: libraryStore.isDirty,
            settings: settingsStore.isDirty,
            game: gameStore.isDirty,
          },
          settings: {
            defaultHouseholdSize: settingsStore.settings.defaultHouseholdSize,
            aiModel: settingsStore.settings.aiModel ?? 'haiku',
            calibrationModel: settingsStore.settings.calibrationModel ?? 'sonnet',
          },
          recentLogs: getRecentLogs().map((l) => `[${l.level}] ${l.message}`),
          timestamp: new Date().toISOString(),
        },
      })
      setState('sent')
      setTimeout(close, 1500)
    } catch (e) {
      setState('error')
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  // Anchored to `top` so the position transition is a single animatable value:
  // resting state parks it near the bottom, near-bottom scroll shifts it up top.
  const bottomOffset = isDesktop ? 24 : 76 // clears the mobile bottom nav
  const topOffset     = isDesktop ? 24 : 96 // clears the mobile header
  const buttonSize    = 56

  return (
    <>
      <div
        className="fixed right-4 md:right-6 z-40 transition-[top] duration-500 ease-in-out"
        style={{ top: nearBottom ? topOffset : `calc(100dvh - ${bottomOffset + buttonSize}px)` }}
      >
        <button
          onClick={() => setOpen(true)}
          className="w-14 h-14 rounded-full bg-brand-600 text-white shadow-lg flex items-center justify-center hover:bg-brand-700 active:scale-95 transition-all"
          aria-label="Ge feedback"
        >
          <MessageSquarePlus className="w-6 h-6" />
        </button>
      </div>

      {open && (
        <Modal title="Skicka feedback" onClose={close}>
          {state === 'sent' ? (
            <div className="py-6 text-center text-green-600 font-medium">
              Tack! Vi har tagit emot din feedback.
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex gap-2">
                <button
                  onClick={() => setType('bug')}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${
                    type === 'bug'
                      ? 'bg-red-50 border-red-300 text-red-700'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Bug className="w-4 h-4" /> Bugg
                </button>
                <button
                  onClick={() => setType('idea')}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${
                    type === 'idea'
                      ? 'bg-amber-50 border-amber-300 text-amber-700'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Lightbulb className="w-4 h-4" /> Förslag
                </button>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-500">Titel</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={type === 'bug' ? 'Vad gick fel?' : 'Vad vill du kunna göra?'}
                  className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                  autoFocus
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-500">Beskrivning (valfritt)</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  placeholder="Fler detaljer, t.ex. vad du gjorde när det hände."
                  className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 resize-none"
                />
              </div>

              <p className="text-xs text-gray-400 -mt-1">
                Sidan, enheten och lite teknisk info skickas med automatiskt för att göra det lättare att förstå.
              </p>

              {state === 'error' && <p className="text-sm text-red-500">{error}</p>}

              <div className="flex justify-end gap-2">
                <button onClick={close} className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700">
                  Avbryt
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!title.trim() || state === 'sending'}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {state === 'sending' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Skicka
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </>
  )
}
