import { useEffect, useRef, useState } from 'react'
import { Minus, Plus, X, ChevronRight, ChevronUp, ChevronDown, Link2, Download, Trash2 } from 'lucide-react'
import { useIsDesktop } from '../../hooks/useDevice'
import { v4 as uuid } from 'uuid'
import { useLibraryStore } from '../../store/libraryStore'
import { useWeekStore } from '../../store/weekStore'
import { dishMostCommonMonth, MONTH_NAMES } from '../../utils/weekUtils'
import { fetchRecipeFromUrl, type RecipeFetchResult } from '../../utils/recipeFetcher'
import Modal, { type ModalHandle } from '../common/Modal'
import SegmentedControl from '../common/SegmentedControl'
import type {
  Dish, Ingredient, Protein, Carb, Cuisine, DishType, Tag, ShoppingCategory,
} from '../../types'

const ALL_PROTEINS: Protein[] = ['kyckling','nöt','fläsk','fisk','skaldjur','lamm','vilt','vegetarisk','vegan']
const ALL_CARBS:    Carb[]    = ['ris','pasta','potatis','nudlar','bröd','ingen']
const ALL_CUISINES: Cuisine[] = ['svensk','italiensk','asiatisk','japansk','koreansk','indisk','mellanöstern','mexikansk','fransk','nordafrikansk','övrigt']
const ALL_TYPES:    DishType[] = ['soppa','sallad','paj','gryta','grillat','bowl','burgare','taco','wrap','pizza','pasta','curry','risotto','omelett','smörgås','wok','sushi','köttbit']
const ALL_TAGS:     Tag[]     = ['snabb','festlig','barnvänlig','lowfodmap','lchf','stark','lågfett']
const ALL_CATS:     ShoppingCategory[] = ['mejeri','kött','fisk','grönsaker','frukt','torrvaror','konserver','frys','bröd','kryddor','övrigt']
const ALL_MONTHS = [1,2,3,4,5,6,7,8,9,10,11,12]

const LABEL: Record<string, string> = {
  kyckling:'Kyckling', nöt:'Nöt', fläsk:'Fläsk', fisk:'Fisk', skaldjur:'Skaldjur',
  lamm:'Lamm', vilt:'Vilt', vegetarisk:'Vegetarisk', vegan:'Vegan',
  ris:'Ris', pasta:'Pasta', potatis:'Potatis', nudlar:'Nudlar', bröd:'Bröd', ingen:'Lågkolhydrat',
  svensk:'Svensk', italiensk:'Italiensk', asiatisk:'Asiatisk', japansk:'Japansk',
  koreansk:'Koreansk', indisk:'Indisk', mellanöstern:'Mellanöstern', mexikansk:'Mexikansk',
  fransk:'Fransk', nordafrikansk:'Nordafrikansk', övrigt:'Övrigt',
  soppa:'Soppa', sallad:'Sallad', paj:'Paj', gryta:'Gryta', grillat:'Grillat',
  bowl:'Bowl', burgare:'Burgare', taco:'Taco', wrap:'Wrap', pizza:'Pizza',
  curry:'Curry', risotto:'Risotto', omelett:'Omelett', smörgås:'Smörgås',
  wok:'Wok', sushi:'Sushi', köttbit:'Köttbit',
  snabb:'Snabb', festlig:'Festlig', barnvänlig:'Barnvänlig',
  lowfodmap:'Low FODMAP', lchf:'LCHF', stark:'Stark', lågfett:'Låg fetthalt',
  mejeri:'Mejeri', kött:'Kött',
  grönsaker:'Grönsaker', frukt:'Frukt', torrvaror:'Torrvaror',
  konserver:'Konserver', frys:'Frys', kryddor:'Kryddor',
}

interface Props {
  dish: Dish | null
  initialName?: string
  onClose: () => void
  onSaved?: (id: string) => void
}

