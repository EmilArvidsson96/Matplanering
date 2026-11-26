/**
 * Shopping categories, matched to ICA's article groups (the groups ICA's
 * shopping list and stores use), in roughly the order you walk a Maxi.
 *
 * How an ingredient gets its category (classifyIngredient):
 *  1. The household's own override (set when you change a category by hand).
 *  2. icaCategories.json: ICA's own classification of every ingredient in the
 *     library, looked up once via ICA's article search and checked by hand.
 *  3. Keyword rules below (longest matching word wins).
 */

import type { ShoppingCategory } from '../types'
import icaTable from './icaCategories.json'

export const CATEGORY_ORDER: ShoppingCategory[] = [
  'fruktgrönt', 'köttfågel', 'chark', 'fiskskaldjur', 'ost', 'mejeriägg', 'brödbageri',
  'skafferi', 'godissnacks', 'dryck', 'djupfryst', 'hushåll', 'övrigt',
]

export const CATEGORY_LABELS: Record<ShoppingCategory, string> = {
  fruktgrönt: 'Frukt & grönt',
  köttfågel: 'Kött & fågel',
  chark: 'Chark & färdigmat',
  fiskskaldjur: 'Fisk & skaldjur',
  ost: 'Ost',
  mejeriägg: 'Mejeri & ägg',
  brödbageri: 'Bröd & bageri',
  skafferi: 'Skafferi',
  godissnacks: 'Godis & snacks',
  dryck: 'Dryck',
  djupfryst: 'Djupfryst',
  hushåll: 'Hushåll & hygien',
  övrigt: 'Övrigt',
}

const VALID = new Set<string>(CATEGORY_ORDER)
export const isShoppingCategory = (c: unknown): c is ShoppingCategory => typeof c === 'string' && VALID.has(c)

/** Categories used before the switch to ICA's groups. */
const LEGACY: Record<string, ShoppingCategory> = {
  grönsaker: 'fruktgrönt', frukt: 'fruktgrönt', mejeri: 'mejeriägg', kött: 'köttfågel',
  fisk: 'fiskskaldjur', bröd: 'brödbageri', torrvaror: 'skafferi', konserver: 'skafferi',
  kryddor: 'skafferi', frys: 'djupfryst', övrigt: 'övrigt',
}

// ── Lookup key ──────────────────────────────────────────────────────────────

const PREP_NOTE = /\b(tärn|hack|skiva|skivad|pressad|strimla|skala|bitar|klyftor|rumsvarm|mjuk|smält|delad|finhack|grovhack|i små|till |kan uteslutas|valfri|gärna)/

