import { useState, useRef, useEffect, useCallback } from 'react'
import { v4 as uuid } from 'uuid'
import {
  ArrowLeft, Minus, Plus, Sunrise, Pencil, Check, X,
  Download, Upload, ExternalLink, ChevronDown, ChevronUp, Trash2,
} from 'lucide-react'
import { useLibraryStore } from '../../store/libraryStore'
import { useIsDesktop } from '../../hooks/useDevice'
import type { Dish, RecipeStep, Ingredient } from '../../types'

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
          <span className="text-brand-600 font-medium">
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
    <div className="flex gap-2 items-start">
      <span className="shrink-0 w-6 h-6 rounded-full bg-brand-100 text-brand-700 text-xs flex items-center justify-center font-bold mt-1">
        {index + 1}
      </span>
      <div className="flex-1 space-y-1.5">
        <textarea
          autoFocus
          value={text}
          onChange={e => setText(e.target.value)}
          rows={3}
          className="w-full text-sm border border-brand-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-300 resize-none"
        />
        <div className="flex gap-2">
          <button
            onClick={() => onSave(text)}
            className="flex items-center gap-1 text-xs px-2.5 py-1 bg-brand-500 text-white rounded-lg hover:bg-brand-600"
          >
            <Check className="w-3 h-3" /> Spara
          </button>
          <button
            onClick={onCancel}
            className="flex items-center gap-1 text-xs px-2.5 py-1 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
          >
            <X className="w-3 h-3" /> Avbryt
          </button>
          <button
            onClick={onDelete}
            className="flex items-center gap-1 text-xs px-2.5 py-1 text-red-600 hover:bg-red-50 rounded-lg ml-auto"
          >
            <Trash2 className="w-3 h-3" /> Ta bort
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
    <div ref={scrollRef} className="h-full overflow-y-auto p-4 space-y-4">
      {!hasSteps && !editMode && (
        <p className="text-sm text-gray-400 italic">Inga instruktioner tillagda ännu.</p>
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
            <div className="flex gap-2 items-start group">
              <span className="shrink-0 w-6 h-6 rounded-full bg-brand-100 text-brand-700 text-xs flex items-center justify-center font-bold mt-0.5">
                {idx + 1}
              </span>
              <p className="flex-1 text-sm text-gray-800 leading-relaxed">
                {injectAmounts(step.text, dish.ingredients, portions)}
              </p>
              {editMode && (
                <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => moveStep(idx, -1)} disabled={idx === 0} className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30">
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => moveStep(idx, 1)} disabled={idx === (dish.instructions ?? []).length - 1} className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30">
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setEditingId(step.id)} className="p-0.5 text-gray-400 hover:text-brand-600">
                    <Pencil className="w-3.5 h-3.5" />
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
            className="flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 px-2 py-1 rounded-lg hover:bg-brand-50"
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
  if (dish.ingredients.length === 0) {
    return (
      <div ref={scrollRef} className="h-full overflow-y-auto p-4">
        <p className="text-sm text-gray-400 italic">Inga ingredienser tillagda.</p>
      </div>
    )
  }

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto p-4">
      <ul className="space-y-2">
        {dish.ingredients.map(ing => (
          <li key={ing.id} className="flex items-baseline justify-between gap-4 text-sm py-1 border-b border-gray-100 last:border-0">
            <span className="text-gray-800">{ing.name}</span>
            <span className="shrink-0 text-gray-500 font-medium tabular-nums">{scaleAmount(ing, portions)}</span>
          </li>
        ))}
      </ul>
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
  const isDesktop = useIsDesktop()
  const updateDish = useLibraryStore(s => s.updateDish)
  const { active: wakeLockActive, toggle: toggleWakeLock, supported: wakeLockSupported } = useWakeLock()

  const defaultPortions = plannedPortions ?? dish.ingredients[0]?.portionsBase ?? 4
  const [portions, setPortions] = useState(defaultPortions)
  const [editMode, setEditMode] = useState(false)
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
      } catch (e: any) {
        alert(`Kunde inte importera: ${e.message}`)
      }
    }
    input.click()
  }

  const header = (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 bg-white shrink-0">
      {onBack && (
        <button onClick={onBack} className="p-1 -ml-1 text-gray-500 hover:text-gray-800 rounded-lg hover:bg-gray-100">
          <ArrowLeft className="w-5 h-5" />
        </button>
      )}
      <h2 className="flex-1 text-base font-semibold text-gray-900 truncate">{dish.name}</h2>

      {/* Source URL */}
      {dish.recipeUrl && (
        <a href={dish.recipeUrl} target="_blank" rel="noopener noreferrer"
          className="p-1.5 text-gray-400 hover:text-brand-600 rounded-lg hover:bg-brand-50"
          title="Öppna originalkälla">
          <ExternalLink className="w-4 h-4" />
        </a>
      )}

      {/* Wake lock */}
      {wakeLockSupported && (
        <button
          onClick={toggleWakeLock}
          title={wakeLockActive ? 'Släck skärmsläckaren (skärmen hålls tänd)' : 'Håll skärmen tänd'}
          className={`p-1.5 rounded-lg transition-colors ${
            wakeLockActive ? 'text-amber-500 bg-amber-50' : 'text-gray-400 hover:text-amber-500 hover:bg-amber-50'
          }`}
        >
          <Sunrise className="w-4 h-4" />
        </button>
      )}

      {/* Edit mode toggle */}
      <button
        onClick={() => setEditMode(v => !v)}
        title={editMode ? 'Avsluta redigering' : 'Redigera instruktioner'}
        className={`p-1.5 rounded-lg transition-colors ${
          editMode ? 'text-brand-600 bg-brand-50' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
        }`}
      >
        <Pencil className="w-4 h-4" />
      </button>

      {/* Export */}
      <button onClick={exportInstructions} title="Exportera instruktioner" className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
        <Download className="w-4 h-4" />
      </button>

      {/* Import */}
      <button onClick={importInstructions} title="Importera instruktioner" className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
        <Upload className="w-4 h-4" />
      </button>
    </div>
  )

  const portionControl = (
    <div className="flex items-center gap-2 px-4 py-2 bg-white border-b border-gray-200 shrink-0">
      <span className="text-xs text-gray-500 mr-1">Portioner:</span>
      <button
        onClick={() => setPortions(p => Math.max(1, p - 1))}
        className="w-6 h-6 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-100"
      >
        <Minus className="w-3 h-3" />
      </button>
      <span className="text-sm font-semibold text-gray-800 w-4 text-center">{portions}</span>
      <button
        onClick={() => setPortions(p => p + 1)}
        className="w-6 h-6 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-100"
      >
        <Plus className="w-3 h-3" />
      </button>
      {plannedPortions !== null && portions !== plannedPortions && (
        <button
          onClick={() => setPortions(plannedPortions)}
          className="ml-2 text-xs text-brand-600 hover:underline"
        >
          Återställ ({plannedPortions})
        </button>
      )}
      <span className="ml-auto text-xs text-gray-400">Påverkar inte veckoplanen</span>
    </div>
  )

  if (isDesktop) {
    return (
      <div className="flex flex-col h-full">
        {header}
        {portionControl}
        <div className="flex flex-1 overflow-hidden">
          {/* Instructions (left) */}
          <div className="flex-1 flex flex-col overflow-hidden border-r border-gray-200">
            <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 shrink-0">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Instruktioner</span>
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
          <div className="w-64 flex flex-col overflow-hidden bg-white">
            <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 shrink-0">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Ingredienser</span>
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
    <div className="flex flex-col h-full">
      {header}
      {portionControl}

      {/* Tabs */}
      <div className="flex border-b border-gray-200 bg-white shrink-0">
        {(['instruktioner', 'ingredienser'] as Tab[]).map(tab => (
          <button
            key={tab}
            onClick={() => switchTab(tab)}
            className={`flex-1 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 ${
              activeTab === tab
                ? 'border-brand-500 text-brand-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Panel — always rendered for scroll-position memory, hidden via display */}
      <div className={`flex-1 overflow-hidden ${activeTab === 'instruktioner' ? 'block' : 'hidden'}`}>
        <InstructionsPanel
          dish={dish}
          portions={portions}
          scrollRef={instrScrollRef}
          editMode={editMode}
          onStepsChange={handleStepsChange}
        />
      </div>
      <div className={`flex-1 overflow-hidden ${activeTab === 'ingredienser' ? 'block' : 'hidden'}`}>
        <IngredientsPanel
          dish={dish}
          portions={portions}
          scrollRef={ingredScrollRef}
        />
      </div>
    </div>
  )
}
