import type { Dish } from '../types'

export interface CompletenessField {
  id: 'name' | 'protein' | 'carb' | 'cuisine' | 'type' | 'tags' | 'ingredients' | 'instructions' | 'recipeUrl' | 'notes' | 'preferredMonths'
  label: string
  emoji: string
  done: boolean
  weight: number       // % weight contribution
  worth: number        // poäng om man fyller i denna
}

const CUISINE_FILLED = (c: Dish['cuisine']) => !!c && c !== 'övrigt'

export function computeCompleteness(dish: Dish): {
  fields: CompletenessField[]
  pct: number
  stars: number
  missingCount: number
  totalWorth: number
} {
  const fields: CompletenessField[] = [
    { id: 'name',         label: 'Namn',                emoji: '📛', done: !!dish.name?.trim(),        weight: 5,  worth: 0   },
    { id: 'protein',      label: 'Protein',             emoji: '🥩', done: dish.protein.length > 0,    weight: 5,  worth: 4   },
    { id: 'carb',         label: 'Kolhydrat',           emoji: '🍚', done: dish.carb.length > 0,       weight: 5,  worth: 3   },
    { id: 'cuisine',      label: 'Köksstil',            emoji: '🌍', done: CUISINE_FILLED(dish.cuisine), weight: 5,  worth: 3   },
    { id: 'type',         label: 'Maträttstyp',         emoji: '🍽️', done: dish.type.length > 0,       weight: 5,  worth: 3   },
    { id: 'tags',         label: 'Taggar',              emoji: '🏷️', done: dish.tags.length > 0,       weight: 5,  worth: 3   },
    { id: 'ingredients',  label: 'Ingredienser',        emoji: '🥕', done: dish.ingredients.length > 0,weight: 25, worth: 8   },
    { id: 'instructions', label: 'Instruktioner',       emoji: '📋', done: dish.instructions.length > 0,weight: 25, worth: 8   },
    { id: 'recipeUrl',    label: 'Källänk',             emoji: '🔗', done: !!dish.recipeUrl?.trim(),   weight: 5,  worth: 3   },
    { id: 'notes',        label: 'Egna noter',          emoji: '📝', done: !!dish.notes?.trim(),       weight: 5,  worth: 2   },
    { id: 'preferredMonths', label: 'Säsong (månader)', emoji: '🌱', done: (dish.preferredMonths ?? []).length > 0, weight: 5, worth: 4 },
  ]

  const totalWeight = fields.reduce((s, f) => s + f.weight, 0)
  const doneWeight = fields.filter(f => f.done).reduce((s, f) => s + f.weight, 0)
  const pct = Math.round((doneWeight / totalWeight) * 100)
  const stars = pctToStars(pct)
  const missingCount = fields.filter(f => !f.done).length
  const totalWorth = fields.filter(f => !f.done).reduce((s, f) => s + f.worth, 0)
  return { fields, pct, stars, missingCount, totalWorth }
}

export function pctToStars(pct: number): number {
  if (pct >= 100) return 5
  if (pct >= 80) return 4
  if (pct >= 60) return 3
  if (pct >= 40) return 2
  if (pct >= 20) return 1
  return 0
}

export function isFullyComplete(dish: Dish): boolean {
  return computeCompleteness(dish).pct >= 100
}
