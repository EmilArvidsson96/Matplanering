/** The household's main rules applied to store products (Mathem, ICA), without AI. */
import type { ShoppingCategory, ShoppingRules } from '../types'
import { ingredientKey } from './productMatch'

const DAIRY = /\b(grädde|vispgrädde|matlagningsgrädde|mjölk|mellanmjölk|smör|ost|riven ost|yoghurt|crème fraiche|creme fraiche|kvarg|gräddfil|filmjölk|keso|mascarpone|halloumi|fetaost|färskost|cream cheese|kesella)\b/
const GRAIN = /\b(pasta|spaghetti|penne|makaroner|lasagneplattor|nudlar|mjöl|vetemjöl|ris|basmatiris|jasminris|havregryn|gryn|bröd|tortilla|bulgur|couscous|quinoa|matvete|flingor|müsli|granola)\b/

export interface AppliedRules {
  lactose: boolean   // must be lactose-free
  organic: boolean   // must be organic
  swedish: boolean   // prefer Swedish
}

function organicWords(text: string): string[] {
  return text.toLowerCase()
    .split(/[\s,()./]+/)
    .filter(w => w.length >= 4 && !['och', 'samt', 'till', 'exempel', 'produkter'].includes(w))
}

export function rulesFor(name: string, category: ShoppingCategory, rules: ShoppingRules | undefined): AppliedRules {
  const key = ingredientKey(name)
  const words = organicWords(rules?.organicFor ?? '')
  const grainRule = words.some(w => w.startsWith('spannmål'))
  return {
    lactose: !!rules?.lactoseFree && (category === 'mejeriägg' || DAIRY.test(key)),
    // A word matches at the end of a word: "mjöl" covers "vetemjöl" but not "mjölk".
    organic: (grainRule && GRAIN.test(key))
      || words.some(w => !w.startsWith('spannmål') && new RegExp(`${w.replace(/(er|or|ar)$/, '')}(er|or|ar)?(\\s|$)`).test(key)),
    swedish: !!rules?.preferSwedish,
  }
}

/** Extra searches that find rule-compliant products Mathem's ranking tends to miss. */
export function ruleQueries(query: string, r: AppliedRules): string[] {
  return [
    query,
    r.lactose && !/laktosfri/.test(query) ? `laktosfri ${query}` : '',
    r.organic && !/\beko/.test(query) ? `eko ${query}` : '',
  ].filter(Boolean)
}

/** Mathem and ICA products both have these. */
export interface RuleProduct { name: string; packSize: string; tags: string[] }

const text = (p: RuleProduct) => `${p.name} ${p.packSize} ${p.tags.join(' ')}`
export const isLactoseFree = (p: RuleProduct) => /laktosfri|lactose.?free/i.test(text(p))
export const isOrganic = (p: RuleProduct) => /ekologisk|\beko\b|organic|krav/i.test(text(p))
export const isSwedish = (p: RuleProduct) => /sverige|svensk|från sverige/i.test(text(p))

export function passesRules(p: RuleProduct, r: AppliedRules): boolean {
  return (!r.lactose || isLactoseFree(p)) && (!r.organic || isOrganic(p))
}

/** Rule-compliant first, then Swedish (if wanted), then Mathem's own order. */
export function rankCandidates<T extends RuleProduct>(list: T[], r: AppliedRules): T[] {
  return list
    .map((p, i) => ({ p, i, s: (passesRules(p, r) ? 2 : 0) + (r.swedish && isSwedish(p) ? 1 : 0) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map(x => x.p)
}

/** What a candidate misses, for the note on the row ("inte laktosfri"). */
export function ruleMiss(p: RuleProduct, r: AppliedRules): string | undefined {
  const miss = [r.lactose && !isLactoseFree(p) && 'laktosfri', r.organic && !isOrganic(p) && 'ekologisk'].filter(Boolean)
  return miss.length ? `Hittade ingen ${miss.join(' och ')} variant` : undefined
}
