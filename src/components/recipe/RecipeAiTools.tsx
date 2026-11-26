import { useState, useEffect, useRef } from 'react'
import { v4 as uuid } from 'uuid'
import { Wand, Lightbulb, Loader2, Check, RefreshCw } from 'lucide-react'
import { useLibraryStore } from '../../store/libraryStore'
import { useSettingsStore } from '../../store/settingsStore'
import { splitInstructions, splitInputHash, suggestRecipeImprovements } from '../../api/anthropic'
import type { Dish, DishAiData, RecipeImprovement, RecipeStep } from '../../types'
import SubPage, { type SubPageHandle } from '../common/SubPage'

/** Merge AI results into the dish's saved `ai` data, using the latest store state. */
function saveAiData(dishId: string, patch: Partial<DishAiData>) {
  const { dishes, updateDish } = useLibraryStore.getState()
  const current = dishes.find(d => d.id === dishId)
  if (!current) return
  updateDish(dishId, { ai: { ...current.ai, ...patch } })
}

// ---------------------------------------------------------------------------
// Sub-page shell
// ---------------------------------------------------------------------------
function ToolPage({ title, onClose, children, pageRef }: {
  title: string
  onClose: () => void
  children: React.ReactNode
  pageRef?: React.Ref<SubPageHandle>
}) {
  // Shared sub-page; the tool content sits on a white card.
  return (
    <SubPage ref={pageRef} title={title} onClose={onClose}>
      <div className="bg-white rounded-3xl overflow-hidden flex flex-col">
        {children}
      </div>
    </SubPage>
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

  async function run(force = false) {
    setLoading(true); setError(null); setSteps(null)
    try {
      const result = await splitInstructions(dish, settings, { force })
      setSteps(result)
      // Save on the recipe right away, so the result isn't lost if the
      // dialog is closed without applying it.
      if (dish.ai?.split?.hash !== splitInputHash(dish) || force) {
        saveAiData(dish.id, {
          split: { hash: splitInputHash(dish), steps: result, at: new Date().toISOString() },
        })
      }
    } catch (e: any) {
      setError(e.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }

  // Kick off on first render (uses cached result if available)
  useEffect(() => { run() }, [])

  const pageRef = useRef<SubPageHandle>(null)

  function apply() {
    if (!steps) return
    const next: RecipeStep[] = steps.map(text => ({ id: uuid(), text }))
    updateDish(dish.id, { instructions: next })
    pageRef.current ? pageRef.current.close() : onClose()
  }

  const current = (dish.instructions ?? []).filter(s => s.text.trim())

  return (
    <ToolPage pageRef={pageRef} title="Dela upp i tydligare steg" onClose={onClose}>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-ink-muted py-8 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Analyserar med Sonnet…
          </div>
        )}
        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>
        )}
        {steps && !loading && (
          <div className="space-y-4">
            <p className="text-xs text-ink-muted">
              {current.length} steg → <span className="font-semibold text-ink-soft">{steps.length} steg</span>,
              översatt till svenska med rättad stavning. Granska förslaget innan du använder det.
            </p>
            <ol className="space-y-2">
              {steps.map((s, i) => (
                <li key={i} className="flex gap-2 items-start text-sm">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-brand-100 text-brand-700 text-xs flex items-center justify-center font-bold mt-0.5">
                    {i + 1}
                  </span>
                  <p className="flex-1 text-ink leading-relaxed">{s}</p>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
      <div className="flex gap-2 px-4 py-3 border-t border-line shrink-0">
        {error && (
          <button onClick={() => run()} className="text-sm px-3 py-1.5 border border-line rounded-lg text-ink-muted hover:bg-canvas">
            Försök igen
          </button>
        )}
        {steps && !loading && (
          <button
            onClick={() => run(true)}
            title="Gör en ny förfrågan (sparat resultat används annars)"
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-line rounded-lg text-ink-muted hover:bg-canvas"
          >
            <RefreshCw className="w-4 h-4" /> Gör om
          </button>
        )}
        <button
          onClick={apply}
          disabled={!steps || loading}
          className="ml-auto flex items-center gap-1.5 text-sm px-3 py-1.5 bg-brand-500 text-white rounded-full hover:bg-brand-600 disabled:opacity-40"
        >
          <Check className="w-4 h-4" /> Ersätt instruktionerna
        </button>
      </div>
    </ToolPage>
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

  async function run(force = false) {
    setLoading(true); setError(null); setItems(null); setSelected(new Set())
    try {
      const result = await suggestRecipeImprovements(dish, settings, { force })
      setItems(result)
      if (result !== dish.ai?.improvements?.items) {
        saveAiData(dish.id, { improvements: { items: result, at: new Date().toISOString() } })
      }
    } catch (e: any) {
      setError(e.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }

  // Kick off on first render (uses cached result if available)
  useEffect(() => { run() }, [])

  function toggle(i: number) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  const pageRef = useRef<SubPageHandle>(null)

  function apply() {
    if (!items) return
    const chosen = items.filter((_, i) => selected.has(i))
    if (chosen.length === 0) return
    const additions = chosen.map(c => `• ${c.title}: ${c.detail}`).join('\n')
    const existing = (dish.notes ?? '').trim()
    const notes = existing ? `${existing}\n${additions}` : additions
    const marked = items.map((it, i) => (selected.has(i) ? { ...it, applied: true } : it))
    const latest = useLibraryStore.getState().dishes.find(d => d.id === dish.id)
    updateDish(dish.id, {
      notes,
      ai: { ...latest?.ai, improvements: { items: marked, at: latest?.ai?.improvements?.at ?? new Date().toISOString() } },
    })
    pageRef.current ? pageRef.current.close() : onClose()
  }

  return (
    <ToolPage pageRef={pageRef} title="Förbättringsförslag" onClose={onClose}>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-ink-muted py-8 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Funderar med Sonnet…
          </div>
        )}
        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>
        )}
        {items && !loading && (
          items.length === 0 ? (
            <p className="text-sm text-ink-faint italic py-6 text-center">Inga förslag den här gången.</p>
          ) : (
            <>
              <p className="text-xs text-ink-muted">Bocka för de förslag du vill lägga till i receptets anteckningar. Förslagen sparas på receptet.</p>
              <ul className="space-y-2">
                {items.map((it, i) => (
                  <li key={i}>
                    <label className={`flex gap-2.5 items-start p-3 rounded-xl border transition-colors ${
                      it.applied ? 'border-line-soft bg-canvas opacity-60 cursor-default'
                        : selected.has(i) ? 'border-brand-300 bg-brand-50 cursor-pointer' : 'border-line hover:bg-canvas cursor-pointer'
                    }`}>
                      <input
                        type="checkbox"
                        checked={it.applied || selected.has(i)}
                        disabled={it.applied}
                        onChange={() => toggle(i)}
                        className="mt-1 accent-brand-500"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-ink">{it.title}</span>
                          <span className="text-[10px] uppercase tracking-wide text-brand-600 bg-brand-100 rounded px-1.5 py-0.5">{it.category}</span>
                          {it.applied && <span className="text-[10px] text-ink-muted">Tillagd</span>}
                        </div>
                        <p className="text-sm text-ink-muted leading-relaxed mt-0.5">{it.detail}</p>
                      </div>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )
        )}
      </div>
      <div className="flex gap-2 px-4 py-3 border-t border-line shrink-0">
        {error && (
          <button onClick={() => run()} className="text-sm px-3 py-1.5 border border-line rounded-lg text-ink-muted hover:bg-canvas">
            Försök igen
          </button>
        )}
        {items && !loading && (
          <button
            onClick={() => run(true)}
            title="Hämta nya förslag (sparat resultat används annars)"
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-line rounded-lg text-ink-muted hover:bg-canvas"
          >
            <RefreshCw className="w-4 h-4" /> Nya förslag
          </button>
        )}
        <button
          onClick={apply}
          disabled={selected.size === 0}
          className="ml-auto flex items-center gap-1.5 text-sm px-3 py-1.5 bg-brand-500 text-white rounded-full hover:bg-brand-600 disabled:opacity-40"
        >
          <Check className="w-4 h-4" /> Lägg till {selected.size > 0 ? `(${selected.size})` : ''}
        </button>
      </div>
    </ToolPage>
  )
}

// ---------------------------------------------------------------------------
// Entry point: two header buttons + active sub-page
// ---------------------------------------------------------------------------
export default function RecipeAiTools({ dish }: { dish: Dish }) {
  const [tool, setTool] = useState<'split' | 'improve' | null>(null)

  return (
    <>
      <button
        onClick={() => setTool('split')}
        title="Dela upp i tydligare steg, översätt till svenska och rätta stavning (AI)"
        aria-label="Dela upp i steg med AI"
        className="w-10 h-10 rounded-full flex items-center justify-center transition-colors text-ink-muted hover:text-brand-700 hover:bg-canvas"
      >
        <Wand className="w-[18px] h-[18px]" />
      </button>
      <button
        onClick={() => setTool('improve')}
        title="Få förbättringsförslag för receptet (AI)"
        aria-label="Förbättringsförslag med AI"
        className="w-10 h-10 rounded-full flex items-center justify-center transition-colors text-ink-muted hover:text-amber-700 hover:bg-canvas"
      >
        <Lightbulb className="w-[18px] h-[18px]" />
      </button>

      {tool === 'split' && <SplitTool dish={dish} onClose={() => setTool(null)} />}
      {tool === 'improve' && <ImproveTool dish={dish} onClose={() => setTool(null)} />}
    </>
  )
}