/** Lowercase name without amounts, parentheses and preparation notes. */
export function categoryKey(name: string): string {
  const [head, ...rest] = name.toLowerCase().replace(/\(.*?\)/g, ' ').split(',')
  const qualifiers = rest.map(p => p.trim()).filter(p => p && !PREP_NOTE.test(p))
  return [head.split('/')[0], ...qualifiers].join(' ')
    .replace(/^\s*(ev|ca|cirka|ungefär|pkt|frp|port)\.?\s+/, '')
    .replace(/^\s*[\d.,/-]+\s*(g|kg|ml|cl|dl|l|st|msk|tsk|krm|port)?\s+/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// ── ICA table ───────────────────────────────────────────────────────────────

type Entry = [ShoppingCategory, string]
const ICA = icaTable as unknown as Record<string, Entry>
const ICA_KEYS = Object.keys(ICA).filter(k => k.length >= 3).sort((a, b) => b.length - a.length)

function escapeRe(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }
const ICA_RES = ICA_KEYS.map(k => [k, new RegExp(`(^|\\s)${escapeRe(k)}(\\s|$)`)] as const)

/** ICA's entry for this key: exact, else the longest table key contained as whole words. */
function icaEntry(key: string): Entry | null {
  if (ICA[key]) return ICA[key]
  for (const [k, re] of ICA_RES) if (re.test(key)) return ICA[k]
  return null
}

// ── Keyword rules ───────────────────────────────────────────────────────────

const RULES: Array<[ShoppingCategory, string[]]> = [
  ['djupfryst', ['fryst', 'frysta', 'djupfryst', 'glass', 'frysärt']],
  ['chark', ['bacon', 'skinka', 'prosciutto', 'pancetta', 'salami', 'korv', 'falukorv', 'chorizo', 'kabanoss', 'leverpastej', 'pålägg', 'hummus', 'tofu', 'halloumi-burgare', 'färdigmat', 'pizzadeg', 'dressing']],
  ['köttfågel', ['kyckling', 'kycklingfilé', 'kycklinglår', 'nötfärs', 'köttfärs', 'blandfärs', 'fläskfärs', 'färs', 'fläsk', 'fläskfilé', 'karré', 'biff', 'entrecôte', 'ryggbiff', 'oxfilé', 'kotlett', 'lamm', 'lammfilé', 'kalv', 'vilt', 'älg', 'hjort', 'högrev', 'kött', 'stek']],
  ['fiskskaldjur', ['lax', 'torsk', 'kolja', 'fisk', 'räkor', 'räka', 'skaldjur', 'sill', 'strömming', 'hummer', 'krabba', 'bläckfisk', 'musslor', 'pilgrimsmussla', 'makrill', 'rom', 'rödspätta', 'sej', 'gös', 'abborre']],
  ['ost', ['ost', 'cheddar', 'parmesan', 'mozzarella', 'fetaost', 'feta', 'brie', 'camembert', 'halloumi', 'ricotta', 'mascarpone', 'gorgonzola', 'pecorino', 'burrata', 'grana padano', 'västerbotten']],
  ['mejeriägg', ['mjölk', 'grädde', 'vispgrädde', 'matlagningsgrädde', 'smör', 'yoghurt', 'crème fraîche', 'creme fraiche', 'crème fraiche', 'créme fraiche', 'kvarg', 'ägg', 'äggula', 'filmjölk', 'keso', 'gräddfil', 'smetana', 'färskost', 'jäst', 'havredryck', 'margarin']],
  ['brödbageri', ['bröd', 'baguette', 'ciabatta', 'bagel', 'naanbröd', 'pitabröd', 'knäckebröd', 'fralla', 'frallor', 'bulle', 'bullar', 'kaka', 'kakor', 'hamburgerbröd', 'tunnbröd', 'focaccia', 'brioche']],
  ['fruktgrönt', ['lök', 'gul lök', 'rödlök', 'schalottenlök', 'purjolök', 'salladslök', 'vitlök', 'morot', 'morötter', 'tomat', 'tomater', 'körsbärstomat', 'paprika', 'broccoli', 'blomkål', 'spenat', 'sallad', 'gurka', 'zucchini', 'aubergine', 'selleri', 'rotselleri', 'fänkål', 'kål', 'vitkål', 'rödkål', 'grönkål', 'spetskål', 'sockerärtor', 'haricots verts', 'champinjon', 'champinjoner', 'svamp', 'kantarell', 'potatis', 'sötpotatis', 'palsternacka', 'rödbeta', 'rädisa', 'avokado', 'sparris', 'ingefära', 'chili', 'jalapeño', 'jalapeno', 'citron', 'lime', 'apelsin', 'äpple', 'äpplen', 'päron', 'banan', 'mango', 'ananas', 'vindruvor', 'jordgubb', 'hallon', 'blåbär', 'melon', 'granatäpple', 'persilja', 'koriander', 'dill', 'basilika', 'gräslök', 'mynta', 'timjan', 'rosmarin', 'pak choi', 'ruccola', 'rucola', 'majskolv', 'böngroddar']],
  ['skafferi', ['pasta', 'spaghetti', 'penne', 'makaroner', 'lasagneplattor', 'nudlar', 'ris', 'jasminris', 'basmatiris', 'risotto', 'couscous', 'quinoa', 'bulgur', 'mjöl', 'vetemjöl', 'socker', 'sirap', 'honung', 'havregryn', 'müsli', 'flingor', 'linser', 'kikärtor', 'bönor', 'svarta bönor', 'kidneybönor', 'krossade tomater', 'passerade tomater', 'tomatpuré', 'kokosmjölk', 'buljong', 'buljongtärning', 'fond', 'olja', 'olivolja', 'rapsolja', 'sesamolja', 'vinäger', 'ättika', 'ättiksprit', 'soja', 'sojasås', 'fisksås', 'ostronsås', 'sweet chili', 'sriracha', 'tabasco', 'worcester', 'senap', 'ketchup', 'majonnäs', 'majonäs', 'sås', 'pesto', 'oliver', 'kapris', 'currypasta', 'curry', 'salt', 'peppar', 'svartpeppar', 'kanel', 'kardemumma', 'spiskummin', 'paprikapulver', 'oregano', 'krydda', 'kryddor', 'vanilj', 'vaniljsocker', 'bakpulver', 'bikarbonat', 'kakao', 'mandel', 'mandlar', 'nötter', 'cashew', 'sesamfrön', 'frön', 'tortilla', 'tacoskal', 'tacokrydda', 'panko', 'ströbröd', 'konserv', 'burk', 'stärkelse', 'saffran', 'lagerblad', 'muskot', 'gurkmeja']],
  ['godissnacks', ['choklad', 'chips', 'godis', 'popcorn', 'jordnötter', 'snacks', 'pretzels', 'kex', 'marshmallow', 'lakrits']],
  ['dryck', ['vin', 'rödvin', 'vitt vin', 'cider', 'läsk', 'juice', 'saft', 'kaffe', 'cava', 'prosecco', 'sprit', 'vodka', 'whisky', 'calvados', 'madeira', 'mineralvatten']],
  ['hushåll', ['toalettpapper', 'hushållspapper', 'diskmedel', 'tvättmedel', 'folie', 'bakplåtspapper', 'plastpåse', 'fryspåse', 'servetter', 'tandkräm', 'schampo', 'tvål', 'blöjor', 'batterier']],
]

const RULE_RES = RULES.flatMap(([cat, words]) =>
  words.map(w => [cat, w.length, new RegExp(`(^|[\\s-])${escapeRe(w.trim())}`)] as const))

/** Longest keyword found at a word start ("buljongtärning" beats "kyckling" in "kycklingbuljongtärning" only by length). */
function ruleCategory(key: string): ShoppingCategory | null {
  // Frozen wins over everything: "kycklinginnerfilé fryst", "frysta ärtor".
  if (/\bfryst|\bfrysta\b|\bdjupfryst/.test(key)) return 'djupfryst'
  let best: ShoppingCategory | null = null
  let bestLen = 0
  for (const [cat, len, re] of RULE_RES) {
    if (len > bestLen && re.test(key)) { best = cat; bestLen = len }
  }
  // Compound words ("kycklingbuljongtärning", "vitlökspulver"): the last part decides.
  for (const [cat, words] of RULES) {
    for (const w of words) {
      if (w.length >= 4 && w.length > bestLen && key.endsWith(w) && !key.endsWith(' ' + w) && key !== w) {
        best = cat; bestLen = w.length
      }
    }
  }
  return best
}

// ── Public API ──────────────────────────────────────────────────────────────

export interface Classification {
  category: ShoppingCategory
  /** ICA's sub-department (e.g. "Pasta & pastasås"), used to sort within Skafferi. */
  sub?: string
  source: 'override' | 'ica' | 'rule'
}

/** Best category for an ingredient name, or null when nothing is known about it. */
export function classifyIngredient(
  name: string,
  overrides?: Record<string, ShoppingCategory>,
): Classification | null {
  const key = categoryKey(name)
  if (!key) return null
  const own = overrides?.[key]
  if (own && isShoppingCategory(own)) return { category: own, sub: icaEntry(key)?.[1], source: 'override' }
  const ica = icaEntry(key)
  if (ica) return { category: ica[0], sub: ica[1], source: 'ica' }
  const rule = ruleCategory(key)
  return rule ? { category: rule, source: 'rule' } : null
}

/** Category for a name, falling back to `fallback` (or Övrigt). */
export function categoryFor(name: string, fallback?: string, overrides?: Record<string, ShoppingCategory>): ShoppingCategory {
  const found = classifyIngredient(name, overrides)?.category
  if (found) return found
  if (!fallback) return 'övrigt'
  return isShoppingCategory(fallback) ? fallback : LEGACY[fallback] ?? 'övrigt'
}

/**
 * Category for stored data: values from the old category set (and Övrigt) are
 * re-classified; values already in the new set are kept, since they may be the
 * household's own choice.
 */
export function migrateCategory(category: string, name: string): ShoppingCategory {
  if (isShoppingCategory(category) && category !== 'övrigt') return category
  return classifyIngredient(name)?.category ?? LEGACY[category] ?? 'övrigt'
}

/** ICA sub-department for sorting rows inside a category ('' when unknown). */
export function subFor(name: string): string {
  return icaEntry(categoryKey(name))?.[1] ?? ''
}
