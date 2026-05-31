import type { Ingredient, Dish, WeekPlan, UnitConversion } from '../types'
import { lookupIngredient } from '../data/ingredientLexicon'
import { toGrams } from './unitConversions'

export interface ImpactValue {
  costSEK: number
  co2eKg: number
  matched: boolean
}

/** Calibrated SEK/kg for a lexicon entry — user override wins over the default. */
type CostOverrides = Record<string, number>

/** Estimate cost and CO₂e for a single ingredient (already scaled to portions). */
export function ingredientImpact(
  ingredient: { name: string; amount: number; unit: string },
  conversions: UnitConversion[],
  overrides: CostOverrides = {},
): ImpactValue {
  const lex = lookupIngredient(ingredient.name)
  const grams = toGrams(ingredient.amount, ingredient.unit, ingredient.name, conversions)
  const matched = lex.name !== 'Okänd ingrediens' && grams != null
  if (grams == null) {
    return { costSEK: 0, co2eKg: 0, matched: false }
  }
  const kg = grams / 1000
  const costPerKg = overrides[lex.name] ?? lex.costPerKg
  return {
    costSEK: kg * costPerKg,
    co2eKg: kg * lex.co2ePerKg,
    matched,
  }
}

/** Sum a dish's per-portion impact (scaled from portionsBase). */
export function dishImpactPerPortion(
  dish: Dish,
  conversions: UnitConversion[],
  overrides: CostOverrides = {},
): ImpactValue {
  let costSEK = 0, co2eKg = 0, matched = false
  for (const ing of dish.ingredients) {
    const base = ing.portionsBase || 1
    const scaled: Ingredient = { ...ing, amount: ing.amount / base }
    const r = ingredientImpact(scaled, conversions, overrides)
    costSEK += r.costSEK
    co2eKg += r.co2eKg
    if (r.matched) matched = true
  }
  return { costSEK, co2eKg, matched }
}

/** Estimate a full week-plan's total cost and CO₂e (sum of meals × portions). */
export function weekPlanImpact(
  plan: WeekPlan,
  dishes: Dish[],
  conversions: UnitConversion[],
  overrides: CostOverrides = {},
): ImpactValue {
  let costSEK = 0, co2eKg = 0, matched = false
  for (const slot of plan.schedule) {
    for (const assignment of slot.assignments ?? []) {
      const meal = plan.meals.find(m => m.id === assignment.mealId)
      if (!meal) continue
      const totalPortions = assignment.portions || 0
      for (const comp of meal.components ?? []) {
        if (!comp.dishId) continue
        const dish = dishes.find(d => d.id === comp.dishId)
        if (!dish) continue
        const perPortion = dishImpactPerPortion(dish, conversions, overrides)
        const portionsForComponent = comp.portionsMode === 'own' ? (comp.portions || 0) : totalPortions
        costSEK += perPortion.costSEK * portionsForComponent
        co2eKg += perPortion.co2eKg * portionsForComponent
        if (perPortion.matched) matched = true
      }
    }
  }
  return { costSEK, co2eKg, matched }
}

/** Classify a per-portion CO₂e value into a grade. */
export type ClimateGrade = 'A' | 'B' | 'C' | 'D' | 'E'

export function climateGrade(co2ePerPortionKg: number): ClimateGrade {
  if (co2ePerPortionKg < 0.5) return 'A'
  if (co2ePerPortionKg < 1.0) return 'B'
  if (co2ePerPortionKg < 2.0) return 'C'
  if (co2ePerPortionKg < 4.0) return 'D'
  return 'E'
}

export const CLIMATE_COLORS: Record<ClimateGrade, string> = {
  A: '#22c55e',
  B: '#84cc16',
  C: '#eab308',
  D: '#f97316',
  E: '#ef4444',
}

export function formatSEK(amount: number): string {
  return `${Math.round(amount)} kr`
}

export function formatCO2e(kg: number): string {
  if (kg < 1) return `${Math.round(kg * 1000)} g`
  return `${kg.toFixed(1)} kg`
}
