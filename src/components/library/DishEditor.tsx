import { useRef, useState } from 'react'
import { v4 as uuid } from 'uuid'
import { useLibraryStore } from '../../store/libraryStore'
import { useWeekStore } from '../../store/weekStore'
import { dishMostCommonMonth, MONTH_NAMES } from '../../utils/weekUtils'
import Modal from '../common/Modal'
import type {
  Dish, Ingredient, Protein, Carb, Cuisine, DishType, Tag, ShoppingCategory,
} from '../../types'

const ALL_PROTEINS: Protein[] = ['kyckling','nöt','fläsk','fisk','skaldjur','lamm','vilt','vegetarisk','vegan']
const ALL_CARBS:    Carb[]    = ['ris','pasta','potatis','nudlar','bröd','ingen']
const ALL_CUISINES: Cuisine[] = ['svensk','italiensk','asiatisk','japansk','koreansk','indisk','mellanöstern','mexikansk','fransk','nordafrikansk','övrigt']
const ALL_TYPES:    DishType[] = ['soppa','sallad','paj','gryta','grillat','bowl','burgare','taco','wrap','pizza']
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
  snabb:'Snabb', festlig:'Festlig', barnvänlig:'Barnvänlig',
  lowfodmap:'Low FODMAP', lchf:'LCHF', stark:'Stark', lågfett:'Låg fetthalt',
  mejeri:'Mejeri', kött:'Kött',
  grönsaker:'Grönsaker', frukt:'Frukt', torrvaror:'Torrvaror',
  konserver:'Konserver', frys:'Frys', kryddor:'Kryddor',
}

// ── Recipe fetching helpers ───────────────────────────────────────────────────

const KNOWN_UNITS = /^(dl|l|ml|cl|g|kg|mg|msk|tsk|krm|st|bit|skivor?|näve|knippe|burkar?|förpackningar?|paket|dosar?|klyftor?|tänder|kvistar?|blad|cups?|tbsp|tsp|oz|lb|liter|gram|kilogram)$/i

function parseIngredientStr(str: string): Ingredient {
  const s = str
    .trim()
    .replace('½', '0.5').replace('¼', '0.25').replace('¾', '0.75')
    .replace('⅓', '0.33').replace('⅔', '0.67')
    .replace(/\s+/g, ' ')

  // "2 dl mjölk", "1.5 kg potatis", "3 msk olja"
  const m3 = s.match(/^([\d.,/]+)\s+(\S+)\s+(.+)$/)
  if (m3) {
    const amount = parseFloat(m3[1].replace(',', '.')) || 1
    if (KNOWN_UNITS.test(m3[2])) {
      return { id: uuid(), name: m3[3].trim(), amount, unit: m3[2].toLowerCase(), category: 'övrigt', portionsBase: 4 }
    }
    return { id: uuid(), name: (m3[2] + ' ' + m3[3]).trim(), amount, unit: 'st', category: 'övrigt', portionsBase: 4 }
  }

  // "3 ägg"
  const m2 = s.match(/^([\d.,/]+)\s+(.+)$/)
  if (m2) {
    const amount = parseFloat(m2[1].replace(',', '.')) || 1
    return { id: uuid(), name: m2[2].trim(), amount, unit: 'st', category: 'övrigt', portionsBase: 4 }
  }

  return { id: uuid(), name: s, amount: 1, unit: 'st', category: 'övrigt', portionsBase: 4 }
}

function extractInstructions(raw: unknown): string {
  if (!raw) return ''
  if (typeof raw === 'string') return raw.trim()

  if (Array.isArray(raw)) {
    const lines: string[] = []
    let n = 1
    for (const item of raw) {
      if (typeof item === 'string') {
        lines.push(`${n}. ${item.trim()}`)
        n++
      } else if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>
        if (obj['@type'] === 'HowToSection' && Array.isArray(obj.itemListElement)) {
          if (obj.name) lines.push(`\n${obj.name}`)
          for (const sub of obj.itemListElement) {
            const text = ((sub as Record<string, unknown>).text ?? (sub as Record<string, unknown>).name ?? '') as string
            if (text) { lines.push(`${n}. ${text.trim()}`); n++ }
          }
        } else {
          const text = ((obj.text ?? obj.name) ?? '') as string
          if (text.trim()) { lines.push(`${n}. ${text.trim()}`); n++ }
        }
      }
    }
    return lines.join('\n\n')
  }

  return ''
}

