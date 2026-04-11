import { v4 as uuid } from 'uuid'
import type { Ingredient, RecipeStep, ShoppingCategory } from '../types'

// ── Whitelist ─────────────────────────────────────────────────────────────────
// Only these hostnames are allowed. Add more as needed.

export const ALLOWED_HOSTS: string[] = [
  // Swedish sites (custom parsers)
  'www.landleyskok.se',
  'landleyskok.se',
  'zeinaskitchen.se',
  'www.mykitchenstories.se',
  'mykitchenstories.se',
  'vivavinomat.se',
  'www.vivavinomat.se',
  // Sites with schema.org/Recipe JSON-LD
  'www.ica.se',
  'ica.se',
  'mykoreankitchen.com',
  'www.mykoreankitchen.com',
  'www.coop.se',
  'coop.se',
  'www.arla.se',
  'arla.se',
  'www.tasteline.com',
  'tasteline.com',
  'www.recept.nu',
  'recept.nu',
  'www.koket.se',
  'koket.se',
  'www.allrecipes.se',
  'allrecipes.se',
  'www.allrecipes.com',
  'allrecipes.com',
  'www.bbcgoodfood.com',
  'bbcgoodfood.com',
  'www.food.com',
  'food.com',
]

const CORS_PROXY = 'https://corsproxy.io/?url='

function proxiedUrl(url: string): string {
  return CORS_PROXY + encodeURIComponent(url)
}

// ── Fraction / amount parsing ─────────────────────────────────────────────────

const UNICODE_FRACTIONS: Record<string, string> = {
  '½': '0.5', '¼': '0.25', '¾': '0.75',
  '⅓': '0.333', '⅔': '0.667', '⅛': '0.125', '⅜': '0.375',
}

function normalizeAmount(s: string): number {
  let t = s.trim()
  for (const [ch, val] of Object.entries(UNICODE_FRACTIONS)) t = t.replace(ch, val)
  t = t.replace(',', '.')

  // "1 1/2" mixed number
  const mixed = t.match(/^(\d+)\s+(\d+)\/(\d+)$/)
  if (mixed) return parseInt(mixed[1]) + parseInt(mixed[2]) / parseInt(mixed[3])

  // "1/2" fraction
  const frac = t.match(/^(\d+)\/(\d+)$/)
  if (frac) return parseInt(frac[1]) / parseInt(frac[2])

  return parseFloat(t) || 0
}

// ── Unit list ─────────────────────────────────────────────────────────────────

const UNITS = [
  'kilogram', 'kg', 'hektogram', 'hg', 'gram', 'g', 'mg',
  'liter', 'l', 'deciliter', 'dl', 'centiliter', 'cl', 'milliliter', 'ml',
  'matsked', 'msk', 'tesked', 'tsk', 'kryddmått', 'krm',
  'styck', 'stycken', 'st',
  'förpackning', 'förpackningar', 'förp',
  'burk', 'burkar',
  'påse', 'påsar',
  'knippe', 'knippen',
  'klyfta', 'klyftor',
  'skiva', 'skivor',
  'blad',
  'kvist', 'kvistar',
  'näve', 'nävar',
  'cm', 'mm',
]

// Longest first so "deciliter" matches before "liter"
const UNIT_PATTERN = new RegExp(
  `^(${[...UNITS].sort((a, b) => b.length - a.length).join('|')})\\b`,
  'i',
)

// ── Ingredient string parser ──────────────────────────────────────────────────

