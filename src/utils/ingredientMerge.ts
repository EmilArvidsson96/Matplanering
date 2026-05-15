import { v4 as uuid } from 'uuid'
import type { ShoppingItem, UnitConversion } from '../types'
import { toGrams, formatGrams } from './unitConversions'

// These adjectives don't change what you need to buy
const UNIMPORTANT_WORDS = new Set([
  'hackad', 'hackade', 'finhackad', 'finhackade', 'grovhackad', 'grovhackade',
  'riven', 'rivna', 'rivet',
  'skivad', 'skivade',
  'tärnad', 'tärnade',
  'krossad', 'krossade',
  'mald', 'malda', 'malen', 'malat',
  'pressad', 'pressade',
  'strimlad', 'strimlad',
  'kokt', 'kokta',
  'stekt', 'stekta',
  'rostad', 'rostade',
  'skalad', 'skalade',
  'blancherad', 'blancherade',
  'delad', 'delade',
  'mosad', 'mosade',
  'finriven', 'grovt', 'fint',
])

// These DO matter for what to buy – keep them as part of the identity key
const IMPORTANT_WORDS = new Set([
  'fryst', 'frysta', 'fryst',
  'färsk', 'färska', 'färskt',
  'rökt', 'rökta',
  'torkat', 'torkad', 'torkade',
  'konserverad', 'konserverade',
  'rå', 'råa', 'rått',
])

interface NormalizedName {
  text: string
  flagKey: string  // sorted important flags joined with ","
  fullKey: string  // text + "::" + flagKey
}

function normalizeName(name: string): NormalizedName {
  const words = name.toLowerCase().trim().split(/\s+/)
  const flags: string[] = []
  const kept: string[] = []
  for (const w of words) {
    if (IMPORTANT_WORDS.has(w)) flags.push(w)
    else if (!UNIMPORTANT_WORDS.has(w)) kept.push(w)
  }
  const text = kept.join(' ')
  const flagKey = [...flags].sort().join(',')
  return { text, flagKey, fullKey: `${text}::${flagKey}` }
}

function formatAmount(n: number): string {
  return n.toFixed(1).replace(/\.0$/, '')
}

function mergeGroup(items: ShoppingItem[], customConversions: UnitConversion[]): ShoppingItem[] {
  if (items.length === 1) return items

  const units = new Set(items.map(i => i.unit.toLowerCase()))

  if (units.size === 1) {
    const total = items.reduce((sum, item) => {
      const n = parseFloat(item.amount)
      return sum + (isNaN(n) ? 0 : n)
    }, 0)
    return [{ ...items[0], id: uuid(), amount: formatAmount(total) }]
  }

  // Try converting everything to grams
  let totalGrams = 0
  let allConverted = true
  for (const item of items) {
    const n = parseFloat(item.amount)
    if (isNaN(n)) { allConverted = false; break }
    const g = toGrams(n, item.unit, item.name, customConversions)
    if (g === null) { allConverted = false; break }
    totalGrams += g
  }

  if (allConverted) {
    const { amount, unit } = formatGrams(totalGrams)
    return [{ ...items[0], id: uuid(), amount, unit }]
  }

  // Fall back: group by unit and merge within each unit group
  const byUnit = new Map<string, ShoppingItem[]>()
  for (const item of items) {
    const k = item.unit.toLowerCase()
    if (!byUnit.has(k)) byUnit.set(k, [])
    byUnit.get(k)!.push(item)
  }
  const result: ShoppingItem[] = []
  for (const [, group] of byUnit) {
    result.push(...mergeGroup(group, customConversions))
  }
  return result
}

/** Merge shopping items that have identical names (case-insensitive). */
export function mergeExactDuplicates(
  items: ShoppingItem[],
  customConversions: UnitConversion[],
): ShoppingItem[] {
  const groups = new Map<string, ShoppingItem[]>()
  for (const item of items) {
    const key = item.name.toLowerCase()
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(item)
  }
  const result: ShoppingItem[] = []
  for (const [, group] of groups) {
    result.push(...mergeGroup(group, customConversions))
  }
  return result
}

export interface MergeSuggestion {
  key: string            // normalized fullKey – used to dismiss
  items: ShoppingItem[]  // 2+ items that could be merged
  suggestedName: string  // shortest/simplest name from the group
  suggestedAmount: string
  suggestedUnit: string
}

/** Find items with different names that normalize to the same thing (e.g. "lök" + "hackad lök"). */
export function computeMergeSuggestions(
  items: ShoppingItem[],
  dismissed: string[],
  customConversions: UnitConversion[],
): MergeSuggestion[] {
  const dismissedSet = new Set(dismissed)
  const groups = new Map<string, ShoppingItem[]>()

  for (const item of items) {
    const { text, fullKey } = normalizeName(item.name)
    if (!text) continue
    if (!groups.has(fullKey)) groups.set(fullKey, [])
    groups.get(fullKey)!.push(item)
  }

  const suggestions: MergeSuggestion[] = []

  for (const [fullKey, group] of groups) {
    if (dismissedSet.has(fullKey)) continue
    // Only suggest if there are multiple distinct names (exact duplicates already merged)
    const distinctNames = new Set(group.map(i => i.name.toLowerCase()))
    if (distinctNames.size <= 1) continue

    // Try to compute a merged amount
    let totalGrams = 0
    let allConverted = true
    for (const item of group) {
      const n = parseFloat(item.amount)
      if (isNaN(n)) { allConverted = false; break }
      const g = toGrams(n, item.unit, item.name, customConversions)
      if (g === null) { allConverted = false; break }
      totalGrams += g
    }

    const suggestedName = group.reduce((best, item) =>
      item.name.length < best.name.length ? item : best
    ).name

    let suggestedAmount = ''
    let suggestedUnit = ''
    if (allConverted) {
      const fmt = formatGrams(totalGrams)
      suggestedAmount = fmt.amount
      suggestedUnit = fmt.unit
    }

    suggestions.push({ key: fullKey, items: group, suggestedName, suggestedAmount, suggestedUnit })
  }

  return suggestions
}