function findRecipeSchema(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== 'object') return null
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findRecipeSchema(item)
      if (found) return found
    }
    return null
  }
  const obj = data as Record<string, unknown>
  const type = obj['@type']
  if (type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'))) return obj
  if (Array.isArray(obj['@graph'])) return findRecipeSchema(obj['@graph'])
  return null
}

type FetchedRecipe = { ingredients: Ingredient[]; instructions: string }

async function fetchAndParseRecipe(url: string): Promise<FetchedRecipe> {
  const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
  const res = await fetch(proxyUrl)
  if (!res.ok) throw new Error('Kunde inte hämta receptsidan')
  const html = await res.text()

  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    try {
      const recipe = findRecipeSchema(JSON.parse(m[1]))
      if (recipe) {
        const ingredients = ((recipe.recipeIngredient as string[] | undefined) ?? []).map(parseIngredientStr)
        const instructions = extractInstructions(recipe.recipeInstructions)
        return { ingredients, instructions }
      }
    } catch { /* skip */ }
  }

  throw new Error('Hittade ingen receptdata på sidan. Sidan kanske inte stödjer strukturerade data.')
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  dish: Dish | null
  initialName?: string
  onClose: () => void
  onSaved?: (id: string) => void
}

function blank(): Omit<Dish, 'id' | 'cookingHistory'> {
  return {
    name: '', protein: [], carb: [], cuisine: 'övrigt',
    type: [], tags: [], recipeUrl: '', ingredients: [], instructions: '', notes: '', preferredMonths: [],
  }
}