function AmountInput({ value, onChange, className, id }: { value: number; onChange: (n: number) => void; className?: string; id?: string }) {
  const [text, setText] = useState(formatAmount(value))
  const focused = useRef(false)

  useEffect(() => {
    if (!focused.current) setText(formatAmount(value))
  }, [value])

  return (
    <input
      id={id}
      aria-label={id ? undefined : 'Mängd'}
      type="text"
      inputMode="decimal"
      placeholder="Mängd"
      value={text}
      onFocus={() => { focused.current = true }}
      onBlur={() => { focused.current = false; setText(formatAmount(value)) }}
      onChange={e => {
        const raw = e.target.value.replace(/,/g, '.')
        if (!/^\d*\.?\d*$/.test(raw)) return
        setText(e.target.value)
        onChange(raw === '' || raw === '.' ? 0 : parseFloat(raw))
      }}
      className={className}
    />
  )
}

const COMMON_UNITS = ['st', 'g', 'kg', 'ml', 'dl', 'l', 'msk', 'tsk', 'krm']

type EditorTab = 'grund' | 'ingredienser' | 'steg' | 'mer'

/** 2.5 → "2,5" (Swedish decimal comma) */
function formatAmount(n: number): string {
  return String(n).replace('.', ',')
}

/** Recipe yield (portions, or e.g. 24 buns) — typeable since baking yields can be large. */
function BaseInput({ value, disabled, onChange }: { value: number; disabled: boolean; onChange: (n: number) => void }) {
  const [text, setText] = useState(String(value))
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setText(String(value))
  }, [value])
  return (
    <input
      type="text"
      inputMode="numeric"
      aria-label="Receptet ger"
      disabled={disabled}
      value={text}
      onFocus={() => { focused.current = true }}
      onBlur={() => { focused.current = false; setText(String(value)) }}
      onChange={e => {
        if (!/^\d*$/.test(e.target.value)) return
        setText(e.target.value)
        const n = parseInt(e.target.value, 10)
        if (!isNaN(n) && n > 0) onChange(n)
      }}
      className="w-10 h-9 bg-transparent text-center font-display font-extrabold text-base text-ink focus:outline-none focus:ring-2 focus:ring-brand-300 rounded-lg disabled:opacity-40"
    />
  )
}

function blank(): Omit<Dish, 'id' | 'cookingHistory'> {
  return {
    name: '', protein: [], carb: [], cuisine: 'övrigt',
    type: [], tags: [], recipeUrl: '', ingredients: [], instructions: [], notes: '', preferredMonths: [],
  }
}

