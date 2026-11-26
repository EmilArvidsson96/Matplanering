import { useState, useRef, useEffect, useCallback } from 'react'
import { v4 as uuid } from 'uuid'
import {
  ArrowLeft, Minus, Plus, Sunrise, Pencil, Check,
  Download, Upload, ExternalLink, ChevronDown, ChevronUp, Trash2,
} from 'lucide-react'
import { useLibraryStore } from '../../store/libraryStore'
import { useSettingsStore } from '../../store/settingsStore'
import { useMinWidth } from '../../hooks/useDevice'
import RecipeAiTools from './RecipeAiTools'
import SegmentedControl from '../common/SegmentedControl'
import type { Dish, RecipeStep, Ingredient } from '../../types'
import { ingredientImpact, dishImpactPerPortion, climateGrade, CLIMATE_COLORS, formatSEK, formatCO2e } from '../../utils/ingredientImpact'

// ---------------------------------------------------------------------------
// Wake Lock
// ---------------------------------------------------------------------------
function useWakeLock() {
  const [active, setActive] = useState(false)
  const lockRef = useRef<WakeLockSentinel | null>(null)

  const toggle = useCallback(async () => {
    if (!('wakeLock' in navigator)) return
    if (lockRef.current != null) {
      await lockRef.current.release()
      lockRef.current = null
      setActive(false)
    } else {
      try {
        const sentinel = await (navigator as any).wakeLock.request('screen')
        lockRef.current = sentinel
        setActive(true)
        sentinel.addEventListener('release', () => {
          lockRef.current = null
          setActive(false)
        })
      } catch {
        // permission denied or not supported
      }
    }
  }, [])

  // Release on unmount
  useEffect(() => () => { lockRef.current?.release() }, [])

  return { active, toggle, supported: 'wakeLock' in navigator }
}