export default function DishEditor({ dish, initialName, onClose, onSaved }: Props) {
  const { addDish, updateDish, deleteDish } = useLibraryStore()
  const weeks = Object.values(useWeekStore().weeks)
  const [form, setForm] = useState<Omit<Dish, 'id' | 'cookingHistory'>>(
    dish
      ? { ...dish, instructions: dish.instructions ?? '' }
      : { ...blank(), name: initialName ?? '' }
  )
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [fetchStatus, setFetchStatus] = useState<{ state: 'idle' | 'loading' | 'error'; error: string }>({ state: 'idle', error: '' })
  const fetchCacheRef = useRef<{ url: string; promise: Promise<FetchedRecipe> } | null>(null)

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
    onClose()
  }

  function addIngredient() {
    const ing: Ingredient = {
      id: uuid(), name: '', amount: 1, unit: 'g', category: 'övrigt', portionsBase: 4,
    }
    setForm(f => ({ ...f, ingredients: [...f.ingredients, ing] }))
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

  function getRecipeData(): Promise<FetchedRecipe> {
    if (fetchCacheRef.current?.url === form.recipeUrl) return fetchCacheRef.current.promise
    const promise = fetchAndParseRecipe(form.recipeUrl)
    fetchCacheRef.current = { url: form.recipeUrl, promise }
    return promise
  }

  async function handleFetch(field: 'ingredients' | 'instructions') {
    setFetchStatus({ state: 'loading', error: '' })
    try {
      const data = await getRecipeData()
      if (field === 'ingredients') {
        if (data.ingredients.length === 0) {
          setFetchStatus({ state: 'error', error: 'Hittade inga ingredienser i receptet.' })
        } else {
          setForm(f => ({ ...f, ingredients: data.ingredients }))
          setFetchStatus({ state: 'idle', error: '' })
        }
      } else {
        if (!data.instructions) {
          setFetchStatus({ state: 'error', error: 'Hittade inga instruktioner i receptet.' })
        } else {
          setForm(f => ({ ...f, instructions: data.instructions }))
          setFetchStatus({ state: 'idle', error: '' })
        }
      }
    } catch (e) {
      setFetchStatus({ state: 'error', error: e instanceof Error ? e.message : 'Okänt fel' })
    }
  }

  return (
    <Modal
      title={isNew ? 'Ny rätt' : 'Redigera rätt'}
      onClose={onClose}
      wide
    >
      <div className="space-y-5">
        {/* Name */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Namn *</label>
          <input
            autoFocus
            type="text"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
          />
        </div>

        {/* Protein */}
        <ChipGroup
          label="Protein"
          options={ALL_PROTEINS}
          selected={form.protein}
          onToggle={v => setForm(f => ({ ...f, protein: toggle(f.protein, v as Protein) }))}
        />

        {/* Carb */}
        <ChipGroup
          label="Kolhydrat"
          options={ALL_CARBS}
          selected={form.carb}
          onToggle={v => setForm(f => ({ ...f, carb: toggle(f.carb, v as Carb) }))}
        />

        {/* Cuisine */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Kök</label>
          <select
            value={form.cuisine}
            onChange={e => setForm(f => ({ ...f, cuisine: e.target.value as Cuisine }))}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white w-full focus:outline-none focus:ring-2 focus:ring-brand-300"
          >
            {ALL_CUISINES.map(c => <option key={c} value={c}>{LABEL[c]}</option>)}
          </select>
        </div>

        {/* Type */}
        <ChipGroup
          label="Typ"
          options={ALL_TYPES}
          selected={form.type}
          onToggle={v => setForm(f => ({ ...f, type: toggle(f.type, v as DishType) }))}
        />

        {/* Tags */}
        <ChipGroup
          label="Taggar"
          options={ALL_TAGS}
          selected={form.tags}
          onToggle={v => setForm(f => ({ ...f, tags: toggle(f.tags, v as Tag) }))}
        />

        {/* Recipe URL */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Receptlänk</label>
          <input
            type="url"
            value={form.recipeUrl}
            onChange={e => {
              fetchCacheRef.current = null
              setFetchStatus({ state: 'idle', error: '' })
              setForm(f => ({ ...f, recipeUrl: e.target.value }))
            }}
            placeholder="https://…"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
          />
          {form.recipeUrl && (
            <div className="flex gap-3 mt-2">
              <button
                type="button"
                onClick={() => handleFetch('ingredients')}
                disabled={fetchStatus.state === 'loading'}
                className="text-xs text-brand-600 hover:text-brand-800 font-medium disabled:opacity-40"
              >
                {fetchStatus.state === 'loading' ? '⏳ Hämtar…' : '↓ Hämta ingredienser'}
              </button>
              <button
                type="button"
                onClick={() => handleFetch('instructions')}
                disabled={fetchStatus.state === 'loading'}
                className="text-xs text-brand-600 hover:text-brand-800 font-medium disabled:opacity-40"
              >
                {fetchStatus.state === 'loading' ? '⏳ Hämtar…' : '↓ Hämta instruktioner'}
              </button>
            </div>
          )}
          {fetchStatus.error && (
            <p className="text-xs text-red-500 mt-1">{fetchStatus.error}</p>
          )}
        </div>

        {/* Ingredients */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-gray-500">Ingredienser</label>
            <button
              onClick={addIngredient}
              className="text-xs text-brand-600 hover:text-brand-800 font-medium"
            >
              + Lägg till
            </button>
          </div>
          {form.ingredients.length === 0 && (
            <p className="text-xs text-gray-300 italic">Inga ingredienser än.</p>
          )}
          <div className="space-y-2">
            {form.ingredients.map(ing => (
              <div key={ing.id} className="flex flex-wrap gap-2 items-center bg-gray-50 rounded-xl p-2">
                <input
                  type="text"
                  placeholder="Ingrediens"
                  value={ing.name}
                  onChange={e => updateIngredient(ing.id, { name: e.target.value })}
                  className="flex-1 min-w-[120px] border border-gray-200 rounded-lg px-2 py-1 text-xs"
                />
                <input
                  type="number"
                  placeholder="Mängd"
                  value={ing.amount}
                  onChange={e => updateIngredient(ing.id, { amount: Number(e.target.value) })}
                  className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-xs"
                />
                <input
                  type="text"
                  placeholder="Enhet"
                  value={ing.unit}
                  onChange={e => updateIngredient(ing.id, { unit: e.target.value })}
                  className="w-16 border border-gray-200 rounded-lg px-2 py-1 text-xs"
                />
                <select
                  value={ing.category}
                  onChange={e => updateIngredient(ing.id, { category: e.target.value as ShoppingCategory })}
                  className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white"
                >
                  {ALL_CATS.map(c => <option key={c} value={c}>{LABEL[c] ?? c}</option>)}
                </select>
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <span>för</span>
                  <input
                    type="number"
                    value={ing.portionsBase}
                    onChange={e => updateIngredient(ing.id, { portionsBase: Number(e.target.value) })}
                    className="w-12 border border-gray-200 rounded-lg px-2 py-1 text-xs"
                  />
                  <span>port.</span>
                </div>
                <button
                  onClick={() => removeIngredient(ing.id)}
                  className="text-gray-300 hover:text-red-400 text-sm"
                >✕</button>
              </div>
            ))}
          </div>
        </div>

        {/* Instructions */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Tillagning</label>
          <textarea
            value={form.instructions}
            onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))}
            rows={5}
            placeholder="Steg-för-steg instruktioner…"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 resize-none"
          />
        </div>

        {/* Preferred months */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Föredragna månader
            {historyMonth && (
              <span className="ml-2 text-gray-400 font-normal">
                (vanligast i historiken: {MONTH_NAMES[historyMonth]})
              </span>
            )}
          </label>
          <div className="flex flex-wrap gap-1.5">
            {ALL_MONTHS.map(m => (
              <button
                key={m}
                type="button"
                onClick={() => setForm(f => ({
                  ...f,
                  preferredMonths: f.preferredMonths.includes(m)
                    ? f.preferredMonths.filter(x => x !== m)
                    : [...f.preferredMonths, m],
                }))}
                className={`text-xs px-2 py-1 rounded-full border font-medium transition-colors
                  ${form.preferredMonths.includes(m)
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
              >
                {MONTH_NAMES[m]}
              </button>
            ))}
          </div>
          {form.preferredMonths.length === 0 && (
            <p className="text-xs text-gray-300 mt-1">Inga valda — används året runt</p>
          )}
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Anteckningar</label>
          <textarea
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            rows={2}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 resize-none"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2 border-t border-gray-100">
          <button
            onClick={save}
            disabled={!form.name.trim()}
            className="flex-1 bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white font-semibold py-2.5 rounded-xl text-sm"
          >
            {isNew ? 'Lägg till' : 'Spara'}
          </button>
          {!isNew && (
            confirmDelete ? (
              <div className="flex gap-1">
                <button
                  onClick={() => { deleteDish(dish.id); onClose() }}
                  className="bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded-xl text-sm font-medium"
                >
                  Bekräfta radering
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="border border-gray-200 px-3 py-2 rounded-xl text-sm text-gray-600"
                >
                  Avbryt
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="border border-red-200 text-red-400 hover:bg-red-50 px-3 py-2 rounded-xl text-sm"
              >
                Ta bort
              </button>
            )
          )}
        </div>
      </div>
    </Modal>
  )
}

function ChipGroup<T extends string>({
  label, options, selected, onToggle,
}: { label: string; options: T[]; selected: T[]; onToggle: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <div className="flex flex-wrap gap-1.5">
        {options.map(opt => (
          <button
            key={opt}
            type="button"
            onClick={() => onToggle(opt)}
            className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors
              ${selected.includes(opt)
                ? 'bg-brand-600 text-white border-brand-600'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
          >
            {LABEL[opt] ?? opt}
          </button>
        ))}
      </div>
    </div>
  )
}
