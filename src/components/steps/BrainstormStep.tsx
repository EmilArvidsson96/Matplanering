import { useState } from 'react'
import { useWeekStore, activeWeek } from '../../store/weekStore'
import {
  totalPlannedPortions,
  totalNeededPortions,
  remainderPortions,
} from '../../utils/weekUtils'
import DishPicker from './DishPicker'
import type { PlannedMeal, Dish } from '../../types'

export default function BrainstormStep() {
  const store = useWeekStore()
  const week  = activeWeek(store)
  const [showPicker, setShowPicker] = useState(false)
  const [editingId, setEditingId]   = useState<string | null>(null)
  const [newName, setNewName]       = useState('')
  const [addMode, setAddMode]       = useState<'free' | 'library'>('library')

  const needed   = totalNeededPortions(week.schedule)
  const planned  = totalPlannedPortions(week.meals)
  const rester   = remainderPortions(week.meals)
  const total    = planned + rester
  const leftover = total - needed

  function addFreeText() {
    if (!newName.trim()) return
    store.addMeal({
      dishId: null,
      name: newName.trim(),
      portions: week.householdSize * 2,
      isRemainder: false,
      notes: '',
      usesIngredientsFromHome: '',
    })
    setNewName('')
  }

  function addFromLibrary(dish: Dish) {
    store.addMeal({
      dishId: dish.id,
      name: dish.name,
      portions: week.householdSize * 2,
      isRemainder: false,
      notes: '',
      usesIngredientsFromHome: '',
    })
    setShowPicker(false)
  }

  function addRemainder() {
    store.addMeal({
      dishId: null,
      name: 'Rester',
      portions: week.householdSize,
      isRemainder: true,
      notes: '',
      usesIngredientsFromHome: '',
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
        <Stat label="Rester" value={rester} />
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
          <p className="text-sm text-gray-400 py-4 text-center">
            Inga rätter planerade än. Lägg till nedan!
          </p>
        )}
        {week.meals.map((meal) => (
          <MealRow
            key={meal.id}
            meal={meal}
            isEditing={editingId === meal.id}
            onEdit={() => setEditingId(meal.id)}
            onClose={() => setEditingId(null)}
            onUpdate={(p) => store.updateMeal(meal.id, p)}
            onDelete={() => store.deleteMeal(meal.id)}
          />
        ))}
      </div>

      {/* Add controls */}
      <div className="bg-white rounded-2xl p-5 shadow-sm space-y-3">
        <div className="flex gap-2">
          <button
            onClick={() => { setAddMode('library'); setShowPicker(true) }}
            className="flex-1 bg-brand-600 hover:bg-brand-700 text-white font-medium py-2 rounded-xl text-sm transition-colors"
          >
            + Välj från bibliotek
          </button>
          <button
            onClick={() => setAddMode('free')}
            className="flex-1 border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium py-2 rounded-xl text-sm transition-colors"
          >
            + Skriv fritt
          </button>
          <button
            onClick={addRemainder}
            className="border border-gray-200 hover:bg-gray-50 text-gray-500 font-medium px-3 py-2 rounded-xl text-sm transition-colors"
            title="Lägg till rester från förra veckan"
          >
            ♻️ Rester
          </button>
        </div>

        {addMode === 'free' && (
          <div className="flex gap-2">
            <input
              autoFocus
              type="text"
              placeholder="Namn på rätten…"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addFreeText()}
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

function MealRow({
  meal, isEditing, onEdit, onClose, onUpdate, onDelete,
}: {
  meal: PlannedMeal
  isEditing: boolean
  onEdit: () => void
  onClose: () => void
  onUpdate: (p: Partial<PlannedMeal>) => void
  onDelete: () => void
}) {
  return (
    <div className={`bg-white rounded-xl shadow-sm border transition-all
      ${meal.isRemainder ? 'border-amber-200' : 'border-gray-100'}`}
    >
      <div className="flex items-center gap-3 p-3">
        {/* Remainder badge */}
        {meal.isRemainder && (
          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full shrink-0">
            Rester
          </span>
        )}

        {/* Name */}
        <span className="flex-1 font-medium text-sm text-gray-800 truncate">{meal.name}</span>

        {/* Portion counter */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => onUpdate({ portions: Math.max(1, meal.portions - 1) })}
            className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 text-sm font-bold leading-none flex items-center justify-center"
          >−</button>
          <span className="w-6 text-center text-sm font-semibold">{meal.portions}</span>
          <button
            onClick={() => onUpdate({ portions: meal.portions + 1 })}
            className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 text-sm font-bold leading-none flex items-center justify-center"
          >+</button>
          <span className="text-xs text-gray-400 ml-0.5">port.</span>
        </div>

        {/* Actions */}
        <button
          onClick={isEditing ? onClose : onEdit}
          className="text-gray-400 hover:text-gray-600 text-sm px-1"
        >
          {isEditing ? '▲' : '▼'}
        </button>
        <button
          onClick={onDelete}
          className="text-gray-300 hover:text-red-400 text-sm px-1"
        >
          ✕
        </button>
      </div>

      {isEditing && (
        <div className="px-3 pb-3 space-y-2 border-t border-gray-50 pt-2">
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={meal.isRemainder}
              onChange={(e) => onUpdate({ isRemainder: e.target.checked })}
              className="rounded accent-brand-600"
            />
            Rester (räknas som tillgängliga från start)
          </label>
          <input
            type="text"
            placeholder="Ingredienser hemma / notering…"
            value={meal.notes}
            onChange={(e) => onUpdate({ notes: e.target.value })}
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
          />
          <input
            type="text"
            placeholder="Ingredienser jag använder hemifrån…"
            value={meal.usesIngredientsFromHome}
            onChange={(e) => onUpdate({ usesIngredientsFromHome: e.target.value })}
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
          />
        </div>
      )}
    </div>
  )
}
