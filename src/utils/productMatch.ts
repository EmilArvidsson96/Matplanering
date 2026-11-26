/** Helpers for turning shopping-list rows into store products. */

import type { ProductPreference } from '../types'
import seed from '../data/mathemSeed.json'

/**
 * Stable key for an ingredient across recipes: lowercase, without
 * preparation notes ("fast potatis, i små tärningar" → "fast potatis"),
 * parentheses or leading approximate amounts ("ca 100 g rotselleri").
 */
const PREP_NOTE = /\b(tärn|hack|skiva|skivad|pressad|riven|rivna|strimla|skala|skalad|bitar|klyftor|rumsvarm|mjuk|smält|kokt|delad|finhack|grovhack|i små|till |kan uteslutas|valfri|gärna|eller)/

export function ingredientKey(name: string): string {
  const [head, ...rest] = name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0301]/g, '').normalize('NFC')   // filé → file, keep å/ä/ö
    .replace(/\(.*?\)/g, ' ')
    .split(',')
  // Keep qualifiers after a comma ("riven ost, texmex"), drop preparation notes.
  const qualifiers = rest.map(p => p.trim()).filter(p => p && !PREP_NOTE.test(p))
  return [head.split('/')[0], ...qualifiers].join(' ')
    .replace(/^\s*(ca|cirka|ungefär)?\s*[\d.,/]+\s*(g|kg|ml|cl|dl|l|st|msk|tsk|krm)?\s+/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** A search query for the store: the key, minus words that hurt search. */
export function searchQuery(name: string): string {
  return ingredientKey(name)
    .replace(/\b(hackad|hackade|tärnad|tärnade|skivad|skivade|pressad|mjukt|stor|små)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim() || name
}

/** Rows that are not something you buy (leftover text from recipe imports, water). */
export function isNotAProduct(name: string, amount: string, unit: string): boolean {
  const n = name.trim().toLowerCase()
  if (/^(kall |varmt |kokande )?(vatten|kranvatten)$/.test(n)) return true
  if (n.split(/\s+/).length > 7) return true          // a sentence, not an ingredient
  if (/\btillagad|\btillagat|\brester\b/.test(n)) return true
  return !amount && !unit && /^(av|till|och|med)\b/.test(n)
}

const SEED: Record<string, ProductPreference> = Object.fromEntries(
  seed.choices.map(c => [ingredientKey(c.ingredient), {
    store: 'mathem' as const,
    productId: c.productId,
    name: c.name,
    packSize: c.packSize,
    chosenAt: seed.chosenAt,
    timesChosen: 1,
  }]),
)

/**
 * The household's earlier choice for this ingredient: exact key first, then
 * the longest stored key contained in this name (so "fast potatis" covers
 * "fast potatis, i små tärningar"). Learned preferences win over the seed.
 */
export function findPreference(
  name: string,
  learned: Record<string, ProductPreference> | undefined,
): ProductPreference | null {
  const key = ingredientKey(name)
  for (const source of [learned ?? {}, SEED]) {
    if (source[key]) return source[key]
    const contained = Object.keys(source)
      .filter(k => k.length >= 3 && new RegExp(`(^|\\s)${escapeRe(k)}(\\s|$)`).test(key))
      .sort((a, b) => b.length - a.length)[0]
    if (contained) return source[contained]
  }
  return null
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ── Quantity estimation ────────────────────────────────────────────────────

const TO_BASE: Record<string, [number, 'mass' | 'vol' | 'count']> = {
  g: [1, 'mass'], kg: [1000, 'mass'],
  ml: [1, 'vol'], cl: [10, 'vol'], dl: [100, 'vol'], l: [1000, 'vol'],
  msk: [15, 'vol'], tsk: [5, 'vol'], krm: [1, 'vol'],
  st: [1, 'count'], 'p': [1, 'count'],
}

function parseAmount(n: string): number {
  return Number(n.replace(',', '.'))
}

/** Pack size from Mathem's name_extra ("Sverige, 900 g", "3x28g", "1,5 l", "12 st"). */
export function parsePack(packSize: string): { qty: number; kind: 'mass' | 'vol' | 'count' } | null {
  const multi = packSize.match(/(\d+)\s*x\s*(\d+(?:[.,]\d+)?)\s*(kg|g|l|dl|cl|ml)\b/i)
  if (multi) {
    const [f, kind] = TO_BASE[multi[3].toLowerCase()]
    return { qty: Number(multi[1]) * parseAmount(multi[2]) * f, kind }
  }
  const all = [...packSize.matchAll(/(\d+(?:[.,]\d+)?)\s*(kg|g|l|dl|cl|ml|st)\b/gi)]
  const m = all[all.length - 1]
  if (!m) return null
  const [f, kind] = TO_BASE[m[2].toLowerCase()]
  return { qty: parseAmount(m[1]) * f, kind }
}

/**
 * How many packs cover the needed amount, or null when the units can't be
 * compared (e.g. "4.8 st" onions vs a "1000 g" bag). Mass and volume are
 * treated as interchangeable (density ≈ 1), which is close enough for dairy,
 * sauces and the like. Spoon-sized needs always round to one pack.
 */
export function estimatePacks(amount: string, unit: string, packSize: string): number | null {
  const need = parseAmount(amount)
  const u = TO_BASE[unit.trim().toLowerCase()]
  const pack = parsePack(packSize)
  if (!u || !pack || !need || need <= 0 || pack.qty <= 0) return null
  const [f, kind] = u
  const sameFamily = kind === pack.kind || (kind !== 'count' && pack.kind !== 'count')
  if (!sameFamily) return null
  return Math.max(1, Math.ceil((need * f) / pack.qty - 0.1))
}

/** An amount in base units (g, ml or st), or null when the unit is unknown. */
export function toBase(amount: string, unit: string): { qty: number; kind: 'mass' | 'vol' | 'count' } | null {
  const n = parseAmount(amount)
  const u = TO_BASE[unit.trim().toLowerCase()]
  if (!u || !n || n <= 0) return null
  return { qty: n * u[0], kind: u[1] }
}

/** How many times bigger the pack is than the need (null when not comparable). */
export function packOverNeed(amount: string, unit: string, packSize: string): number | null {
  const need = toBase(amount, unit)
  const pack = parsePack(packSize)
  if (!need || !pack) return null
  const comparable = need.kind === pack.kind || (need.kind !== 'count' && pack.kind !== 'count')
  return comparable ? pack.qty / need.qty : null
}