export default function DishEditor({ dish, initialName, onClose, onSaved }: Props) {
  const { addDish, updateDish, deleteDish } = useLibraryStore()
  const weeks = Object.values(useWeekStore().weeks)
  const [form, setForm] = useState<Omit<Dish, 'id' | 'cookingHistory'>>(
    dish
      ? { ...dish, instructions: dish.instructions ?? [] }
      : { ...blank(), name: initialName ?? '' }
  )
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [tab, setTab] = useState<EditorTab>('grund')
  // Sheets close through these so Spara/Klar/Avbryt get the same slide-out as the X
  const editorModal = useRef<ModalHandle>(null)
  const ingModal = useRef<ModalHandle>(null)
  const confirmModal = useRef<ModalHandle>(null)
  const closeEditor = () => (editorModal.current ? editorModal.current.close() : onClose())
  const [editingIngId, setEditingIngId] = useState<string | null>(null)
  const isDesktop = useIsDesktop()
  const [fetchStatus, setFetchStatus] = useState<{ state: 'idle' | 'loading' | 'error'; error: string; info?: string }>({ state: 'idle', error: '' })
  const fetchCacheRef = useRef<{ url: string; promise: Promise<RecipeFetchResult> } | null>(null)

  const historyMonth = dish ? dishMostCommonMonth(dish.id, weeks) : null
  const isNew = !dish

  function toggle<T>(arr: T[], v: T): T[] {
    return arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]
  }

  function save() {
    if (!form.name.trim()) return
    if (isNew) {
      const id = addDish(form)
      onSaved?.(id)
    } else {
      updateDish(dish.id, form)
      onSaved?.(dish.id)
    }
    closeEditor()
  }

  // ── Ingredients ──────────────────────────────────────────────────────────────

  function addIngredient(): string {
    const portionsBase = form.ingredients[0]?.portionsBase ?? 4
    const ing: Ingredient = {
      id: uuid(), name: '', amount: 1, unit: 'g', category: 'övrigt', portionsBase,
    }
    setForm(f => ({ ...f, ingredients: [...f.ingredients, ing] }))
    return ing.id
  }

  function setAllPortionsBase(n: number) {
    const clamped = Math.max(1, n)
    setForm(f => ({
      ...f,
      ingredients: f.ingredients.map(i => ({ ...i, portionsBase: clamped })),
    }))
  }

  function updateIngredient(id: string, patch: Partial<Ingredient>) {
    setForm(f => ({
      ...f,
      ingredients: f.ingredients.map(i => i.id === id ? { ...i, ...patch } : i),
    }))
  }

  function removeIngredient(id: string) {
    setForm(f => ({ ...f, ingredients: f.ingredients.filter(i => i.id !== id) }))
  }

  // ── Instructions ─────────────────────────────────────────────────────────────

  function addStep() {
    setForm(f => ({ ...f, instructions: [...f.instructions, { id: uuid(), text: '' }] }))
  }

  function updateStep(id: string, text: string) {
    setForm(f => ({
      ...f,
      instructions: f.instructions.map(s => s.id === id ? { ...s, text } : s),
    }))
  }

  function removeStep(id: string) {
    setForm(f => ({ ...f, instructions: f.instructions.filter(s => s.id !== id) }))
  }

  function moveStep(id: string, dir: -1 | 1) {
    setForm(f => {
      const steps = [...f.instructions]
      const idx = steps.findIndex(s => s.id === id)
      const target = idx + dir
      if (target < 0 || target >= steps.length) return f
      ;[steps[idx], steps[target]] = [steps[target], steps[idx]]
      return { ...f, instructions: steps }
    })
  }

  // ── Recipe fetch ──────────────────────────────────────────────────────────────

  function getRecipeData(): Promise<RecipeFetchResult> {
    if (fetchCacheRef.current?.url === form.recipeUrl) return fetchCacheRef.current.promise
    const promise = fetchRecipeFromUrl(form.recipeUrl.trim())
    fetchCacheRef.current = { url: form.recipeUrl, promise }
    return promise
  }

  async function handleFetch(field: 'ingredients' | 'instructions') {
    setFetchStatus({ state: 'loading', error: '' })
    try {
      const data = await getRecipeData()
      const info = data.source === 'ai'
        ? data.learned
          ? 'Okänd sajt – tolkad med AI. Appen har lärt sig sajten och hämtar utan AI nästa gång.'
          : 'Okänd sajt – tolkad med AI. Kontrollera resultatet.'
        : undefined
      const found = field === 'ingredients' ? data.ingredients.length > 0 : !!data.instructions?.length
      if (!found) {
        setFetchStatus({
          state: 'error',
          error: field === 'ingredients' ? 'Hittade inga ingredienser i receptet.' : 'Hittade inga instruktioner i receptet.',
        })
        return
      }
      // Use everything the fetch found: the requested field always, and the
      // other one too if it's still empty (an AI parse returns both at once).
      const patch: Partial<Dish> = {}
      const wantIngredients = field === 'ingredients' || (form.ingredients.length === 0 && data.ingredients.length > 0)
      const wantInstructions = field === 'instructions'
        || (form.instructions.every(s => !s.text.trim()) && !!data.instructions?.length)
      if (wantIngredients) patch.ingredients = data.ingredients
      if (wantInstructions) patch.instructions = data.instructions!
      if (form.name.trim() === '' && data.title) patch.name = data.title
      setForm(f => ({ ...f, ...patch }))
      // Existing recipe: save the fetched data right away so it isn't lost if
      // the editor is closed without pressing Spara (AI fetches cost money).
      if (dish) updateDish(dish.id, { ...patch, recipeUrl: form.recipeUrl })
      setFetchStatus({ state: 'idle', error: '', info })
    } catch (e) {
      setFetchStatus({ state: 'error', error: e instanceof Error ? e.message : 'Okänt fel' })
    }
  }

  const tabs: { id: EditorTab; label: string; short: string; count?: number }[] = [
    { id: 'grund',        label: 'Grund',                 short: 'Grund' },
    { id: 'ingredienser', label: 'Ingredienser',          short: 'Ingred.', count: form.ingredients.length },
    { id: 'steg',         label: 'Gör så här',            short: 'Gör så', count: form.instructions.length },
    { id: 'mer',          label: 'Säsong & anteckningar', short: 'Mer' },
  ]
  const portionsBase = form.ingredients[0]?.portionsBase ?? 4
  const editingIng = form.ingredients.find(i => i.id === editingIngId) ?? null

  const fetchMessages = (
    <>
      {fetchStatus.error && (
        <p className="text-sm text-red-700 mt-2 whitespace-pre-line">{fetchStatus.error}</p>
      )}
      {!fetchStatus.error && fetchStatus.info && (
        <p className="text-sm text-brand-700 mt-2">{fetchStatus.info}</p>
      )}
    </>
  )

  const urlField = (action: React.ReactNode) => (
    <div className={`p-1.5 pl-4 flex items-center gap-2 rounded-3xl ${isDesktop ? 'bg-canvas' : 'bg-white'}`}>
      <Link2 className="w-[18px] h-[18px] text-ink-muted shrink-0" />
      <input
        type="url"
        aria-label="Receptlänk"
        value={form.recipeUrl}
        onChange={e => {
          fetchCacheRef.current = null
          setFetchStatus({ state: 'idle', error: '' })
          setForm(f => ({ ...f, recipeUrl: e.target.value }))
        }}
        placeholder="Klistra in receptlänk"
        className="flex-1 min-w-0 h-10 bg-transparent text-base text-ink placeholder:text-ink-faint focus:outline-none"
      />
      {action}
    </div>
  )

  // ── Tab panels ───────────────────────────────────────────────────────────────

  const grund = (
    <div className="space-y-6">
      <div>
        <label htmlFor="dish-name" className="field-label">Namn</label>
        <input
          id="dish-name"
          autoFocus={isNew}
          type="text"
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          className="field text-[17px] font-semibold"
          placeholder="T.ex. Linsgryta"
        />
      </div>
      <ChipGroup
        label="Protein"
        options={ALL_PROTEINS}
        selected={form.protein}
        onToggle={v => setForm(f => ({ ...f, protein: toggle(f.protein, v as Protein) }))}
      />
      <ChipGroup
        label="Kolhydrat"
        options={ALL_CARBS}
        selected={form.carb}
        onToggle={v => setForm(f => ({ ...f, carb: toggle(f.carb, v as Carb) }))}
      />
      <div>
        <label htmlFor="dish-cuisine" className="field-label">Kök</label>
        <select
          id="dish-cuisine"
          value={form.cuisine}
          onChange={e => setForm(f => ({ ...f, cuisine: e.target.value as Cuisine }))}
          className="field"
        >
          {ALL_CUISINES.map(c => <option key={c} value={c}>{LABEL[c]}</option>)}
        </select>
      </div>
      <ChipGroup
        label="Typ"
        options={ALL_TYPES}
        selected={form.type}
        onToggle={v => setForm(f => ({ ...f, type: toggle(f.type, v as DishType) }))}
        collapseAfter={8}
      />
      <ChipGroup
        label="Taggar"
        options={ALL_TAGS}
        selected={form.tags}
        onToggle={v => setForm(f => ({ ...f, tags: toggle(f.tags, v as Tag) }))}
      />
    </div>
  )

  const portionsStepper = (
    <div className="flex items-center gap-2 text-sm text-ink-muted">
      <span>Receptet gäller</span>
      <div className="flex items-center bg-white border border-line rounded-full p-0.5">
        <button
          type="button"
          onClick={() => setAllPortionsBase(portionsBase - 1)}
          disabled={form.ingredients.length === 0}
          aria-label="Färre portioner"
          className="w-9 h-9 rounded-full flex items-center justify-center text-ink hover:bg-canvas disabled:opacity-30"
        >
          <Minus className="w-4 h-4" />
        </button>
        <BaseInput value={portionsBase} disabled={form.ingredients.length === 0} onChange={setAllPortionsBase} />
        <button
          type="button"
          onClick={() => setAllPortionsBase(portionsBase + 1)}
          disabled={form.ingredients.length === 0}
          aria-label="Fler portioner"
          className="w-9 h-9 rounded-full flex items-center justify-center text-ink hover:bg-canvas disabled:opacity-30"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
      <input
        type="text"
        value={form.yieldUnit ?? ''}
        onChange={e => setForm(f => ({ ...f, yieldUnit: e.target.value }))}
        placeholder="port."
        title="Vad receptet ger, t.ex. bullar, limpor, kakor. Tomt = portioner."
        aria-label="Enhet för receptets mängd"
        className="w-20 h-10 rounded-full bg-white border border-line px-3 text-base md:text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-brand-300"
      />
    </div>
  )

  const ingredienser = (
    <div className="space-y-4">
      <div>
        {urlField(
          <button
            type="button"
            onClick={() => handleFetch('ingredients')}
            disabled={!form.recipeUrl.trim() || fetchStatus.state === 'loading'}
            className="h-10 px-4 rounded-full bg-mint text-mint-ink font-semibold text-sm disabled:opacity-40 whitespace-nowrap shrink-0"
          >
            {fetchStatus.state === 'loading' ? 'Hämtar…' : isDesktop ? 'Hämta ingredienser' : 'Hämta'}
          </button>
        )}
        {fetchMessages}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <span className="text-[13px] font-semibold text-ink-muted">
          {form.ingredients.length} {form.ingredients.length === 1 ? 'ingrediens' : 'ingredienser'}
        </span>
        {portionsStepper}
      </div>

      {form.ingredients.length > 0 && (isDesktop ? (
        <div className="card overflow-hidden border border-line-soft">
          <div className="grid grid-cols-[2fr_90px_100px_1.3fr_44px] gap-2.5 px-4 py-2.5 bg-canvas/60 text-xs font-semibold text-ink-muted">
            <span>Ingrediens</span><span>Mängd</span><span>Enhet</span><span>Kategori</span><span />
          </div>
          {form.ingredients.map(ing => (
            <div key={ing.id} className="grid grid-cols-[2fr_90px_100px_1.3fr_44px] gap-2.5 px-4 py-2 items-center border-t border-line-soft">
              <input
                aria-label="Ingrediens"
                placeholder="Ingrediens"
                value={ing.name}
                onChange={e => updateIngredient(ing.id, { name: e.target.value })}
                className="cell"
              />
              <AmountInput value={ing.amount} onChange={n => updateIngredient(ing.id, { amount: n })} className="cell text-right" />
              <input
                aria-label="Enhet"
                placeholder="Enhet"
                value={ing.unit}
                onChange={e => updateIngredient(ing.id, { unit: e.target.value })}
                className="cell"
              />
              <select
                aria-label="Kategori"
                value={ing.category}
                onChange={e => updateIngredient(ing.id, { category: e.target.value as ShoppingCategory })}
                className="cell"
              >
                {ALL_CATS.map(c => <option key={c} value={c}>{LABEL[c] ?? c}</option>)}
              </select>
              <button
                type="button"
                onClick={() => removeIngredient(ing.id)}
                aria-label={`Ta bort ${ing.name || 'ingrediens'}`}
                className="w-10 h-10 rounded-full flex items-center justify-center text-ink-faint hover:text-red-700 hover:bg-red-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="card overflow-hidden">
          {form.ingredients.map((ing, i) => (
            <button
              key={ing.id}
              type="button"
              onClick={() => setEditingIngId(ing.id)}
              className={`w-full min-h-[52px] px-4 flex items-center gap-3 text-left ${i > 0 ? 'border-t border-line-soft' : ''}`}
            >
              <span className={`flex-1 text-[15px] truncate ${ing.name ? 'text-ink' : 'text-ink-faint italic'}`}>
                {ing.name || 'Namnlös'}
              </span>
              <span className="text-[15px] font-semibold text-ink whitespace-nowrap">
                {formatAmount(ing.amount)} {ing.unit}
              </span>
              <ChevronRight className="w-4 h-4 text-ink-faint shrink-0" />
            </button>
          ))}
        </div>
      ))}

      <button
        type="button"
        onClick={() => {
          const id = addIngredient()
          if (!isDesktop) setEditingIngId(id)
        }}
        className="w-full sm:w-auto h-12 px-5 rounded-3xl border-[1.5px] border-dashed border-ink-faint/60 text-ink font-semibold text-[15px] flex items-center justify-center gap-2 hover:bg-white"
      >
        <Plus className="w-[18px] h-[18px]" /> Lägg till ingrediens
      </button>
    </div>
  )

  const steg = (
    <div className="space-y-3">
      {form.recipeUrl.trim() && (
        <div>
          <button
            type="button"
            onClick={() => handleFetch('instructions')}
            disabled={fetchStatus.state === 'loading'}
            className="h-11 px-4 rounded-full bg-mint text-mint-ink font-semibold text-sm disabled:opacity-40 inline-flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            {fetchStatus.state === 'loading' ? 'Hämtar…' : 'Hämta instruktioner från länken'}
          </button>
          {fetchMessages}
        </div>
      )}
      {form.instructions.length === 0 && (
        <p className="text-sm text-ink-muted px-1">Inga steg än.</p>
      )}
      {form.instructions.map((step, idx) => (
        <div key={step.id} className={`p-3 flex gap-3 items-start rounded-3xl ${isDesktop ? 'bg-canvas' : 'bg-white'}`}>
          <span className="w-7 h-7 mt-1.5 rounded-full bg-ink text-white font-display font-bold text-sm flex items-center justify-center shrink-0">
            {idx + 1}
          </span>
          <textarea
            aria-label={`Steg ${idx + 1}`}
            value={step.text}
            onChange={e => updateStep(step.id, e.target.value)}
            rows={3}
            className={`flex-1 min-w-0 rounded-xl px-3 py-2 text-base leading-relaxed text-ink resize-none focus:outline-none focus:ring-2 focus:ring-brand-300 ${isDesktop ? 'bg-white' : 'bg-canvas'}`}
          />
          <div className="flex flex-col shrink-0">
            <button
              type="button"
              onClick={() => moveStep(step.id, -1)}
              disabled={idx === 0}
              aria-label="Flytta upp"
              className="w-9 h-9 rounded-full flex items-center justify-center text-ink-muted hover:bg-canvas disabled:opacity-20"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => moveStep(step.id, 1)}
              disabled={idx === form.instructions.length - 1}
              aria-label="Flytta ned"
              className="w-9 h-9 rounded-full flex items-center justify-center text-ink-muted hover:bg-canvas disabled:opacity-20"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => removeStep(step.id)}
              aria-label="Ta bort steg"
              className="w-9 h-9 rounded-full flex items-center justify-center text-ink-faint hover:text-red-700 hover:bg-red-50"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={addStep}
        className="w-full sm:w-auto h-12 px-5 rounded-3xl border-[1.5px] border-dashed border-ink-faint/60 text-ink font-semibold text-[15px] flex items-center justify-center gap-2 hover:bg-white"
      >
        <Plus className="w-[18px] h-[18px]" /> Lägg till steg
      </button>
    </div>
  )

  const mer = (
    <div className="space-y-6">
      <div>
        <p className="field-label">
          Säsong
          {historyMonth && (
            <span className="ml-2 font-normal">(vanligast i historiken: {MONTH_NAMES[historyMonth]})</span>
          )}
        </p>
        <div className="grid grid-cols-6 gap-1.5">
          {ALL_MONTHS.map(m => {
            const on = form.preferredMonths.includes(m)
            return (
              <button
                key={m}
                type="button"
                aria-pressed={on}
                onClick={() => setForm(f => ({
                  ...f,
                  preferredMonths: on ? f.preferredMonths.filter(x => x !== m) : [...f.preferredMonths, m],
                }))}
                className={`h-11 rounded-xl text-[13px] transition-colors ${
                  on ? 'bg-brand-600 text-white font-semibold' : 'bg-white border border-line text-ink hover:bg-canvas'
                }`}
              >
                {MONTH_NAMES[m]}
              </button>
            )
          })}
        </div>
        {form.preferredMonths.length === 0 && (
          <p className="text-[13px] text-ink-muted mt-2">Inga valda – används året runt</p>
        )}
      </div>
      <div>
        <label htmlFor="dish-notes" className="field-label">Anteckningar</label>
        <textarea
          id="dish-notes"
          value={form.notes}
          onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          rows={4}
          className="field h-auto py-3 resize-none"
        />
      </div>
      {!isNew && !isDesktop && (
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="w-full h-12 rounded-3xl bg-white text-red-700 font-semibold text-[15px] flex items-center justify-center gap-2"
        >
          <Trash2 className="w-[18px] h-[18px]" /> Ta bort rätten
        </button>
      )}
    </div>
  )

  const panels: Record<EditorTab, React.ReactNode> = { grund, ingredienser, steg, mer }

  // ── Layout ───────────────────────────────────────────────────────────────────

  const mobileTabs = (
    <SegmentedControl
      ariaLabel="Avsnitt"
      value={tab}
      onChange={setTab}
      options={tabs.map(t => ({ id: t.id, label: <span className="text-[13px] truncate">{t.short}</span> }))}
    />
  )

  const footer = isDesktop ? (
    <div className="flex items-center justify-between gap-3">
      {!isNew ? (
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="h-11 px-4 rounded-full text-red-700 font-semibold text-sm hover:bg-red-50"
        >
          Ta bort rätten
        </button>
      ) : <span />}
      <div className="flex gap-2.5">
        <button type="button" onClick={closeEditor} className="btn-secondary">Avbryt</button>
        <button type="button" onClick={save} disabled={!form.name.trim()} className="btn-primary px-7">
          {isNew ? 'Lägg till' : 'Spara'}
        </button>
      </div>
    </div>
  ) : (
    <button type="button" onClick={save} disabled={!form.name.trim()} className="btn-primary w-full h-14 text-base">
      {isNew ? 'Lägg till rätten' : 'Spara'}
    </button>
  )

  return (
    <>
      <Modal
        ref={editorModal}
        title={form.name.trim() || (isNew ? 'Ny rätt' : 'Namnlös rätt')}
        subtitle={isNew ? 'Ny rätt' : 'Redigera rätt'}
        onClose={onClose}
        wide
        fullHeight
        toolbar={isDesktop ? undefined : mobileTabs}
        footer={footer}
      >
        {isDesktop ? (
          <div className="flex gap-5 min-h-[520px]">
            <nav aria-label="Avsnitt" className="w-52 shrink-0 flex flex-col gap-1">
              {tabs.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`h-12 px-4 rounded-full text-sm text-left flex items-center justify-between transition-colors ${
                    tab === t.id ? 'bg-ink text-white font-semibold' : 'text-ink-soft font-medium hover:bg-white'
                  }`}
                >
                  <span>{t.label}</span>
                  {t.count != null && t.count > 0 && (
                    <span className={`text-xs font-semibold ${tab === t.id ? 'text-mint-bright' : 'text-ink-muted'}`}>{t.count}</span>
                  )}
                </button>
              ))}
            </nav>
            <div key={tab} className="flex-1 min-w-0 bg-white rounded-3xl p-6 motion-safe:animate-fade-up">
              {panels[tab]}
            </div>
          </div>
        ) : (
          <div key={tab} className="pt-1 motion-safe:animate-fade-up">{panels[tab]}</div>
        )}
      </Modal>

      {/* Mobile: edit one ingredient in its own half sheet */}
      {editingIng && !isDesktop && (
        <Modal ref={ingModal} title="Ingrediens" onClose={() => setEditingIngId(null)}
          footer={
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => { const id = editingIng.id; ingModal.current?.close(() => removeIngredient(id)) }}
                aria-label="Ta bort ingrediens"
                className="w-14 h-14 rounded-full bg-red-50 text-red-700 flex items-center justify-center shrink-0"
              >
                <Trash2 className="w-5 h-5" />
              </button>
              <button type="button" onClick={() => ingModal.current?.close()} className="btn-primary flex-1 h-14 text-base">Klar</button>
            </div>
          }
        >
          <div className="space-y-5 pt-1">
            <div>
              <label htmlFor="ing-name" className="field-label">Namn</label>
              <input
                id="ing-name"
                autoFocus={!editingIng.name}
                value={editingIng.name}
                onChange={e => updateIngredient(editingIng.id, { name: e.target.value })}
                placeholder="T.ex. Kokosmjölk"
                className="field text-[17px] font-semibold"
              />
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-2.5">
              <div>
                <label htmlFor="ing-amount" className="field-label">Mängd</label>
                <AmountInput id="ing-amount" value={editingIng.amount} onChange={n => updateIngredient(editingIng.id, { amount: n })} className="field text-[17px] font-semibold" />
              </div>
              <div className="w-28">
                <label htmlFor="ing-unit" className="field-label">Enhet</label>
                <input
                  id="ing-unit"
                  value={editingIng.unit}
                  onChange={e => updateIngredient(editingIng.id, { unit: e.target.value })}
                  className="field"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2 -mt-2">
              {COMMON_UNITS.map(u => (
                <button
                  key={u}
                  type="button"
                  onClick={() => updateIngredient(editingIng.id, { unit: u })}
                  className={`chip min-w-[48px] justify-center ${editingIng.unit === u ? 'chip-on' : 'chip-off'}`}
                >
                  {u}
                </button>
              ))}
            </div>
            <div>
              <label htmlFor="ing-cat" className="field-label">Kategori i inköpslistan</label>
              <select
                id="ing-cat"
                value={editingIng.category}
                onChange={e => updateIngredient(editingIng.id, { category: e.target.value as ShoppingCategory })}
                className="field"
              >
                {ALL_CATS.map(c => <option key={c} value={c}>{LABEL[c] ?? c}</option>)}
              </select>
            </div>
          </div>
        </Modal>
      )}

      {/* Confirm delete */}
      {confirmDelete && dish && (
        <Modal ref={confirmModal} title={`Ta bort ${dish.name}?`} onClose={() => setConfirmDelete(false)}
          footer={
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5">
              <button type="button" onClick={() => confirmModal.current?.close()} className="btn-secondary h-14 sm:h-12">Avbryt</button>
              <button
                type="button"
                onClick={() => confirmModal.current?.close(() => { deleteDish(dish.id); closeEditor() })}
                className="h-14 sm:h-12 px-6 rounded-full bg-red-700 hover:bg-red-800 text-white font-semibold text-[15px]"
              >
                Ta bort
              </button>
            </div>
          }
        >
          <p className="text-[15px] text-ink-muted leading-relaxed pt-1">
            Rätten försvinner från biblioteket. Det går inte att ångra.
          </p>
        </Modal>
      )}
    </>
  )
}

