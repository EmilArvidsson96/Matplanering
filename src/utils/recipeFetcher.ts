import { v4 as uuid } from 'uuid'
import type { Ingredient, RecipeSiteRule, RecipeStep, ShoppingCategory } from '../types'
import { extractRecipeWithAi } from '../api/anthropic'
import { useSettingsStore } from '../store/settingsStore'
import { proxiedUrl } from '../api/proxy'

// Any https page can be fetched. Parsing is tried in this order:
//   1. hand-written parsers for a few Swedish sites
//   2. schema.org/Recipe JSON-LD or microdata
//   3. CSS selectors previously learned for this host (via AI, stored in settings)
//   4. common recipe-plugin markup and an "Ingredienser"-heading heuristic
//   5. AI extraction — which also returns selectors that are verified and saved
//      as a learned rule, so the next recipe from that site needs no AI call.


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

function findRecipeNode(items: unknown[], depth = 0): Record<string, unknown> | null {
  if (depth > 5) return null
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    if (Array.isArray(item)) {
      const found = findRecipeNode(item, depth + 1)
      if (found) return found
      continue
    }
    const node = item as Record<string, unknown>
    const t = node['@type']
    if (t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe'))) {
      return node
    }
    // Recipe nested inside e.g. WebPage.mainEntity or @graph
    const nested = ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement', 'item']
      .map(k => node[k])
      .filter(v => v && typeof v === 'object')
    if (nested.length) {
      const found = findRecipeNode(nested, depth + 1)
      if (found) return found
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

// kronfagel.se — tries JSON-LD first, then DOM search near "INGREDIENSER" heading
function parseKronfagel(html: string): ParseResult {
  const doc = parseDoc(html)

  // JSON-LD first (may be present even if not visible in scraped text)
  const ldItems = extractJsonLdItems(html)
  const recipe = findRecipeNode(ldItems)
  if (recipe && Array.isArray(recipe.recipeIngredient) && (recipe.recipeIngredient as unknown[]).length > 0) {
    return {
      ingredientStrings: recipe.recipeIngredient as string[],
      portionsBase: parseServings(recipe.recipeYield),
      title: typeof recipe.name === 'string' ? recipe.name : docTitle(doc),
    }
  }

  // DOM: find heading whose text is exactly "INGREDIENSER" / "Ingredienser"
  const heading = [...doc.querySelectorAll('h1,h2,h3,h4,h5,p,span,div')]
    .find(el => /^ingredienser$/i.test(el.textContent?.trim() ?? ''))

  if (heading) {
    // Look for a <ul>/<ol> as a sibling after the heading
    let sibling: Element | null = heading.nextElementSibling
    while (sibling && !['UL', 'OL'].includes(sibling.tagName)) sibling = sibling.nextElementSibling
    if (sibling) {
      const lines = [...sibling.querySelectorAll('li')].map(li => li.textContent?.trim() ?? '').filter(Boolean)
      if (lines.length > 0) {
        return { ingredientStrings: lines, portionsBase: portionsFromText(doc.body.textContent ?? ''), title: docTitle(doc) }
      }
    }

    // Or inside the heading's parent container
    const parent = heading.parentElement
    if (parent) {
      const list = parent.querySelector('ul, ol')
      if (list) {
        const lines = [...list.querySelectorAll('li')].map(li => li.textContent?.trim() ?? '').filter(Boolean)
        if (lines.length > 0) {
          return { ingredientStrings: lines, portionsBase: portionsFromText(parent.textContent ?? ''), title: docTitle(doc) }
        }
      }
    }
  }

  // Last resort: any list where ≥ 3 items look like ingredients (contain a digit, short text)
  for (const list of doc.querySelectorAll('ul, ol')) {
    const lines = [...list.querySelectorAll('li')].map(li => li.textContent?.trim() ?? '').filter(Boolean)
    if (lines.filter(s => /\d/.test(s) && s.length < 100).length >= 3) {
      return { ingredientStrings: lines, portionsBase: portionsFromText(doc.body.textContent ?? ''), title: docTitle(doc) }
    }
  }

  throw new Error('Kunde inte hitta ingredienser på sidan.')
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
  if (hostname.includes('kronfagel.se'))      return parseKronfagel
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

// ── Generic DOM helpers ───────────────────────────────────────────────────────

const BLOCK_TAGS = new Set(['P', 'DIV', 'LI', 'UL', 'OL', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TR', 'SECTION', 'ARTICLE', 'BLOCKQUOTE', 'DT', 'DD'])

/** Text of an element split into visual lines (on <br> and block elements). */
function elementLines(el: Element): string[] {
  let out = ''
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) { out += node.textContent ?? ''; return }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const e = node as Element
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'BUTTON', 'svg'].includes(e.tagName)) return
    if (e.tagName === 'BR') { out += '\n'; return }
    const block = BLOCK_TAGS.has(e.tagName)
    if (block) out += '\n'
    e.childNodes.forEach(walk)
    if (block) out += '\n'
  }
  walk(el)
  return out
    .split('\n')
    .map(l => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

function safeQueryAll(root: ParentNode, selector: string | undefined): Element[] {
  if (!selector) return []
  try {
    return [...root.querySelectorAll(selector)]
  } catch {
    return []  // invalid selector
  }
}

/** Lines from all elements matching selector; nested matches are de-duplicated. */
function linesBySelector(doc: Document, selector: string | undefined): string[] {
  const els = safeQueryAll(doc, selector)
  const outer = els.filter(e => !els.some(o => o !== e && o.contains(e)))
  return outer.flatMap(elementLines)
}

function textBySelector(doc: Document, selector: string | undefined): string | undefined {
  const el = safeQueryAll(doc, selector)[0]
  const t = el?.textContent?.replace(/\s+/g, ' ').trim()
  return t || undefined
}

function servingsFromText(text: string | undefined): number | undefined {
  if (!text) return undefined
  const m = text.match(/(\d+)\s*(portioner|portion|pers|personer|servings|serves|st)?/i)
  const n = m ? parseInt(m[1]) : NaN
  return n > 0 && n < 100 ? n : undefined
}

function toSteps(texts: string[]): RecipeStep[] | undefined {
  const steps = texts.map(t => t.trim()).filter(Boolean).map(text => ({ id: uuid(), text }))
  return steps.length ? steps : undefined
}

function hostKey(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, '')
}

// ── Generic parsers (no AI) ───────────────────────────────────────────────────

interface Extracted {
  ingredientStrings: string[]
  portionsBase: number
  title?: string
  instructions?: RecipeStep[]
}

function fromJsonLd(html: string): Extracted | null {
  const recipe = findRecipeNode(extractJsonLdItems(html))
  if (!recipe) return null
  const raw = recipe.recipeIngredient ?? recipe.ingredients
  const ingredientStrings = (Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split('\n') : [])
    .filter((x): x is string => typeof x === 'string')
    .map(decodeEntities)
  if (ingredientStrings.length === 0) return null
  const instr = extractInstructions(recipe.recipeInstructions).map(s => ({ ...s, text: decodeEntities(s.text) }))
  return {
    ingredientStrings,
    portionsBase: parseServings(recipe.recipeYield),
    title: typeof recipe.name === 'string' ? decodeEntities(recipe.name) : undefined,
    instructions: instr.length ? instr : undefined,
  }
}

function decodeEntities(s: string): string {
  if (!/[&<]/.test(s)) return s.trim()
  const d = new DOMParser().parseFromString(`<body>${s}</body>`, 'text/html')
  return (d.body.textContent ?? s).replace(/\s+/g, ' ').trim()
}

function fromRule(doc: Document, rule: RecipeSiteRule): Extracted | null {
  const ingredientStrings = linesBySelector(doc, rule.ingredientSelector)
  if (ingredientStrings.length < 2) return null
  return {
    ingredientStrings,
    portionsBase: servingsFromText(textBySelector(doc, rule.servingsSelector))
      ?? portionsFromText(doc.body.textContent ?? ''),
    title: textBySelector(doc, rule.titleSelector) ?? docTitle(doc),
    instructions: toSteps(linesBySelector(doc, rule.instructionSelector)),
  }
}

// Markup used by popular recipe plugins / schema.org microdata.
const KNOWN_MARKUP: RecipeSiteRule[] = [
  { ingredientSelector: '[itemprop="recipeIngredient"], [itemprop="ingredients"]', instructionSelector: '[itemprop="recipeInstructions"]', servingsSelector: '[itemprop="recipeYield"]', learnedAt: '' },
  { ingredientSelector: '.wprm-recipe-ingredient', instructionSelector: '.wprm-recipe-instruction-text', titleSelector: '.wprm-recipe-name', servingsSelector: '.wprm-recipe-servings', learnedAt: '' },
  { ingredientSelector: '.tasty-recipes-ingredients li', instructionSelector: '.tasty-recipes-instructions li', titleSelector: '.tasty-recipes-title', servingsSelector: '.tasty-recipes-yield', learnedAt: '' },
  { ingredientSelector: '.mv-create-ingredients li', instructionSelector: '.mv-create-instructions li', titleSelector: '.mv-create-title', learnedAt: '' },
  { ingredientSelector: '.ingredients li, .recipe-ingredients li, .ingredient-list li', instructionSelector: '.instructions li, .recipe-instructions li, .recipe-steps li', learnedAt: '' },
]

const INGREDIENT_HEADING = /^(ingredienser|ingredients?|ingredienten|zutaten|ingrédients|ingredientes|ingredienti|du behöver|det här behöver du)\s*:?$/i
const INSTRUCTION_HEADING = /^(gör så här|så gör du|instruktioner|tillagning|tillvägagångssätt|gör såhär|instructions|method|directions|preparation|steps|zubereitung|préparation)\s*:?$/i

/** Finds the first list (or line-broken block) following a heading matching `re`. */
function linesAfterHeading(doc: Document, re: RegExp): string[] {
  const headings = [...doc.querySelectorAll('h1,h2,h3,h4,h5,h6,strong,b,p,span,div,dt,th')]
    .filter(el => re.test(el.textContent?.replace(/\s+/g, ' ').trim() ?? ''))
  for (const heading of headings) {
    // Walk forward through following elements (siblings, then ancestors' siblings)
    let node: Element | null = heading
    for (let hops = 0; node && hops < 6; hops++) {
      let sib: Element | null = node.nextElementSibling
      for (let i = 0; sib && i < 4; i++, sib = sib.nextElementSibling) {
        const list = sib.matches('ul,ol') ? sib : sib.querySelector('ul,ol')
        if (list) {
          const lines = [...list.querySelectorAll(':scope > li')].map(li => elementLines(li).join(' ')).filter(Boolean)
          if (lines.length >= 2) return lines
        }
        const lines = elementLines(sib)
        if (lines.length >= 2 && lines.every(l => l.length < 200)) return lines
      }
      node = node.parentElement
    }
  }
  return []
}

function fromHeuristics(doc: Document): Extracted | null {
  for (const rule of KNOWN_MARKUP) {
    const r = fromRule(doc, rule)
    if (r) return r
  }
  const ingredientStrings = linesAfterHeading(doc, INGREDIENT_HEADING)
  if (ingredientStrings.length < 2) return null
  return {
    ingredientStrings,
    portionsBase: portionsFromText(doc.body.textContent ?? ''),
    title: docTitle(doc),
    instructions: toSteps(linesAfterHeading(doc, INSTRUCTION_HEADING)),
  }
}

// ── Learning from AI ──────────────────────────────────────────────────────────

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')

/** True if the selector reproduces (most of) what the AI read off the page. */
function selectorMatches(doc: Document, selector: string | undefined, expected: string[]): boolean {
  if (!selector || expected.length === 0) return false
  const got = linesBySelector(doc, selector).map(norm).filter(Boolean)
  if (got.length === 0 || got.length > expected.length * 1.5 + 3) return false
  const gotJoined = got.join('|')
  const hits = expected.filter(e => {
    const n = norm(e)
    return n && (got.includes(n) || gotJoined.includes(n))
  }).length
  return hits / expected.length >= 0.7
}

function learnRule(host: string, doc: Document, ai: Awaited<ReturnType<typeof extractRecipeWithAi>>): boolean {
  if (!selectorMatches(doc, ai.ingredientSelector, ai.ingredients)) return false
  const rule: RecipeSiteRule = {
    ingredientSelector: ai.ingredientSelector!,
    learnedAt: new Date().toISOString().slice(0, 10),
  }
  if (selectorMatches(doc, ai.instructionSelector, ai.instructions)) rule.instructionSelector = ai.instructionSelector
  if (ai.title && textBySelector(doc, ai.titleSelector) && norm(textBySelector(doc, ai.titleSelector)!) === norm(ai.title)) {
    rule.titleSelector = ai.titleSelector
  }
  if (ai.servings && servingsFromText(textBySelector(doc, ai.servingsSelector)) === ai.servings) {
    rule.servingsSelector = ai.servingsSelector
  }
  useSettingsStore.getState().setRecipeSiteRule(host, rule)
  return true
}

// ── Public API ────────────────────────────────────────────────────────────────

export type RecipeSource = 'site-parser' | 'json-ld' | 'learned' | 'heuristic' | 'ai'

export interface RecipeFetchResult {
  ingredients: Ingredient[]
  portionsBase: number
  title?: string
  instructions?: RecipeStep[]
  source: RecipeSource
  /** Set when AI was used: whether a reusable rule for the site was saved. */
  learned?: boolean
}

function finish(e: Extracted, source: RecipeSource): RecipeFetchResult | null {
  const ingredients = buildIngredients(e.ingredientStrings, e.portionsBase)
  if (ingredients.length === 0) return null
  return { ingredients, portionsBase: e.portionsBase, title: e.title, instructions: e.instructions, source }
}

export async function fetchRecipeFromUrl(url: string): Promise<RecipeFetchResult> {
  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
  } catch {
    throw new Error('Ogiltig URL.')
  }
  if (parsedUrl.protocol === 'http:') parsedUrl.protocol = 'https:'
  if (parsedUrl.protocol !== 'https:') throw new Error('Ogiltig URL.')
  url = parsedUrl.toString()
  const hostname = parsedUrl.hostname
  const host = hostKey(hostname)

  const res = await fetch(proxiedUrl(url))
  if (!res.ok) throw new Error(`Kunde inte hämta sidan (HTTP ${res.status}).`)
  const html = await res.text()
  const doc = parseDoc(html)

  const settings = useSettingsStore.getState().settings
  const learnedRule = settings.recipeSiteRules?.[host]

  // Instructions are sometimes missing from an otherwise good parse — fill in
  // from the learned rule or heuristics in that case.
  const withInstructions = (r: RecipeFetchResult): RecipeFetchResult => {
    if (r.instructions?.length) return r
    const instr = (learnedRule && toSteps(linesBySelector(doc, learnedRule.instructionSelector)))
      ?? toSteps(linesAfterHeading(doc, INSTRUCTION_HEADING))
    return instr ? { ...r, instructions: instr } : r
  }

  // 1. Hand-written site parsers
  const siteParser = getSiteParser(hostname)
  if (siteParser) {
    try {
      const r = finish(siteParser(html), 'site-parser')
      if (r) {
        const instr = learnedRule && toSteps(linesBySelector(doc, learnedRule.instructionSelector))
        return instr ? { ...r, instructions: instr } : r
      }
    } catch { /* fall through to generic parsing */ }
  }

  // 2. schema.org/Recipe JSON-LD
  const ld = fromJsonLd(html)
  const ldResult = ld && finish(ld, 'json-ld')
  if (ldResult) return withInstructions(ldResult)

  // 3. Learned rule for this site
  if (learnedRule) {
    const r = fromRule(doc, learnedRule)
    const result = r && finish(r, 'learned')
    if (result) return withInstructions(result)
    // Rule no longer works (site redesign?) — fall through and let AI re-learn.
  }

  // 4. Generic heuristics
  const h = fromHeuristics(doc)
  const hResult = h && finish(h, 'heuristic')
  if (hResult) return hResult

  // 5. AI — and learn selectors for next time
  const ai = await extractRecipeWithAi(url, html, settings)
  const portionsBase = ai.servings ?? 4
  const ingredients = buildIngredients(ai.ingredients, portionsBase)
  if (ingredients.length === 0) throw new Error('Hittade inga ingredienser på sidan.')
  let learned = false
  try {
    learned = learnRule(host, doc, ai)
    if (!learned && learnedRule) useSettingsStore.getState().setRecipeSiteRule(host, null)
  } catch { /* learning is best-effort */ }
  return {
    ingredients,
    portionsBase,
    title: ai.title,
    instructions: toSteps(ai.instructions),
    source: 'ai',
    learned,
  }
}
