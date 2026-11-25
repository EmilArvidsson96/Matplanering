import { useEffect, useState } from 'react'
import { Snowflake, CakeSlice, X } from 'lucide-react'
import { v4 as uuid } from 'uuid'
import { useWeekStore, activeWeek } from '../../store/weekStore'
import { useLibraryStore } from '../../store/libraryStore'
import { isExtraMeal, scheduleDates, formatDayShort } from '../../utils/weekUtils'
import DishPicker from './DishPicker'
import DishEditor from '../library/DishEditor'
import type { Dish, ExtraType, PlannedMeal } from '../../types'

export const EXTRA_LABELS: Record<ExtraType, string> = {
  frys: 'Till frysen',
  bak: 'Bak',
}

export function ExtraTypeIcon({ type, className }: { type: ExtraType; className?: string }) {
  return type === 'bak'
    ? <CakeSlice className={className} />
    : <Snowflake className={className} />
}

/**
 * Cooking and baking that isn't eaten from this week's portions: batches for the
 * freezer, bread, buns etc. Ingredients still land on the shopping list.
 */
export default function ExtraCookingSection() {
  const store      = useWeekStore()
  const week       = activeWeek(store)
  const { dishes } = useLibraryStore()
  const [pickerType, setPickerType] = useState<ExtraType | null>(null)
  const [freeType, setFreeType]     = useState<ExtraType | null>(null)
  const [freeName, setFreeName]     = useState('')
  const [dishTarget, setDishTarget] = useState<{ dish: Dish | null; mealId: string; componentId: string; name: string } | null>(null)

  const extras = week.meals.filter(isExtraMeal)
  const dates  = scheduleDates(week)
  const freezeFromMeals = week.meals
    .filter(m => !isExtraMeal(m) && (m.freezePortions ?? 0) > 0)

  function addExtra(type: ExtraType, name: string, dish: Dish | null) {
    const batch = dish?.ingredients[0]?.portionsBase
    store.addMeal({
      name,
      kind: 'extra',
      extraType: type,
      components: [{
        id: uuid(), dishId: dish?.id ?? null, name, portionsMode: 'own',
        portions: batch && batch > 0 ? batch : week.householdSize * 2,
      }],
      isRemainder: false,
      notes: '', usesIngredientsFromHome: '', temporaryIngredients: [],
    })
  }

  function submitFree() {
    if (!freeType || !freeName.trim()) return
    addExtra(freeType, freeName.trim(), null)
    setFreeName('')
    setFreeType(null)
  }

  function openDish(meal: PlannedMeal) {
    const comp = meal.components[0]
    if (!comp) return
    const dish = comp.dishId ? dishes.find(d => d.id === comp.dishId) ?? null : null
    setDishTarget({ dish, mealId: meal.id, componentId: comp.id, name: comp.name })
  }

  function handleDishSaved(savedId: string) {
    if (dishTarget && !dishTarget.dish) {
      // Newly created recipe: link it and default the amount to one batch of it
      const saved = useLibraryStore.getState().dishes.find(d => d.id === savedId)
      const batch = saved?.ingredients[0]?.portionsBase
      store.updateMealComponent(dishTarget.mealId, dishTarget.componentId, {
        dishId: savedId,
        ...(batch && batch > 0 ? { portions: batch } : {}),
      })
    }
    setDishTarget(null)
  }

  const weekDishIds = week.meals
    .flatMap(m => m.components.map(c => c.dishId))
    .filter(Boolean) as string[]

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-gray-800">Bak & matlagning till frysen</h3>
        <p className="text-xs text-gray-500">
          Räknas inte in i veckans portioner, men ingredienserna hamnar på inköpslistan.
        </p>
      </div>

      {freezeFromMeals.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {freezeFromMeals.map(m => (
            <span key={m.id} className="inline-flex items-center gap-1 text-xs bg-sky-50 text-sky-700 border border-sky-100 rounded-full px-2.5 py-1">
              <Snowflake className="w-3 h-3" />
              {m.name} · +{m.freezePortions} port.
            </span>
          ))}
        </div>
      )}

      {extras.length > 0 && (
        <div className="space-y-2">
          {extras.map(meal => (
            <ExtraRow
              key={meal.id}
              meal={meal}
              dish={meal.components[0]?.dishId ? dishes.find(d => d.id === meal.components[0].dishId) ?? null : null}
              dates={dates}
              onUpdate={p => store.updateMeal(meal.id, p)}
              onSetAmount={n => meal.components[0] && store.updateMealComponent(meal.id, meal.components[0].id, { portions: n })}
              onDelete={() => store.deleteMeal(meal.id)}
              onOpenDish={() => openDish(meal)}
            />
          ))}
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setPickerType('frys')}
          className="flex items-center gap-1.5 border border-sky-200 hover:bg-sky-50 text-sky-700 font-medium px-3 py-2 rounded-xl text-sm"
        >
          <Snowflake className="w-3.5 h-3.5" /> Laga till frysen
        </button>
        <button
          onClick={() => setPickerType('bak')}
          className="flex items-center gap-1.5 border border-pink-200 hover:bg-pink-50 text-pink-700 font-medium px-3 py-2 rounded-xl text-sm"
        >
          <CakeSlice className="w-3.5 h-3.5" /> Baka
        </button>
        <button
          onClick={() => setFreeType(freeType ? null : 'bak')}
          className="border border-gray-200 hover:bg-gray-50 text-gray-600 font-medium px-3 py-2 rounded-xl text-sm"
        >
          + Skriv fritt
        </button>
      </div>

      {freeType && (
        <div className="flex gap-2 flex-wrap">
          <TypeToggle value={freeType} onChange={setFreeType} />
          <input
            autoFocus
            type="text"
            placeholder={freeType === 'bak' ? 'T.ex. Kanelbullar…' : 'T.ex. Köttfärssås…'}
            value={freeName}
            onChange={e => setFreeName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submitFree()}
            className="flex-1 min-w-[140px] border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
          />
          <button
            onClick={submitFree}
            className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-xl text-sm font-medium"
          >
            Lägg till
          </button>
        </div>
      )}

      {pickerType && (
        <DishPicker
          onSelect={dish => { addExtra(pickerType, dish.name, dish); setPickerType(null) }}
          onClose={() => setPickerType(null)}
          weekMealIds={weekDishIds}
        />
      )}

      {dishTarget && (
        <DishEditor
          dish={dishTarget.dish}
          initialName={dishTarget.dish ? undefined : dishTarget.name}
          onClose={() => setDishTarget(null)}
          onSaved={handleDishSaved}
        />
      )}
    </div>
  )
}