function parseIngredientString(raw: string): { amount: number; unit: string; name: string } {
  let s = raw.trim()

  // Replace unicode fractions inline
  for (const [ch, val] of Object.entries(UNICODE_FRACTIONS)) s = s.replace(new RegExp(ch, 'g'), val)

  // Amount pattern: "1 1/2", "1/2", "1.5", "2"
  const amountRe = /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+[.,]\d+|\d+)/
  const amountMatch = s.match(amountRe)

  if (!amountMatch) {
    return { amount: 0, unit: 'st', name: s }
  }

  const amount = normalizeAmount(amountMatch[1])
  let rest = s.slice(amountMatch[1].length).trim()

  const unitMatch = rest.match(UNIT_PATTERN)
  let unit = 'st'
  if (unitMatch) {
    unit = unitMatch[1].toLowerCase()
    rest = rest.slice(unitMatch[0].length).trim()
  }

  // Strip leading punctuation/dash
  const name = rest.replace(/^[-–,]\s*/, '').trim()

  return { amount, unit, name: name || raw }
}

// ── Category detection ────────────────────────────────────────────────────────

const CATEGORY_MAP: Array<{ cat: ShoppingCategory; words: string[] }> = [
  { cat: 'kött', words: ['kyckling', 'kycklingfilé', 'kycklinglår', 'kycklingben', 'nötfärs', 'köttfärs', 'fläsk', 'bacon', 'skinka', 'prosciutto', 'pancetta', 'salami', 'biff', 'entrecôte', 'kotlett', 'karré', 'lammfilé', 'lamm', 'korv', 'falukorv', 'vilt', 'älg', 'hjort', 'kalv', 'oxfilé', 'fläskfilé'] },
  { cat: 'fisk', words: ['lax', 'torsk', 'kolja', 'fisk', 'räkor', 'skaldjur', 'tonfisk', 'sill', 'strömming', 'hummer', 'krabba', 'bläckfisk', 'musslor', 'pilgrimsmussla', 'sardiner', 'ansjovis', 'makrill'] },
  { cat: 'mejeri', words: ['mjölk', 'grädde', 'vispgrädde', 'matlagningsgrädde', 'smör', 'ost', 'cheddar', 'parmesan', 'mozzarella', 'fetaost', 'brie', 'camembert', 'yoghurt', 'crème fraîche', 'creme fraiche', 'créme fraiche', 'kvarg', 'ricotta', 'mascarpone', 'ägg', 'fil', 'filmjölk', 'keso', 'gräddfil'] },
  { cat: 'grönsaker', words: ['lök', 'gul lök', 'rödlök', 'schalottenlök', 'purjolök', 'salladslök', 'vitlök', 'morot', 'tomat', 'körsbärstomat', 'paprika', 'broccoli', 'blomkål', 'spenat', 'sallad', 'romansallad', 'gurka', 'zucchini', 'aubergine', 'selleri', 'rotselleri', 'fänkål', 'kål', 'vitkål', 'rödkål', 'savoykål', 'grönkål', 'majs', 'ärtor', 'sockerärtor', 'haricots verts', 'bönor', 'champinjoner', 'svamp', 'kantarell', 'shiitake', 'potatis', 'sötpotatis', 'palsternacka', 'rödbeta', 'rädisa', 'avokado', 'sparris', 'kronärtskocka', 'kålrabbi', 'ingefära', 'chili', 'jalapeño'] },
  { cat: 'frukt', words: ['citron', 'lime', 'apelsin', 'grapefrukt', 'äpple', 'päron', 'banan', 'mango', 'ananas', 'vindruvor', 'jordgubb', 'hallon', 'blåbär', 'björnbär', 'körsbär', 'persika', 'nektarin', 'plommon', 'melon', 'vattenmelon', 'papaya', 'passionsfrukt', 'fikon', 'dadel'] },
  { cat: 'torrvaror', words: ['pasta', 'spaghetti', 'penne', 'rigatoni', 'tagliatelle', 'lasagneplattor', 'ris', 'basmatiris', 'jasminris', 'arborio', 'mjöl', 'vetemjöl', 'rismjöl', 'potatismjöl', 'socker', 'strösocker', 'farinsocker', 'florsocker', 'havregryn', 'nudlar', 'glasnudlar', 'risnudlar', 'udon', 'couscous', 'quinoa', 'bulgur', 'linser', 'röda linser', 'kikärtor', 'svarta bönor', 'kidneybönor', 'cornflakes', 'müsli', 'mandel', 'valnöt', 'cashew', 'jordnötter', 'solrosfrön', 'pumpafrön', 'sesamfrön', 'jäst'] },
  { cat: 'konserver', words: ['krossade tomater', 'passerade tomater', 'tomatpuré', 'kokosmjölk', 'kokosgrädde', 'konserverade', 'kapris', 'oliver', 'sojasås', 'fisksås', 'ostronsås', 'sweet chili', 'tabasco', 'worcestershire', 'sambal', 'tahini', 'hummus', 'röd currypasta', 'grön currypasta', 'misopasta', 'hoisin', 'teriyaki', 'bbq-sås', 'senap', 'ketchup', 'majonnäs', 'aioli', 'balsamvinäger', 'vitvinsvinäger', 'rödvinsvinäger', 'sushivinäger'] },
  { cat: 'kryddor', words: ['salt', 'peppar', 'svartpeppar', 'vitpeppar', 'oregano', 'basilika', 'timjan', 'rosmarin', 'spiskummin', 'koriander', 'curry', 'paprikapulver', 'rökt paprika', 'chilipulver', 'kanel', 'kardemumma', 'kryddpeppar', 'lagerblad', 'muskotnöt', 'gurkmeja', 'cayennepeppar', 'vitlökspulver', 'lökpulver', 'dill', 'persilja', 'gräslök', 'dragon', 'mynta', 'citrongräs', 'zest', 'malen', 'torkad', 'hackad', 'rivet', 'buljong', 'buljongtärning', 'fond', 'olja', 'olivolja', 'rapsolja', 'sesamolja'] },
  { cat: 'bröd', words: ['bröd', 'tortilla', 'pitabröd', 'pita', 'bagel', 'ciabatta', 'baguette', 'naanbröd', 'naan', 'knäckebröd', 'ströbröd', 'panko'] },
  { cat: 'frys', words: ['fryst', 'frysta', 'frysärt', 'frysärtor'] },
]

