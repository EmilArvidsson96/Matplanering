import { useState, useEffect } from 'react'
import { v4 as uuid } from 'uuid'
import { Wand, Lightbulb, Loader2, X, Check } from 'lucide-react'
import { useLibraryStore } from '../../store/libraryStore'
import { useSettingsStore } from '../../store/settingsStore'
import { splitInstructions, suggestRecipeImprovements } from '../../api/anthropic'
import type { RecipeImprovement } from '../../api/anthropic'
import type { Dish, RecipeStep } from '../../types'

// ---------------------------------------------------------------------------
// Modal shell
// ---------------------------------------------------------------------------
function Modal({ title, onClose, children }: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-xl max-h-[85vh] flex flex-col">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 shrink-0">
          <h3 className="flex-1 text-sm font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Split instructions tool (Haiku)
// ---------------------------------------------------------------------------
function SplitTool({ dish, onClose }: { dish: Dish; onClose: () => void }) {
  const { settings } = useSettingsStore()
  const updateDish = useLibraryStore(s => s.updateDish)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [steps, setSteps] = useState<string[] | null>(null)

  async function run() {
    setLoading(true); setError(null); setSteps(null)
    try {
      setSteps(await splitInstructions(dish, settings))
    } catch (e: any) {
      setError(e.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }

  // Kick off on first render
  useEffect(() => { run() }, [])

  function apply() {
    if (!steps) return
    const next: RecipeStep[] = steps.map(text => ({ id: uuid(), text }))
    updateDish(dish.id, { instructions: next })
    onClose()
  }

  const current = (dish.instructions ?? []).filter(s => s.text.trim())

  return (
    <Modal title="Dela upp i tydligare steg" onClose={onClose}>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-gray-500 py-8 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Analyserar med Haiku…
          </div>
        )}
        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>
        )}
        {steps && !loading && (
          <div className="space-y-4">
            <p className="text-xs text-gray-500">
              {current.length} steg → <span className="font-semibold text-gray-700">{steps.length} steg</span>.
              Granska förslaget innan du använder det.
            </p>
            <ol className="space-y-2">
              {steps.map((s, i) => (
                <li key={i} className="flex gap-2 items-start text-sm">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-brand-100 text-brand-700 text-xs flex items-center justify-center font-bold mt-0.5">
                    {i + 1}
                  </span>
                  <p className="flex-1 text-gray-800 leading-relaxed">{s}</p>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
      <div className="flex gap-2 px-4 py-3 border-t border-gray-200 shrink-0">
        {error && (
          <button onClick={run} className="text-sm px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">
            Försök igen
          </button>
        )}
        <button
          onClick={apply}
          disabled={!steps || loading}
          className="ml-auto flex items-center gap-1.5 text-sm px-3 py-1.5 bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-40"
        >
          <Check className="w-4 h-4" /> Ersätt instruktionerna
        </button>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Improvement suggestions tool (Sonnet)
// ---------------------------------------------------------------------------
function ImproveTool({ dish, onClose }: { dish: Dish; onClose: () => void }) {
  const { settings } = useSettingsStore()
  const updateDish = useLibraryStore(s => s.updateDish)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<RecipeImprovement[] | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())

  async function run() {
    setLoading(true); setError(null); setItems(null); setSelected(new Set())
    try {
      setItems(await suggestRecipeImprovements(dish, settings))
    } catch (e: any) {
      setError(e.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { run() }, [])

  function toggle(i: number) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  function apply() {
    if (!items) return
    const chosen = items.filter((_, i) => selected.has(i))
    if (chosen.length === 0) return
    const additions = chosen.map(c => `• ${c.title}: ${c.detail}`).join('\n')
    const existing = (dish.notes ?? '').trim()
    const notes = existing ? `${existing}\n${additions}` : additions
    updateDish(dish.id, { notes })
    onClose()
  }

  return (
    <Modal title="Förbättringsförslag" onClose={onClose}>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-gray-500 py-8 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Funderar med Sonnet…
          </div>
        )}
        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>
        )}
        {items && !loading && (
          items.length === 0 ? (
            <p className="text-sm text-gray-400 italic py-6 text-center">Inga förslag den här gången.</p>
          ) : (
            <>
              <p className="text-xs text-gray-500">Bocka för de förslag du vill lägga till i receptets anteckningar.</p>
              <ul className="space-y-2">
                {items.map((it, i) => (
                  <li key={i}>
                    <label className={`flex gap-2.5 items-start p-3 rounded-xl border cursor-pointer transition-colors ${
                      selected.has(i) ? 'border-brand-300 bg-brand-50' : 'border-gray-200 hover:bg-gray-50'
                    }`}>
                      <input
                        type="checkbox"
                        checked={selected.has(i)}
                        onChange={() => toggle(i)}
                        className="mt-1 accent-brand-500"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-800">{it.title}</span>
                          <span className="text-[10px] uppercase tracking-wide text-brand-600 bg-brand-100 rounded px-1.5 py-0.5">{it.category}</span>
                        </div>
                        <p className="text-sm text-gray-600 leading-relaxed mt-0.5">{it.detail}</p>
                      </div>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )
        )}
      </div>
      <div className="flex gap-2 px-4 py-3 border-t border-gray-200 shrink-0">
        {error && (
          <button onClick={run} className="text-sm px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">
            Försök igen
          </button>
        )}
        <button
          onClick={apply}
          disabled={selected.size === 0}
          className="ml-auto flex items-center gap-1.5 text-sm px-3 py-1.5 bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-40"
        >
          <Check className="w-4 h-4" /> Lägg till {selected.size > 0 ? `(${selected.size})` : ''}
        </button>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Entry point: two header buttons + active modal
// ---------------------------------------------------------------------------
export default function RecipeAiTools({ dish }: { dish: Dish }) {
  const [tool, setTool] = useState<'split' | 'improve' | null>(null)

  return (
    <>
      <button
        onClick={() => setTool('split')}
        title="Dela upp instruktionerna i tydligare steg (AI)"
        className="p-1.5 text-gray-400 hover:text-brand-600 rounded-lg hover:bg-brand-50"
      >
        <Wand className="w-4 h-4" />
      </button>
      <button
        onClick={() => setTool('improve')}
        title="Få förbättringsförslag för receptet (AI)"
        className="p-1.5 text-gray-400 hover:text-amber-500 rounded-lg hover:bg-amber-50"
      >
        <Lightbulb className="w-4 h-4" />
      </button>

      {tool === 'split' && <SplitTool dish={dish} onClose={() => setTool(null)} />}
      {tool === 'improve' && <ImproveTool dish={dish} onClose={() => setTool(null)} />}
    </>
  )
}