function TypeToggle({ value, onChange }: { value: ExtraType; onChange: (t: ExtraType) => void }) {
  return (
    <div className="flex rounded-xl border border-gray-200 overflow-hidden text-xs shrink-0">
      {(['frys', 'bak'] as ExtraType[]).map(t => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          className={`flex items-center gap-1 px-3 py-2 font-medium transition-colors
            ${value === t ? 'bg-brand-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
        >
          <ExtraTypeIcon type={t} className="w-3.5 h-3.5" />
          {EXTRA_LABELS[t]}
        </button>
      ))}
    </div>
  )
}

function ExtraRow({
  meal, dish, dates, onUpdate, onSetAmount, onDelete, onOpenDish,
}: {
  meal: PlannedMeal
  dish: Dish | null
  dates: string[]
  onUpdate: (p: Partial<PlannedMeal>) => void
  onSetAmount: (n: number) => void
  onDelete: () => void
  onOpenDish: () => void
}) {
  const type: ExtraType = meal.extraType ?? 'frys'
  const amount = meal.components[0]?.portions ?? 1
  const unit = dish?.yieldUnit?.trim() || 'port.'
  const [text, setText] = useState(String(amount))
  useEffect(() => { setText(String(amount)) }, [amount])
  const missingIngredients = !dish || dish.ingredients.length === 0
  const dateOptions = meal.plannedDate && !dates.includes(meal.plannedDate)
    ? [meal.plannedDate, ...dates]
    : dates

  function commit(raw: string) {
    const n = parseInt(raw, 10)
    const v = isNaN(n) ? amount : Math.max(1, n)
    setText(String(v))
    if (v !== amount) onSetAmount(v)
  }

  function step(delta: number) {
    const v = Math.max(1, amount + delta)
    setText(String(v))
    onSetAmount(v)
  }

  return (
    <div className={`rounded-xl border p-3 space-y-2
      ${type === 'bak' ? 'border-pink-100 bg-pink-50/40' : 'border-sky-100 bg-sky-50/40'}`}
    >
      <div className="flex items-center gap-2">
        <button
          onClick={() => onUpdate({ extraType: type === 'bak' ? 'frys' : 'bak' })}
          title={`${EXTRA_LABELS[type]} – klicka för att byta`}
          className={`shrink-0 ${type === 'bak' ? 'text-pink-500' : 'text-sky-500'}`}
        >
          <ExtraTypeIcon type={type} className="w-4 h-4" />
        </button>

        <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
          <button
            onClick={onOpenDish}
            className="font-medium text-sm text-gray-800 text-left hover:text-brand-600 truncate"
            title={dish ? 'Öppna recept' : 'Skapa recept i biblioteket'}
          >
            {meal.name}
          </button>
          {missingIngredients && (
            <button
              onClick={onOpenDish}
              className="text-xs bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full hover:bg-amber-100"
              title="Lägg in recept och ingredienser så hamnar de på inköpslistan"
            >
              {dish ? 'inga ingredienser' : 'lägg in recept'}
            </button>
          )}
        </div>

        <button onClick={onDelete} className="p-1 text-gray-300 hover:text-red-400" title="Ta bort">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap pl-6">
        <div className="flex items-center gap-1">
          <button
            onClick={() => step(-1)}
            className="w-7 h-7 rounded-full bg-white border border-gray-200 hover:bg-gray-100 text-sm font-bold flex items-center justify-center"
          >−</button>
          <input
            type="text"
            inputMode="numeric"
            aria-label="Mängd"
            value={text}
            onChange={e => /^\d*$/.test(e.target.value) && setText(e.target.value)}
            onBlur={e => commit(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && commit((e.target as HTMLInputElement).value)}
            className="w-12 text-center border border-gray-200 rounded-lg py-1 text-sm font-semibold"
          />
          <button
            onClick={() => step(1)}
            className="w-7 h-7 rounded-full bg-white border border-gray-200 hover:bg-gray-100 text-sm font-bold flex items-center justify-center"
          >+</button>
          <span className="text-xs text-gray-500 ml-0.5">{unit}</span>
        </div>

        <select
          value={meal.plannedDate ?? ''}
          onChange={e => onUpdate({ plannedDate: e.target.value || undefined })}
          className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white"
          aria-label="Planerad dag"
        >
          <option value="">Ingen dag vald</option>
          {dateOptions.map(d => <option key={d} value={d}>{formatDayShort(d)}</option>)}
        </select>

        <input
          type="text"
          placeholder="Notering…"
          value={meal.notes}
          onChange={e => onUpdate({ notes: e.target.value })}
          className="flex-1 min-w-[120px] border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-brand-300"
        />
      </div>
    </div>
  )
}