function guessCategory(name: string): ShoppingCategory {
  const lower = name.toLowerCase()
  for (const { cat, words } of CATEGORY_MAP) {
    if (words.some(w => lower.includes(w))) return cat
  }
  return 'övrigt'
}

// ── JSON-LD extraction ────────────────────────────────────────────────────────

function extractJsonLdItems(html: string): unknown[] {
  const items: unknown[] = []
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1])
      if (Array.isArray(parsed)) {
        items.push(...parsed)
      } else {
        items.push(parsed)
        if (parsed && typeof parsed === 'object' && '@graph' in parsed) {
          const graph = (parsed as Record<string, unknown>)['@graph']
          if (Array.isArray(graph)) items.push(...graph)
        }
      }
    } catch {
      // malformed JSON-LD — skip
    }
  }
  return items
}

function findRecipeNode(items: unknown[]): Record<string, unknown> | null {
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const node = item as Record<string, unknown>
    const t = node['@type']
    if (t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe'))) {
      return node
    }
  }
  return null
}

function parseServings(raw: unknown): number {
  if (typeof raw === 'number') return raw
  const arr = Array.isArray(raw) ? raw : [raw]
  for (const v of arr) {
    const match = String(v).match(/\d+/)
    if (match) return parseInt(match[0])
  }
  return 4
}

// ── Site-specific parsers ─────────────────────────────────────────────────────

interface ParseResult {
  ingredientStrings: string[]
  portionsBase: number
  title?: string
}

function parseDoc(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

function docTitle(doc: Document): string | undefined {
  return (
    doc.querySelector('h1')?.textContent?.trim() ||
    doc.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
    undefined
  )
}

function portionsFromText(text: string): number {
  const m = text.match(/(\d+)\s*portioner/i)
  return m ? parseInt(m[1]) : 4
}

function brLines(html: string): string[] {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean)
}