// ---------------------------------------------------------------------------
// Inline ingredient injection
// ---------------------------------------------------------------------------
function injectAmounts(text: string, ingredients: Ingredient[], portions: number): React.ReactNode[] {
  if (ingredients.length === 0) return [text]

  // Build a sorted list (longest name first to avoid partial matches)
  const sorted = [...ingredients].sort((a, b) => b.name.length - a.name.length)

  // Build a regex alternating all ingredient names (case-insensitive)
  const pattern = new RegExp(
    `(${sorted.map(i => i.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
    'gi'
  )

  const parts = text.split(pattern)
  return parts.map((part, idx) => {
    const match = sorted.find(i => i.name.toLowerCase() === part.toLowerCase())
    if (match) {
      const scaled = (match.amount * portions) / (match.portionsBase || 1)
      if (scaled === 0) return part
      const rounded = scaled % 1 === 0 ? scaled : parseFloat(scaled.toFixed(1))
      return (
        <span key={idx}>
          {part}
          <span className="text-brand-700 font-semibold">
            {' '}({rounded} {match.unit})
          </span>
        </span>
      )
    }
    return part
  })
}

// ---------------------------------------------------------------------------
// Scaled ingredient amount display
// ---------------------------------------------------------------------------
function scaleAmount(ingredient: Ingredient, portions: number): string {
  const base = ingredient.portionsBase || 1
  const scaled = (ingredient.amount * portions) / base
  if (scaled === 0) return '–'
  const rounded = scaled % 1 === 0 ? scaled : parseFloat(scaled.toFixed(1))
  return `${rounded} ${ingredient.unit}`
}

// ---------------------------------------------------------------------------
// Step editor
// ---------------------------------------------------------------------------
function StepEditor({
  step,
  index,
  onSave,
  onDelete,
  onCancel,
}: {
  step: RecipeStep
  index: number
  onSave: (text: string) => void
  onDelete: () => void
  onCancel: () => void
}) {
  const [text, setText] = useState(step.text)
  return (
    <div className="card p-4 flex gap-3.5 items-start ring-2 ring-brand-300">
      <span className="shrink-0 w-7 h-7 rounded-full bg-ink text-white font-display text-sm font-bold flex items-center justify-center">
        {index + 1}
      </span>
      <div className="flex-1 space-y-2.5">
        <textarea
          autoFocus
          value={text}
          onChange={e => setText(e.target.value)}
          rows={3}
          className="w-full text-base leading-relaxed bg-canvas rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-300 resize-none"
        />
        <div className="flex gap-2">
          <button
            onClick={() => onSave(text)}
            className="h-10 px-4 rounded-full bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold flex items-center gap-1.5"
          >
            <Check className="w-4 h-4" /> Spara
          </button>
          <button
            onClick={onCancel}
            className="h-10 px-4 rounded-full border border-line text-ink text-sm font-semibold hover:bg-canvas"
          >
            Avbryt
          </button>
          <button
            onClick={onDelete}
            aria-label="Ta bort steg"
            className="w-10 h-10 rounded-full text-red-700 hover:bg-red-50 ml-auto flex items-center justify-center"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Instructions panel
// ---------------------------------------------------------------------------
function InstructionsPanel({
  dish,
  portions,
  scrollRef,
  editMode,
  onStepsChange,
}: {
  dish: Dish
  portions: number
  scrollRef: React.RefObject<HTMLDivElement>
  editMode: boolean
  onStepsChange: (steps: RecipeStep[]) => void
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [addingNew, setAddingNew] = useState(false)

  function saveStep(id: string, text: string) {
    onStepsChange((dish.instructions ?? []).map(s => s.id === id ? { ...s, text } : s))
    setEditingId(null)
  }

  function deleteStep(id: string) {
    onStepsChange((dish.instructions ?? []).filter(s => s.id !== id))
    setEditingId(null)
  }

  function addStep(text: string) {
    if (!text.trim()) { setAddingNew(false); return }
    onStepsChange([...(dish.instructions ?? []), { id: uuid(), text: text.trim() }])
    setAddingNew(false)
  }

  function moveStep(idx: number, dir: -1 | 1) {
    const steps = [...(dish.instructions ?? [])]
    const target = idx + dir
    if (target < 0 || target >= steps.length) return
    ;[steps[idx], steps[target]] = [steps[target], steps[idx]]
    onStepsChange(steps)
  }

  const hasSteps = (dish.instructions ?? []).length > 0

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto px-4 md:px-6 pb-6 space-y-2.5">
      {!hasSteps && !editMode && (
        <p className="card p-5 text-sm text-ink-muted">Inga instruktioner tillagda ännu.</p>
      )}

      {(dish.instructions ?? []).map((step, idx) => (
        <div key={step.id}>
          {editMode && editingId === step.id ? (
            <StepEditor
              step={step}
              index={idx}
              onSave={text => saveStep(step.id, text)}
              onDelete={() => deleteStep(step.id)}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <div className="card p-4 flex gap-3.5 items-start group">
              <span className="shrink-0 w-7 h-7 rounded-full bg-ink text-white font-display text-sm font-bold flex items-center justify-center">
                {idx + 1}
              </span>
              <p className="flex-1 text-base text-ink leading-relaxed pt-0.5">
                {injectAmounts(step.text, dish.ingredients, portions)}
              </p>
              {editMode && (
                <div className="flex flex-col -my-1 -mr-1">
                  <button onClick={() => moveStep(idx, -1)} disabled={idx === 0} aria-label="Flytta upp" className="w-9 h-9 rounded-full flex items-center justify-center text-ink-muted hover:bg-canvas disabled:opacity-30">
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button onClick={() => moveStep(idx, 1)} disabled={idx === (dish.instructions ?? []).length - 1} aria-label="Flytta ned" className="w-9 h-9 rounded-full flex items-center justify-center text-ink-muted hover:bg-canvas disabled:opacity-30">
                    <ChevronDown className="w-4 h-4" />
                  </button>
                  <button onClick={() => setEditingId(step.id)} aria-label="Redigera steg" className="w-9 h-9 rounded-full flex items-center justify-center text-ink-muted hover:text-brand-700 hover:bg-canvas">
                    <Pencil className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {editMode && (
        addingNew ? (
          <StepEditor
            step={{ id: '', text: '' }}
            index={(dish.instructions ?? []).length}
            onSave={addStep}
            onDelete={() => setAddingNew(false)}
            onCancel={() => setAddingNew(false)}
          />
        ) : (
          <button
            onClick={() => setAddingNew(true)}
            className="w-full h-12 rounded-3xl border-[1.5px] border-dashed border-ink-faint/60 text-ink font-semibold text-[15px] flex items-center justify-center gap-2 hover:bg-white"
          >
            <Plus className="w-4 h-4" /> Lägg till steg
          </button>
        )
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Ingredients panel
// ---------------------------------------------------------------------------
function IngredientsPanel({
  dish,
  portions,
  scrollRef,
}: {
  dish: Dish
  portions: number
  scrollRef: React.RefObject<HTMLDivElement>
}) {
  const conversions = useSettingsStore(s => s.settings.unitConversions)
  const overrides = useSettingsStore(s => s.settings.costOverrides) ?? {}
  if (dish.ingredients.length === 0) {
    return (
      <div ref={scrollRef} className="h-full overflow-y-auto px-4 md:px-6">
        <p className="card p-5 text-sm text-ink-muted">Inga ingredienser tillagda.</p>
      </div>
    )
  }

  const perPortion = dishImpactPerPortion(dish, conversions, overrides)
  const totalCost = perPortion.costSEK * portions
  const totalCO2e = perPortion.co2eKg * portions
  const grade = climateGrade(perPortion.co2eKg)

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto px-4 md:px-6 pb-6 space-y-2.5">
      <ul className="card overflow-hidden divide-y divide-line-soft">
        {dish.ingredients.map(ing => {
          const scaled = (ing.amount * portions) / (ing.portionsBase || 1)
          const imp = ingredientImpact({ name: ing.name, amount: scaled, unit: ing.unit }, conversions, overrides)
          return (
            <li key={ing.id} className="flex items-center justify-between gap-3 px-4 min-h-[52px] py-2">
              <span className="flex-1 min-w-0">
                <span className="block text-[15px] text-ink">{ing.name}</span>
                {imp.matched && (
                  <span className="block text-[11px] text-ink-muted tabular-nums">
                    ~{formatSEK(imp.costSEK)} · {formatCO2e(imp.co2eKg)}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-[15px] font-semibold text-ink tabular-nums">{scaleAmount(ing, portions)}</span>
            </li>
          )
        })}
      </ul>
      <div className="card p-3.5 flex items-center gap-3">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center font-display font-extrabold text-white text-lg shrink-0"
          style={{ background: CLIMATE_COLORS[grade] }}
          title="Klimatbetyg per portion"
        >
          {grade}
        </div>
        <div className="flex-1 min-w-0 leading-snug">
          <div className="text-xs text-ink-muted">Uppskattning för {portions} port.</div>
          <div className="font-semibold text-ink text-[15px]">
            {formatSEK(totalCost)} · {formatCO2e(totalCO2e)} CO₂e
          </div>
          <div className="text-xs text-ink-muted">
            per portion: {formatSEK(perPortion.costSEK)} · {formatCO2e(perPortion.co2eKg)}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
interface Props {
  dish: Dish
  plannedPortions: number | null
  onBack: (() => void) | null
}

type Tab = 'instruktioner' | 'ingredienser'

export default function RecipeDetail({ dish, plannedPortions, onBack }: Props) {
  // Side-by-side instructions + ingredients only when there is room for both
  const isDesktop = useMinWidth(1180)
  const updateDish = useLibraryStore(s => s.updateDish)
  const { active: wakeLockActive, toggle: toggleWakeLock, supported: wakeLockSupported } = useWakeLock()

  const defaultPortions = plannedPortions ?? dish.ingredients[0]?.portionsBase ?? 4
  const [portions, setPortions] = useState(defaultPortions)
  const [editMode, setEditMode] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('instruktioner')

  // Update portions when dish changes
  useEffect(() => {
    setPortions(plannedPortions ?? dish.ingredients[0]?.portionsBase ?? 4)
    setEditMode(false)
  }, [dish.id, plannedPortions])

  // Scroll position memory for mobile tabs
  const instrScrollRef = useRef<HTMLDivElement>(null)
  const ingredScrollRef = useRef<HTMLDivElement>(null)
  const savedScroll = useRef<Record<Tab, number>>({ instruktioner: 0, ingredienser: 0 })

  function switchTab(tab: Tab) {
    // Save current scroll
    const currentRef = activeTab === 'instruktioner' ? instrScrollRef : ingredScrollRef
    savedScroll.current[activeTab] = currentRef.current?.scrollTop ?? 0
    setActiveTab(tab)
    // Restore target scroll after render
    setTimeout(() => {
      const targetRef = tab === 'instruktioner' ? instrScrollRef : ingredScrollRef
      if (targetRef.current) targetRef.current.scrollTop = savedScroll.current[tab]
    }, 0)
  }

  function handleStepsChange(steps: RecipeStep[]) {
    updateDish(dish.id, { instructions: steps })
  }

  // Export instructions
  function exportInstructions() {
    const data = {
      name: dish.name,
      instructions: (dish.instructions ?? []).map((s, i) => ({ step: i + 1, text: s.text })),
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${dish.name.replace(/\s+/g, '_')}_instruktioner.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Import instructions
  function importInstructions() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json,.json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      try {
        const text = await file.text()
        const data = JSON.parse(text)
        // Accept both {instructions:[{step,text}]} and {instructions:[{id,text}]}
        const steps: RecipeStep[] = (data.instructions ?? []).map((s: any) => ({
          id: s.id ?? uuid(),
          text: String(s.text ?? ''),
        })).filter((s: RecipeStep) => s.text)
        if (steps.length === 0) throw new Error('Inga steg hittades')
        updateDish(dish.id, { instructions: steps })
        setImportError(null)
      } catch (e: any) {
        setImportError(`Kunde inte importera: ${e.message}`)
      }
    }
    input.click()
  }

  const header = (
    <div className="px-4 md:px-6 pt-3 md:pt-5 pb-3 shrink-0 space-y-2">
      <div className="flex items-center gap-1">
        {onBack && (
          <button onClick={onBack} aria-label="Tillbaka" className="w-10 h-10 rounded-full flex items-center justify-center transition-colors -ml-1 bg-white border border-line text-ink hover:bg-canvas mr-1">
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <div className="flex-1" />

        {/* Source URL */}
        {dish.recipeUrl && (
          <a href={dish.recipeUrl} target="_blank" rel="noopener noreferrer"
            className="w-10 h-10 rounded-full flex items-center justify-center transition-colors text-ink-muted hover:text-brand-700 hover:bg-white"
            title="Öppna originalkälla" aria-label="Öppna originalkälla">
            <ExternalLink className="w-[18px] h-[18px]" />
          </a>
        )}

        {/* Wake lock */}
        {wakeLockSupported && (
          <button
            onClick={toggleWakeLock}
            title={wakeLockActive ? 'Släck skärmsläckaren (skärmen hålls tänd)' : 'Håll skärmen tänd'}
            aria-label="Håll skärmen tänd"
            aria-pressed={wakeLockActive}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
              wakeLockActive ? 'text-amber-800 bg-amber-100' : 'text-ink-muted hover:text-amber-700 hover:bg-white'
            }`}
          >
            <Sunrise className="w-[18px] h-[18px]" />
          </button>
        )}

        {/* AI tools: split steps (Haiku) + improvement suggestions (Sonnet) */}
        <RecipeAiTools dish={dish} />

        {/* Edit mode toggle */}
        <button
          onClick={() => setEditMode(v => !v)}
          title={editMode ? 'Avsluta redigering' : 'Redigera instruktioner'}
          aria-label="Redigera instruktioner"
          aria-pressed={editMode}
          className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
            editMode ? 'text-white bg-ink' : 'text-ink-muted hover:text-ink hover:bg-white'
          }`}
        >
          <Pencil className="w-[18px] h-[18px]" />
        </button>

        {/* Export */}
        <button onClick={exportInstructions} title="Exportera instruktioner" aria-label="Exportera instruktioner" className="w-10 h-10 rounded-full flex items-center justify-center transition-colors text-ink-muted hover:text-ink hover:bg-white">
          <Download className="w-[18px] h-[18px]" />
        </button>

        {/* Import */}
        <button onClick={importInstructions} title="Importera instruktioner" aria-label="Importera instruktioner" className="w-10 h-10 rounded-full flex items-center justify-center transition-colors text-ink-muted hover:text-ink hover:bg-white">
          <Upload className="w-[18px] h-[18px]" />
        </button>
      </div>
      <h2 className="font-display text-[26px] md:text-[30px] font-extrabold tracking-tight leading-[1.1] text-ink">{dish.name}</h2>
      {importError && (
        <div role="alert" className="rounded-2xl bg-red-50 border border-red-200 pl-4 pr-1.5 py-1.5 flex items-center gap-2 text-sm text-red-800">
          <span className="flex-1">{importError}</span>
          <button onClick={() => setImportError(null)} className="h-8 px-3 rounded-full text-xs font-semibold hover:bg-red-100">OK</button>
        </div>
      )}
    </div>
  )

  const portionControl = (
    <div className="px-4 md:px-6 pb-3 shrink-0">
      <div className="card py-1.5 pl-4 pr-1.5 flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-semibold">
            {dish.yieldUnit?.trim() ? `${dish.yieldUnit.trim().charAt(0).toUpperCase()}${dish.yieldUnit.trim().slice(1)}` : 'Portioner'}
          </p>
          {plannedPortions !== null && portions !== plannedPortions ? (
            <button onClick={() => setPortions(plannedPortions)} className="text-xs font-semibold text-brand-700 hover:underline">
              Återställ till {plannedPortions}
            </button>
          ) : (
            <p className="text-xs text-ink-muted">Påverkar inte veckoplanen</p>
          )}
        </div>
        <button
          onClick={() => setPortions(p => Math.max(1, p - 1))}
          aria-label="Färre portioner"
          className="w-11 h-11 rounded-full bg-canvas text-ink flex items-center justify-center hover:bg-line-soft"
        >
          <Minus className="w-[18px] h-[18px]" />
        </button>
        <span className="w-9 text-center font-display text-xl font-extrabold tabular-nums" aria-live="polite">{portions}</span>
        <button
          onClick={() => setPortions(p => p + 1)}
          aria-label="Fler portioner"
          className="w-11 h-11 rounded-full bg-ink text-white flex items-center justify-center hover:bg-ink-soft"
        >
          <Plus className="w-[18px] h-[18px]" />
        </button>
      </div>
    </div>
  )

  if (isDesktop) {
    return (
      <div className="flex flex-col h-full">
        {header}
        {portionControl}
        <div className="flex flex-1 overflow-hidden pb-4">
          {/* Instructions (left) */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-7 pb-2 shrink-0">
              <span className="eyebrow">Gör så här</span>
            </div>
            <div className="flex-1 overflow-hidden">
              <InstructionsPanel
                dish={dish}
                portions={portions}
                scrollRef={instrScrollRef}
                editMode={editMode}
                onStepsChange={handleStepsChange}
              />
            </div>
          </div>
          {/* Ingredients (right) */}
          <div className="w-96 flex flex-col overflow-hidden">
            <div className="px-7 pb-2 shrink-0">
              <span className="eyebrow">Ingredienser</span>
            </div>
            <div className="flex-1 overflow-hidden">
              <IngredientsPanel
                dish={dish}
                portions={portions}
                scrollRef={ingredScrollRef}
              />
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Mobile: tab view
  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {header}
      {portionControl}

      {/* Tabs */}
      <div className="px-4 md:px-6 pb-3 shrink-0">
        <SegmentedControl
          ariaLabel="Receptvy"
          value={activeTab}
          onChange={switchTab}
          options={[
            { id: 'instruktioner', label: 'Gör så här' },
            { id: 'ingredienser', label: 'Ingredienser' },
          ]}
        />
      </div>

      {/* Panel — always rendered for scroll-position memory, hidden via display */}
      <div className={`flex-1 min-h-0 overflow-hidden ${activeTab === 'instruktioner' ? 'block motion-safe:animate-fade-up' : 'hidden'}`}>
        <InstructionsPanel
          dish={dish}
          portions={portions}
          scrollRef={instrScrollRef}
          editMode={editMode}
          onStepsChange={handleStepsChange}
        />
      </div>
      <div className={`flex-1 overflow-hidden ${activeTab === 'ingredienser' ? 'block motion-safe:animate-fade-up' : 'hidden'}`}>
        <IngredientsPanel
          dish={dish}
          portions={portions}
          scrollRef={ingredScrollRef}
        />
      </div>
    </div>
  )
}
