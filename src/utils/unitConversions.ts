import type { UnitConversion } from '../types'

export const DEFAULT_CONVERSIONS: UnitConversion[] = [
  // Weight (identity conversions)
  { id: 'g',   fromUnit: 'g',   toGrams: 1 },
  { id: 'kg',  fromUnit: 'kg',  toGrams: 1000 },
  { id: 'hg',  fromUnit: 'hg',  toGrams: 100 },

  // Volume – generic (water/liquid baseline)
  { id: 'ml',  fromUnit: 'ml',  toGrams: 1 },
  { id: 'cl',  fromUnit: 'cl',  toGrams: 10 },
  { id: 'dl',  fromUnit: 'dl',  toGrams: 100 },
  { id: 'l',   fromUnit: 'l',   toGrams: 1000 },
  { id: 'msk', fromUnit: 'msk', toGrams: 15 },
  { id: 'tsk', fromUnit: 'tsk', toGrams: 5 },
  { id: 'krm', fromUnit: 'krm', toGrams: 1 },

  // Ingredient-specific dl conversions
  { id: 'dl-mjöl',        fromUnit: 'dl', ingredientHint: 'mjöl',        toGrams: 60 },
  { id: 'dl-socker',      fromUnit: 'dl', ingredientHint: 'socker',      toGrams: 85 },
  { id: 'dl-florsocker',  fromUnit: 'dl', ingredientHint: 'florsocker',  toGrams: 65 },
  { id: 'dl-ris',         fromUnit: 'dl', ingredientHint: 'ris',         toGrams: 85 },
  { id: 'dl-havregryn',   fromUnit: 'dl', ingredientHint: 'havregryn',   toGrams: 40 },
  { id: 'dl-pasta',       fromUnit: 'dl', ingredientHint: 'pasta',       toGrams: 65 },
  { id: 'dl-grädde',      fromUnit: 'dl', ingredientHint: 'grädde',      toGrams: 100 },
  { id: 'dl-mjölk',       fromUnit: 'dl', ingredientHint: 'mjölk',       toGrams: 103 },
  { id: 'dl-yoghurt',     fromUnit: 'dl', ingredientHint: 'yoghurt',     toGrams: 100 },
  { id: 'dl-filmjölk',    fromUnit: 'dl', ingredientHint: 'filmjölk',    toGrams: 103 },
  { id: 'dl-olja',        fromUnit: 'dl', ingredientHint: 'olja',        toGrams: 92 },
  { id: 'dl-honung',      fromUnit: 'dl', ingredientHint: 'honung',      toGrams: 140 },
  { id: 'dl-kvarg',       fromUnit: 'dl', ingredientHint: 'kvarg',       toGrams: 100 },
  { id: 'dl-crème-fraiche', fromUnit: 'dl', ingredientHint: 'crème fraiche', toGrams: 100 },

  // Piece-based conversions
  { id: 'st-lök',         fromUnit: 'st',     ingredientHint: 'lök',       toGrams: 150 },
  { id: 'klyfta-vitlök',  fromUnit: 'klyfta', ingredientHint: 'vitlök',    toGrams: 5 },
  { id: 'st-vitlök',      fromUnit: 'st',     ingredientHint: 'vitlök',    toGrams: 40 },
  { id: 'st-ägg',         fromUnit: 'st',     ingredientHint: 'ägg',       toGrams: 60 },
  { id: 'st-potatis',     fromUnit: 'st',     ingredientHint: 'potatis',   toGrams: 150 },
  { id: 'st-tomat',       fromUnit: 'st',     ingredientHint: 'tomat',     toGrams: 100 },
  { id: 'st-paprika',     fromUnit: 'st',     ingredientHint: 'paprika',   toGrams: 150 },
  { id: 'st-morot',       fromUnit: 'st',     ingredientHint: 'morot',     toGrams: 80 },
  { id: 'st-banan',       fromUnit: 'st',     ingredientHint: 'banan',     toGrams: 120 },
  { id: 'st-äpple',       fromUnit: 'st',     ingredientHint: 'äpple',     toGrams: 150 },
  { id: 'st-citron',      fromUnit: 'st',     ingredientHint: 'citron',    toGrams: 100 },
  { id: 'st-lime',        fromUnit: 'st',     ingredientHint: 'lime',      toGrams: 70 },
  { id: 'st-avokado',     fromUnit: 'st',     ingredientHint: 'avokado',   toGrams: 200 },
  { id: 'st-zucchini',    fromUnit: 'st',     ingredientHint: 'zucchini',  toGrams: 300 },
  { id: 'st-gurka',       fromUnit: 'st',     ingredientHint: 'gurka',     toGrams: 300 },
  { id: 'burk-bönor',     fromUnit: 'burk',   ingredientHint: 'bönor',     toGrams: 400 },
  { id: 'burk-tomater',   fromUnit: 'burk',   ingredientHint: 'tomater',   toGrams: 400 },
  { id: 'burk-kokosmjölk',fromUnit: 'burk',   ingredientHint: 'kokosmjölk',toGrams: 400 },
  { id: 'förp-bacon',     fromUnit: 'förp',   ingredientHint: 'bacon',     toGrams: 150 },
]

/** Returns grams for the given amount+unit, optionally matched to an ingredient name.
 *  Returns null if no conversion is found. */
export function toGrams(
  amount: number,
  unit: string,
  ingredientName: string,
  customConversions: UnitConversion[],
): number | null {
  const unitLower = unit.toLowerCase().trim()
  const nameLower = ingredientName.toLowerCase().trim()

  // Custom overrides are checked first, then defaults
  const all = [...customConversions, ...DEFAULT_CONVERSIONS]

  // Ingredient-specific conversions take priority
  for (const conv of all) {
    if (
      conv.fromUnit.toLowerCase() === unitLower &&
      conv.ingredientHint &&
      nameLower.includes(conv.ingredientHint.toLowerCase())
    ) {
      return amount * conv.toGrams
    }
  }

  // Generic fallback (no ingredientHint)
  for (const conv of all) {
    if (conv.fromUnit.toLowerCase() === unitLower && !conv.ingredientHint) {
      return amount * conv.toGrams
    }
  }

  return null
}

export function formatGrams(grams: number): { amount: string; unit: string } {
  if (grams >= 1000) {
    const kg = grams / 1000
    const str = kg % 1 === 0 ? String(kg) : kg.toFixed(1)
    return { amount: str, unit: 'kg' }
  }
  if (grams >= 10) {
    return { amount: String(Math.round(grams)), unit: 'g' }
  }
  return { amount: grams.toFixed(1).replace(/\.0$/, ''), unit: 'g' }
}