// landleyskok.se — .ingredient.ingredients, <br> separated, servings in [class*="serving"]
function parseLandleyskok(html: string): ParseResult {
  const doc = parseDoc(html)
  const ingredientStrings = [...doc.querySelectorAll('.ingredient.ingredients')]
    .flatMap(g => brLines(g.innerHTML))
  const servingsText = doc.querySelector('[class*="serving"]')?.textContent ?? ''
  const portionsBase = parseInt(servingsText.match(/\d+/)?.[0] ?? '4')
  return { ingredientStrings, portionsBase, title: docTitle(doc) }
}

// zeinaskitchen.se — .entry-content, ingredients between "N portioner" line and "Gör såhär"
function parseZeinasKitchen(html: string): ParseResult {
  const doc = parseDoc(html)
  const content = doc.querySelector('.entry-content')
  if (!content) throw new Error('Kunde inte hitta receptinnehåll på sidan.')
  // Convert block-level tags to newlines before stripping all tags
  const lines = content.innerHTML
    .replace(/<\/(p|div|li|br|h[1-6])[^>]*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean)
  const portionsIdx = lines.findIndex(l => /\d+\s*portioner/i.test(l))
  const portionsBase = portionsIdx >= 0 ? portionsFromText(lines[portionsIdx]) : 4
  const startIdx = portionsIdx >= 0 ? portionsIdx + 1 : 0
  const endIdx = lines.findIndex((l, i) => i > startIdx && /^gör så/i.test(l))
  return {
    ingredientStrings: lines.slice(startIdx, endIdx > 0 ? endIdx : undefined),
    portionsBase,
    title: docTitle(doc),
  }
}

// mykitchenstories.se — Elementor: next widget after p.elementor-heading-title "Ingredienser"
function parseMyKitchenStories(html: string): ParseResult {
  const doc = parseDoc(html)
  const heading = [...doc.querySelectorAll('p.elementor-heading-title')]
    .find(e => e.textContent?.trim() === 'Ingredienser')
  const widget = heading?.closest('[data-widget_type]')
  const container = widget?.nextElementSibling?.querySelector('.elementor-widget-container')
  if (!container) throw new Error('Kunde inte hitta ingredienser på sidan.')
  return {
    ingredientStrings: brLines(container.innerHTML),
    portionsBase: 4,
    title: docTitle(doc),
  }
}

// vivavinomat.se — h2.text--rust "Ingredienser", parent element holds all lines
function parseVivaVinomat(html: string): ParseResult {
  const doc = parseDoc(html)
  const h2 = [...doc.querySelectorAll('h2.text--rust')]
    .find(e => e.textContent?.trim() === 'Ingredienser')
  const parent = h2?.parentElement
  if (!parent) throw new Error('Kunde inte hitta ingredienser på sidan.')
  const ingredientStrings = (parent.textContent ?? '')
    .split('\n')
    .map(s => s.trim())
    .filter(s => s && s !== 'Ingredienser')
  const portionsBase = portionsFromText(parent.textContent ?? '')
  return { ingredientStrings, portionsBase, title: docTitle(doc) }
}

function getSiteParser(hostname: string): ((html: string) => ParseResult) | null {
  if (hostname.includes('landleyskok.se'))    return parseLandleyskok
  if (hostname.includes('zeinaskitchen.se'))  return parseZeinasKitchen
  if (hostname.includes('mykitchenstories.se')) return parseMyKitchenStories
  if (hostname.includes('vivavinomat.se'))    return parseVivaVinomat
  return null
}

// ── Shared ingredient builder ─────────────────────────────────────────────────

// Returns true for section headers like "Pesto", "Till servering", "Citronsmörsås"
// that appear in ingredient lists but are not actual ingredients.
// Logic: no digits + ≤ 2 words + no recognised ingredient keyword → header.
// Also catches compound dish names ending in common Swedish component suffixes.
const COMPONENT_SUFFIXES = /sås$|marinad$|deg$|smet$|fyllning$|glasyr$|buljong$|fond$|kräm$|röra$|vinägrett$/i

