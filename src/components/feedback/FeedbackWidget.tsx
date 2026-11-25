import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Bug, Lightbulb, Loader2, MessageSquarePlus, Send } from 'lucide-react'
import Modal from '../common/Modal'
import { useIsDesktop } from '../../hooks/useDevice'
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

  // Desktop: sits in the sidebar above the save status. Mobile: above the floating tab bar
  // (pages keep bottom padding for it), so it never covers headers or actions.
  const bottomOffset = isDesktop ? 120 : 104
  const buttonSize   = 48

  return (
    <>
      <div
        className="fixed right-4 md:right-auto md:left-7 z-40"
        style={{ top: `calc(100dvh - ${bottomOffset + buttonSize}px)` }}
      >
        <button
          onClick={() => setOpen(true)}
          className="w-12 h-12 rounded-full bg-white text-ink border border-line shadow-[0_4px_16px_rgba(21,23,26,0.10)] flex items-center justify-center hover:bg-canvas active:scale-95 transition-all"
          aria-label="Ge feedback"
        >
          <MessageSquarePlus className="w-5 h-5" />
        </button>
      </div>

      {open && (
        <Modal title="Skicka feedback" onClose={close}>
          {state === 'sent' ? (
            <div className="py-6 text-center text-brand-700 font-medium">
              Tack! Vi har tagit emot din feedback.
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex gap-2">
                <button
                  onClick={() => setType('bug')}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium border transition-colors ${
                    type === 'bug'
                      ? 'bg-red-50 border-red-300 text-red-700'
                      : 'border-line text-ink-muted hover:bg-canvas'
                  }`}
                >
                  <Bug className="w-4 h-4" /> Bugg
                </button>
                <button
                  onClick={() => setType('idea')}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium border transition-colors ${
                    type === 'idea'
                      ? 'bg-amber-50 border-amber-300 text-amber-700'
                      : 'border-line text-ink-muted hover:bg-canvas'
                  }`}
                >
                  <Lightbulb className="w-4 h-4" /> Förslag
                </button>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-ink-muted">Titel</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={type === 'bug' ? 'Vad gick fel?' : 'Vad vill du kunna göra?'}
                  className="field focus:outline-none focus:ring-2 focus:ring-brand-300"
                  autoFocus
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-ink-muted">Beskrivning (valfritt)</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  placeholder="Fler detaljer, t.ex. vad du gjorde när det hände."
                  className="field h-auto py-3 resize-none"
                />
              </div>

              <p className="text-xs text-ink-faint -mt-1">
                Sidan, enheten och lite teknisk info skickas med automatiskt för att göra det lättare att förstå.
              </p>

              {state === 'error' && <p className="text-sm text-red-700">{error}</p>}

              <div className="flex justify-end gap-2">
                <button onClick={close} className="px-3 py-2 text-sm text-ink-muted hover:text-ink-soft">
                  Avbryt
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!title.trim() || state === 'sending'}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
