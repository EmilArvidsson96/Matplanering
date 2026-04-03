import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { v4 as uuid } from 'uuid'
import { useWeekStore, activeWeek } from '../../store/weekStore'
import { useLibraryStore } from '../../store/libraryStore'
import {
  totalPlannedPortions,
  totalNeededPortions,
  remainderPortions,
} from '../../utils/weekUtils'
import DishPicker from './DishPicker'
import DishEditor from '../library/DishEditor'
import type { Dish, PlannedMeal, TemporaryIngredient, ShoppingCategory } from '../../types'

const SHOPPING_CATS: ShoppingCategory[] = [
  'grönsaker','frukt','mejeri','kött','fisk','bröd','torrvaror','konserver','frys','kryddor','övrigt',
]

export default function BrainstormStep() {
  const store       = useWeekStore()
  const week        = activeWeek(store)
  const { dishes }  = useLibraryStore()
  const [showPicker, setShowPicker]   = useState(false)
  const [editingId, setEditingId]     = useState<string | null>(null)
  const [newName, setNewName]         = useState('')
  const [addMode, setAddMode]         = useState<'free' | 'library' | null>(null)
  const [dishTarget, setDishTarget]   = useState<{ dish: Dish | null; mealId: string; mealName: string } | null>(null)

  function openDishEditor(meal: PlannedMeal) {
    const dish = meal.dishId ? dishes.find(d => d.id === meal.dishId) ?? null : null
    setDishTarget({ dish, mealId: meal.id, mealName: meal.name })
  }

  function handleDishSaved(savedId: string) {
    if (dishTarget && !dishTarget.dish) {
      store.updateMeal(dishTarget.mealId, { dishId: savedId })
    }
    setDishTarget(null)
  }

  const needed   = totalNeededPortions(week.schedule)
  const planned  = totalPlannedPortions(week.meals)
  const rester   = remainderPortions(week.meals)
  const total    = planned + rester
  const leftover = total - needed

  function addFreeText() {
    if (!newName.trim()) return
    store.addMeal({
      dishId: null, name: newName.trim(),
      portions: week.householdSize * 2, isRemainder: false,
      notes: '', usesIngredientsFromHome: '', temporaryIngredients: [],
    })
    setNewName('')
    setAddMode(null)
  }

  function addFromLibrary(dish: Dish) {
    store.addMeal({
      dishId: dish.id, name: dish.name,
      portions: week.householdSize * 2, isRemainder: false,
      notes: '', usesIngredientsFromHome: '', temporaryIngredients: [],
    })
    setShowPicker(false)
  }

  function addRemainder() {
    store.addMeal({
      dishId: null, name: 'Rester',
      portions: week.householdSize, isRemainder: true,
      notes: '', usesIngredientsFromHome: '', temporaryIngredients: [],
    })
  }

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Portion counter */}
      <div className={`rounded-2xl p-4 flex flex-wrap gap-4 items-center shadow-sm
        ${leftover < 0 ? 'bg-red-50' : leftover > needed * 0.3 ? 'bg-amber-50' : 'bg-brand-50'}`}
      >
        <Stat label="Behövs" value={needed} />
        <Stat label="Planerat" value={planned} />
        {rester > 0 && <Stat label="Rester" value={rester} />}
        <div className="border-l border-gray-200 pl-4">
          <Stat
            label={leftover < 0 ? 'Saknas' : 'Över'}
            value={Math.abs(leftover)}
            color={leftover < 0 ? 'text-red-600' : leftover === 0 ? 'text-brand-600' : 'text-amber-600'}
          />
        </div>
        {leftover < 0 && (
          <p className="w-full text-xs text-red-500 -mt-2">
            Du behöver planera {Math.abs(leftover)} portioner till.
          </p>
        )}
      </div>

      {/* Meal list */}
      <div className="space-y-2">
        {week.meals.length === 0 && (
          <p className="text-sm text-gray-500 py-4 text-center">
            Inga rätter planerade än. Lägg till nedan!
          </p>
        )}
        {week.meals.map(meal => {
          const dish = meal.dishId ? dishes.find(d => d.id === meal.dishId) : null
          const missingIngredients = dish && dish.ingredients.length === 0
          return (
            <MealRow
              key={meal.id}
              meal={meal}
              missingIngredients={!!missingIngredients}
              isEditing={editingId === meal.id}
              onEdit={() => setEditingId(editingId === meal.id ? null : meal.id)}
              onUpdate={p => store.updateMeal(meal.id, p)}
              onDelete={() => store.deleteMeal(meal.id)}
              onOpenDish={() => openDishEditor(meal)}
            />
          )
        })}
      </div>

      {/* Add controls */}
      <div className="bg-white rounded-2xl p-5 shadow-sm space-y-3">
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => { setAddMode(null); setShowPicker(true) }}
            className="flex-1 bg-brand-600 hover:bg-brand-700 text-white font-medium py-2 rounded-xl text-sm"
          >
            + Välj från bibliotek
          </button>
          <button
            onClick={() => setAddMode(addMode === 'free' ? null : 'free')}
            className="flex-1 border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium py-2 rounded-xl text-sm"
          >
            + Skriv fritt
          </button>
          <button
            onClick={addRemainder}
            className="flex items-center gap-1.5 border border-gray-200 hover:bg-amber-50 text-amber-600 font-medium px-4 py-2 rounded-xl text-sm"
            title="Lägg till rester från förra veckan"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Rester
          </button>
        </div>

        {addMode === 'free' && (
          <div className="flex gap-2">
            <input
              autoFocus
              type="text"
              placeholder="Namn på rätten…"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addFreeText()}
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
            />
            <button
              onClick={addFreeText}
              className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-xl text-sm font-medium"
            >
              Lägg till
            </button>
          </div>
        )}
      </div>

      {showPicker && (
        <DishPicker
          onSelect={addFromLibrary}
          onClose={() => setShowPicker(false)}
          weekMealIds={week.meals.map(m => m.dishId).filter(Boolean) as string[]}
        />
      )}

      {dishTarget && (
        <DishEditor
          dish={dishTarget.dish}
          initialName={dishTarget.dish ? undefined : dishTarget.mealName}
          onClose={() => setDishTarget(null)}
          onSaved={handleDishSaved}
        />
      )}
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="text-center">
      <div className={`text-2xl font-bold ${color ?? 'text-gray-800'}`}>{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  )
}