function isLikelyHeader(s: string): boolean {
  if (/\d/.test(s)) return false                              // has a number → ingredient
  const words = s.trim().split(/\s+/)
  if (words.length > 2) return false                          // 3+ words → ingredient description
  const lower = s.toLowerCase()
  // Single-word compound names ending in sauce/component suffixes are headers
  if (words.length === 1 && COMPONENT_SUFFIXES.test(lower)) return true
  const knownIngredient = CATEGORY_MAP.some(({ words: kws }) => kws.some(w => lower.includes(w)))
  return !knownIngredient
}

function buildIngredients(strings: string[], portionsBase: number): Ingredient[] {
  return strings
    .filter(s => s && !isLikelyHeader(s))
    .map(raw => {
      const { amount, unit, name } = parseIngredientString(raw)
      return { id: uuid(), name, amount, unit, category: guessCategory(name), portionsBase }
    })
}

// ── Instructions extraction ───────────────────────────────────────────────────

function extractInstructions(raw: unknown): RecipeStep[] {
  if (!raw) return []

  const texts: string[] = []

  if (typeof raw === 'string') {
    texts.push(...raw.split(/\n+/).map(s => s.trim()).filter(Boolean))
  } else if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === 'string') {
        const t = item.trim(); if (t) texts.push(t)
      } else if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>
        if (obj['@type'] === 'HowToSection' && Array.isArray(obj.itemListElement)) {
          for (const sub of obj.itemListElement) {
            const t = ((sub as Record<string, unknown>).text ?? (sub as Record<string, unknown>).name ?? '') as string
            if (t.trim()) texts.push(t.trim())
          }
        } else {
          const t = ((obj.text ?? obj.name) ?? '') as string
          if (t.trim()) texts.push(t.trim())
        }
      }
    }
  }

  return texts.map(text => ({ id: uuid(), text }))
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface RecipeFetchResult {
  ingredients: Ingredient[]
  portionsBase: number
  title?: string
  instructions?: RecipeStep[]
}

export async function fetchRecipeFromUrl(url: string): Promise<RecipeFetchResult> {
  let hostname: string
  try {
    hostname = new URL(url).hostname
  } catch {
    throw new Error('Ogiltig URL.')
  }

  if (!ALLOWED_HOSTS.includes(hostname)) {
    const supported = [...new Set(ALLOWED_HOSTS.map(h => h.replace(/^www\./, '')))]
    throw new Error(
      `Den här sidan stöds inte.\n\nSidor som stöds: ${supported.join(', ')}`
    )
  }

  const res = await fetch(proxiedUrl(url))
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const html = await res.text()

  // Try site-specific parser first
  const siteParser = getSiteParser(hostname)
  if (siteParser) {
    const { ingredientStrings, portionsBase, title } = siteParser(html)
    const ingredients = buildIngredients(ingredientStrings, portionsBase)
    if (ingredients.length === 0) throw new Error('Hittade inga ingredienser på sidan.')
    return { ingredients, portionsBase, title }
  }

  // Fall back to generic schema.org/Recipe JSON-LD
  const items = extractJsonLdItems(html)
  const recipe = findRecipeNode(items)
  if (!recipe) throw new Error('Hittade inget receptformat (schema.org/Recipe) på sidan.')

  const rawIngredients = (recipe.recipeIngredient as string[] | undefined) ?? []
  const portionsBase = parseServings(recipe.recipeYield)
  const title = typeof recipe.name === 'string' ? recipe.name : undefined
  const ingredients = buildIngredients(rawIngredients, portionsBase)
  const instructionsArr = extractInstructions(recipe.recipeInstructions)
  const instructions = instructionsArr.length > 0 ? instructionsArr : undefined

  if (ingredients.length === 0) throw new Error('Receptet hittades men innehåller inga ingredienser.')
  return { ingredients, portionsBase, title, instructions }
}