function ChipGroup<T extends string>({
  label, options, selected, onToggle, collapseAfter,
}: { label: string; options: T[]; selected: T[]; onToggle: (v: string) => void; collapseAfter?: number }) {
  const [expanded, setExpanded] = useState(false)

  const visible = collapseAfter && !expanded
    ? options.filter((opt, i) => i < collapseAfter || selected.includes(opt))
    : options
  const hiddenCount = collapseAfter ? options.filter((opt, i) => i >= collapseAfter && !selected.includes(opt)).length : 0

  return (
    <div>
      <p className="field-label">{label}</p>
      <div className="flex flex-wrap gap-2">
        {visible.map(opt => (
          <button
            key={opt}
            type="button"
            onClick={() => onToggle(opt)}
            aria-pressed={selected.includes(opt)}
            className={`chip ${selected.includes(opt) ? 'chip-on' : 'chip-off'}`}
          >
            {LABEL[opt] ?? opt}
          </button>
        ))}
        {collapseAfter && !expanded && hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="chip border-dashed border-ink-faint/60 text-ink-muted hover:bg-white"
          >
            +{hiddenCount} fler
          </button>
        )}
        {collapseAfter && expanded && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="chip border-dashed border-ink-faint/60 text-ink-muted hover:bg-white"
          >
            Visa färre
          </button>
        )}
      </div>
    </div>
  )
}