function MealRow({ meal, missingIngredients, isEditing, onEdit, onUpdate, onDelete, onOpenDish }: {
  meal: PlannedMeal
  missingIngredients: boolean
  isEditing: boolean
  onEdit: () => void
  onUpdate: (p: Partial<PlannedMeal>) => void
  onDelete: () => void
  onOpenDish: () => void
}) {
  function addTempIngredient() {
    const ing: TemporaryIngredient = {
      id: uuid(), name: '', amount: '', unit: '', category: 'övrigt',
    }
    onUpdate({ temporaryIngredients: [...(meal.temporaryIngredients ?? []), ing] })
  }

  function updateTempIngredient(id: string, patch: Partial<TemporaryIngredient>) {
    onUpdate({
      temporaryIngredients: (meal.temporaryIngredients ?? []).map(i =>
        i.id === id ? { ...i, ...patch } : i
      ),
    })
  }

  function removeTempIngredient(id: string) {
    onUpdate({
      temporaryIngredients: (meal.temporaryIngredients ?? []).filter(i => i.id !== id),
    })
  }

  return (
    <div className={`bg-white rounded-xl border transition-all
      ${meal.isRemainder ? 'border-amber-200' : 'border-gray-200'}`}
    >
      {/* Main row */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 p-3">
        {/* Name row: icon + name + warning */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {/* Rester toggle — always visible */}
          <button
            onClick={() => onUpdate({ isRemainder: !meal.isRemainder })}
            title={meal.isRemainder ? 'Markerat som rester' : 'Markera som rester'}
            className={`shrink-0 transition-colors ${meal.isRemainder ? 'text-amber-500' : 'text-gray-300 hover:text-gray-400'}`}
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Name */}
          <button
            onClick={onOpenDish}
            className="flex-1 font-medium text-sm text-gray-800 text-left hover:text-brand-600 transition-colors break-words min-w-0"
          >
            {meal.name}
          </button>

          {/* Missing ingredients warning */}
          {missingIngredients && (
            <button
              onClick={onOpenDish}
              className="text-xs bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full shrink-0 hover:bg-amber-100 transition-colors"
              title="Inga ingredienser konfigurerade – klicka för att konfigurera"
            >
              inga ingredienser
            </button>
          )}
        </div>

        {/* Controls row: portion counter + edit/delete */}
        <div className="flex items-center gap-1 shrink-0 ml-6 sm:ml-0">
          {/* Portion counter */}
          <button
            onClick={() => onUpdate({ portions: Math.max(1, meal.portions - 1) })}
            className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 text-sm font-bold leading-none flex items-center justify-center"
          >−</button>
          <span className="w-6 text-center text-sm font-semibold">{meal.portions}</span>
          <button
            onClick={() => onUpdate({ portions: meal.portions + 1 })}
            className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 text-sm font-bold leading-none flex items-center justify-center"
          >+</button>
          <span className="text-xs text-gray-500 ml-0.5">port.</span>

          <button onClick={onEdit} className="text-gray-500 hover:text-gray-700 text-sm px-1 ml-1">
            {isEditing ? '▲' : '▼'}
          </button>
          <button onClick={onDelete} className="text-gray-400 hover:text-red-500 text-sm px-1">✕</button>
        </div>
      </div>

      {/* Expanded section */}
      {isEditing && (
        <div className="px-3 pb-3 space-y-2 border-t border-gray-50 pt-2">
          <input
            type="text"
            placeholder="Notering…"
            value={meal.notes}
            onChange={e => onUpdate({ notes: e.target.value })}
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
          />
          <input
            type="text"
            placeholder="Ingredienser jag använder hemifrån…"
            value={meal.usesIngredientsFromHome}
            onChange={e => onUpdate({ usesIngredientsFromHome: e.target.value })}
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
          />

          {/* Temporary ingredients */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-gray-600">Tillfälliga ingredienser (för den här veckan)</span>
              <button onClick={addTempIngredient} className="text-xs text-brand-600 hover:text-brand-800 font-medium">
                + Lägg till
              </button>
            </div>
            {(meal.temporaryIngredients ?? []).map(ing => (
              <div key={ing.id} className="flex flex-wrap gap-1.5 mb-1 items-center bg-gray-50 rounded-lg p-1.5">
                <input
                  placeholder="Ingrediens"
                  value={ing.name}
                  onChange={e => updateTempIngredient(ing.id, { name: e.target.value })}
                  className="flex-1 min-w-[100px] border border-gray-200 rounded px-2 py-1 text-xs"
                />
                <input
                  placeholder="Mängd"
                  value={ing.amount}
                  onChange={e => updateTempIngredient(ing.id, { amount: e.target.value })}
                  className="w-16 border border-gray-200 rounded px-2 py-1 text-xs"
                />
                <input
                  placeholder="Enhet"
                  value={ing.unit}
                  onChange={e => updateTempIngredient(ing.id, { unit: e.target.value })}
                  className="w-14 border border-gray-200 rounded px-2 py-1 text-xs"
                />
                <select
                  value={ing.category}
                  onChange={e => updateTempIngredient(ing.id, { category: e.target.value as ShoppingCategory })}
                  className="border border-gray-200 rounded px-1 py-1 text-xs bg-white"
                >
                  {SHOPPING_CATS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <button onClick={() => removeTempIngredient(ing.id)} className="text-gray-400 hover:text-red-500">✕</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
