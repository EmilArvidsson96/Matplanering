/** Anthropic API — calls the Messages API directly from the browser. */

import type { AiModel, AppSettings, Dish, RecipeImprovement, ShoppingCategory, ShoppingItem } from '../types'
import { LEX_BY_NAME } from '../data/ingredientLexicon'

const MODEL_IDS: Record<AiModel, string> = {
  haiku: 'claude-haiku-4-5',
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-7',
}

const ANTHROPIC_HEADERS = (apiKey: string) => ({
  'x-api-key': apiKey,
  'anthropic-version': '2023-06-01',
  'anthropic-dangerous-direct-browser-access': 'true',
  'content-type': 'application/json',
})

/** Shared error extraction for non-2xx responses. */
async function throwApiError(res: Response): Promise<never> {
  let detail = res.status.toString()
  try {
    const err = await res.json() as { error?: { message?: string } }
    if (err.error?.message) detail += ' — ' + err.error.message
  } catch { /* ignore */ }
  throw new Error(`Anthropic-anrop misslyckades: ${detail}`)
}

// ── Result cache ──────────────────────────────────────────────────────────
// Persists the last result per recipe per tool in localStorage so reopening
// a tool reuses the previous answer instead of making another paid API call.
// The cache key includes a hash of the exact inputs sent to the model, so an
// edited recipe automatically misses and re-fetches.

/** FNV-1a hash → short base36 string. Stable across reloads. */
function hashInputs(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

interface CacheEnvelope<T> { hash: string; data: T }

function readCache<T>(key: string, hash: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const env = JSON.parse(raw) as CacheEnvelope<T>
    return env.hash === hash ? env.data : null
  } catch {
    return null
  }
}

function writeCache<T>(key: string, hash: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify({ hash, data } satisfies CacheEnvelope<T>))
  } catch {
    /* quota / disabled storage — caching is best-effort */
  }
}

const CATEGORIES: ShoppingCategory[] = [
  'mejeri', 'kött', 'fisk', 'grönsaker', 'frukt',
  'torrvaror', 'konserver', 'frys', 'bröd', 'kryddor', 'övrigt',
]

export interface AiMerge {
  itemIds: string[]
  name: string
  category: ShoppingCategory
}

export interface AiRecategorization {
  itemId: string
  category: ShoppingCategory
}

export interface AiTranslation {
  itemId: string
  name: string
}

export interface AiCleanupResult {
  merges: AiMerge[]
  recategorizations: AiRecategorization[]
  translations: AiTranslation[]
}

const CLEANUP_TOOL = {
  name: 'submit_cleanup',
  description: 'Lämna in föreslagna ändringar för inköpslistan.',
  input_schema: {
    type: 'object',
    properties: {
      merges: {
        type: 'array',
        description: 'Grupper av varor som egentligen är samma produkt och bör slås ihop.',
        items: {
          type: 'object',
          properties: {
            itemIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'ID:n för de varor som ska slås ihop (minst 2).',
            },
            name: { type: 'string', description: 'Det gemensamma namnet på svenska.' },
            category: { type: 'string', enum: CATEGORIES },
          },
          required: ['itemIds', 'name', 'category'],
        },
      },
      recategorizations: {
        type: 'array',
        description: 'Varor i kategorin "övrigt" som bör flyttas till en mer passande kategori.',
        items: {
          type: 'object',
          properties: {
            itemId: { type: 'string' },
            category: { type: 'string', enum: CATEGORIES },
          },
          required: ['itemId', 'category'],
        },
      },
      translations: {
        type: 'array',
        description: 'Varor med engelska namn som bör översättas till svenska.',
        items: {
          type: 'object',
          properties: {
            itemId: { type: 'string' },
            name: { type: 'string', description: 'Det svenska namnet.' },
          },
          required: ['itemId', 'name'],
        },
      },
    },
    required: ['merges', 'recategorizations', 'translations'],
  },
} as const

const SYSTEM_PROMPT = `Du är en assistent som städar en svensk inköpslista. Du får en lista med varor (med id, namn, mängd, enhet och kategori) och ska föreslå tre sorters ändringar:

1. merges: Hitta varor som egentligen är samma produkt men inte slogs ihop automatiskt (t.ex. olika stavning, synonymer, en med och en utan beskrivande ord). Slå ENDAST ihop varor som verkligen är samma sak att köpa. Slå inte ihop olika produkter (t.ex. "färsk lax" och "rökt lax" är olika).
2. recategorizations: För varor som ligger i kategorin "övrigt", välj den mest passande kategorin.
3. translations: Översätt eventuella engelska varunamn till svenska.

Var konservativ – föreslå bara ändringar du är säker på. Returnera tomma listor om inget behöver ändras.`

export async function cleanupShoppingList(
  items: ShoppingItem[],
  settings: AppSettings,
): Promise<AiCleanupResult> {
  const apiKey = settings.anthropicApiKey?.trim()
  if (!apiKey) {
    throw new Error('Ingen API-nyckel angiven. Lägg till den under Inställningar.')
  }

  const model = MODEL_IDS[settings.aiModel ?? 'haiku']
  const payload = items.map(i => ({
    id: i.id,
    name: i.name,
    amount: i.amount,
    unit: i.unit,
    category: i.category,
  }))

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: [CLEANUP_TOOL],
      tool_choice: { type: 'tool', name: 'submit_cleanup' },
      messages: [
        {
          role: 'user',
          content: `Här är inköpslistan:\n${JSON.stringify(payload, null, 2)}`,
        },
      ],
    }),
  })

  if (!res.ok) {
    let detail = res.status.toString()
    try {
      const err = await res.json() as { error?: { message?: string } }
      if (err.error?.message) detail += ' — ' + err.error.message
    } catch { /* ignore */ }
    throw new Error(`Anthropic-anrop misslyckades: ${detail}`)
  }

  const data = await res.json() as {
    content: Array<{ type: string; name?: string; input?: unknown }>
  }
  const toolUse = data.content.find(c => c.type === 'tool_use' && c.name === 'submit_cleanup')
  if (!toolUse?.input) {
    throw new Error('AI returnerade inget giltigt svar.')
  }

  const result = toolUse.input as Partial<AiCleanupResult>
  const validCat = (c: unknown): c is ShoppingCategory =>
    typeof c === 'string' && (CATEGORIES as string[]).includes(c)

  return {
    merges: (result.merges ?? []).filter(
      m => Array.isArray(m.itemIds) && m.itemIds.length >= 2 && validCat(m.category),
    ),
    recategorizations: (result.recategorizations ?? []).filter(
      r => typeof r.itemId === 'string' && validCat(r.category),
    ),
    translations: (result.translations ?? []).filter(
      t => typeof t.itemId === 'string' && typeof t.name === 'string' && t.name.trim() !== '',
    ),
  }
}

// ════════════════════════════════════════════════════════════════════════
// Receipt-based price calibration
// ════════════════════════════════════════════════════════════════════════

export interface ReceiptImage {
  mediaType: string   // e.g. "image/jpeg"
  data: string        // base64, no data-URL prefix
}

export interface CalibrationProposal {
  name: string          // lexicon canonical name
  oldCostPerKg: number
  newCostPerKg: number
  kind: 'direct' | 'related'
  reason: string
}

const CALIBRATION_TOOL = {
  name: 'submit_calibration',
  description: 'Lämna in föreslagna prisjusteringar (SEK/kg) för ingredienser baserat på kvittot.',
  input_schema: {
    type: 'object',
    properties: {
      calibrations: {
        type: 'array',
        description: 'Föreslagna nya priser per kg för ingredienser i lexikonet.',
        items: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Exakt kanoniskt namn från ingredienslexikonet.',
            },
            newCostPerKg: {
              type: 'number',
              description: 'Föreslaget nytt pris i SEK per kg ätbar vara.',
            },
            kind: {
              type: 'string',
              enum: ['direct', 'related'],
              description: '"direct" = avläst direkt från kvittot. "related" = härledd relativt från en avläst vara.',
            },
            reason: {
              type: 'string',
              description: 'Kort motivering på svenska (vilken kvittorad / vilket samband).',
            },
          },
          required: ['name', 'newCostPerKg', 'kind', 'reason'],
        },
      },
    },
    required: ['calibrations'],
  },
} as const

const CALIBRATION_SYSTEM_PROMPT = `Du är en assistent som kalibrerar prisuppskattningar för ingredienser utifrån foton på matkvitton. Du får en eller flera bilder på kvitton samt en lista över ingredienser i appens lexikon med deras nuvarande uppskattade pris (SEK/kg).

Din uppgift:
1. Läs av varor och priser från kvittona. Räkna om till pris per kg ätbar vara (ta hänsyn till förpackningsvikt/antal/styckpris och eventuell rabatt). Bortse från pant, påsar och icke-livsmedel.
2. För varje vara du säkert kan koppla till en post i lexikonet: föreslå ett nytt costPerKg med kind="direct".
3. Kalibrera även NÄRLIGGANDE ingredienser som inte stod på kvittot, med kind="related". Bevara de RELATIVA prisförhållandena i lexikonet i stället för att kopiera absolutpriset:
   - Nästan identiska varor får ungefär samma pris (t.ex. kycklingbuljong → oxbuljong, grönsaksbuljong).
   - Olika kvalitet/styckdetalj justeras proportionellt: om "Entrecôte" ändras med faktor x, flytta "Biff", "Högrev" m.fl. med samma riktning men behåll deras inbördes prisnivå (de blir alltså inte samma pris).
   - Justera bara varor där sambandet är tydligt och rimligt.
4. Var konservativ. Föreslå inget om du är osäker. Returnera en tom lista om kvittot inte ger användbar information.

Använd EXAKTA kanoniska namn från listan. Priser är i svenska kronor per kg.`

export async function calibrateFromReceipts(
  images: ReceiptImage[],
  settings: AppSettings,
): Promise<CalibrationProposal[]> {
  const apiKey = settings.anthropicApiKey?.trim()
  if (!apiKey) {
    throw new Error('Ingen API-nyckel angiven. Lägg till den under Inställningar.')
  }
  if (images.length === 0) {
    throw new Error('Ladda upp minst en bild på ett kvitto.')
  }

  const model = MODEL_IDS[settings.calibrationModel ?? 'sonnet']
  const overrides = settings.costOverrides ?? {}
  const lexPayload = [...LEX_BY_NAME.values()].map(e => ({
    name: e.name,
    costPerKg: overrides[e.name] ?? e.costPerKg,
  }))

  const content: unknown[] = images.map(img => ({
    type: 'image',
    source: { type: 'base64', media_type: img.mediaType, data: img.data },
  }))
  content.push({
    type: 'text',
    text: `Här är ingredienslexikonet (namn + nuvarande pris SEK/kg):\n${JSON.stringify(lexPayload)}`,
  })

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      system: CALIBRATION_SYSTEM_PROMPT,
      tools: [CALIBRATION_TOOL],
      tool_choice: { type: 'tool', name: 'submit_calibration' },
      messages: [{ role: 'user', content }],
    }),
  })

  if (!res.ok) {
    let detail = res.status.toString()
    try {
      const err = await res.json() as { error?: { message?: string } }
      if (err.error?.message) detail += ' — ' + err.error.message
    } catch { /* ignore */ }
    throw new Error(`Anthropic-anrop misslyckades: ${detail}`)
  }

  const data = await res.json() as {
    content: Array<{ type: string; name?: string; input?: unknown }>
  }
  const toolUse = data.content.find(c => c.type === 'tool_use' && c.name === 'submit_calibration')
  if (!toolUse?.input) {
    throw new Error('AI returnerade inget giltigt svar.')
  }

  const raw = (toolUse.input as { calibrations?: unknown[] }).calibrations ?? []
  const proposals: CalibrationProposal[] = []
  for (const c of raw) {
    if (typeof c !== 'object' || c === null) continue
    const { name, newCostPerKg, kind, reason } = c as Record<string, unknown>
    const entry = typeof name === 'string' ? LEX_BY_NAME.get(name) : undefined
    if (!entry) continue
    if (typeof newCostPerKg !== 'number' || !isFinite(newCostPerKg) || newCostPerKg <= 0) continue
    const oldCostPerKg = overrides[entry.name] ?? entry.costPerKg
    proposals.push({
      name: entry.name,
      oldCostPerKg,
      newCostPerKg: Math.round(newCostPerKg),
      kind: kind === 'related' ? 'related' : 'direct',
      reason: typeof reason === 'string' ? reason : '',
    })
  }
  return proposals
}

// ════════════════════════════════════════════════════════════════════════
// Split instructions into clearer step-by-step (Haiku)
// ════════════════════════════════════════════════════════════════════════

const SPLIT_TOOL = {
  name: 'submit_steps',
  description: 'Lämna in de omarbetade instruktionsstegen, ett steg per element, i rätt ordning.',
  input_schema: {
    type: 'object',
    properties: {
      steps: {
        type: 'array',
        description: 'De nya stegen i ordning. Varje element är texten för ETT steg.',
        items: { type: 'string' },
      },
    },
    required: ['steps'],
  },
} as const

const SPLIT_SYSTEM_PROMPT = `Du är en assistent som gör matrecept lättare att följa. Du får ett recepts nuvarande instruktioner och ska dela upp dem i tydliga steg-för-steg-instruktioner på korrekt, naturlig svenska.

Regler:
1. Varje steg ska beskriva EN handling (eller några få nära sammanhängande). Dela upp steg som klämmer in flera moment i ett.
2. Skriv all text på korrekt, idiomatisk svenska. Översätt allt som är på annat språk (t.ex. engelska eller maskinöversatt text) till naturlig svenska. Lämna inga engelska ord kvar (t.ex. "stir fry" → "woka"/"stek hastigt", "Tbsp" → "msk", "tsp" → "tsk").
3. Rätta stavfel, särskrivningar och klumpiga maskinöversättningar (t.ex. "Blansera" → "Blanchera", "Dräner vattnet" → "Häll av vattnet"/"Låt rinna av", "sprida den väl" → "fördela den jämnt"). Använd svenska citattecken och korrekt typografi.
3b. Stavning och grammatik MÅSTE vara helt korrekt svenska. Hitta inte på eller förvräng ord – t.ex. heter det "spenat"/"babyspenat" (INTE "sperinat"), "sötpotatisstärkelse" och "nötköttet" (INTE "nötköttets"). Använd rätt genus och bestämd form ("den gula löken", "den rostade sesamoljan"). Om du är osäker på hur en ingrediens stavas, använd exakt namnet från den medskickade ingredienslistan. Läs igenom varje ord och verifiera stavningen innan du svarar.
4. Ändra INTE innehållet i sak: lägg inte till nya moment, ingredienser, mängder eller tider, och ta inte bort information. Du översätter, rättar språket, omformulerar och delar upp – inget annat.
5. När ett steg nämner en ingrediens som finns i den medskickade ingredienslistan, använd EXAKT det namn och den stavning som står i listan, så att mängder kan kopplas automatiskt.
6. Håll varje steg kort och konkret. Slå ihop bara om ett steg blivit meningslöst kort på egen hand.
7. Behåll den logiska ordningen.

Returnera den fullständiga listan med steg.`

function splitPayload(dish: Dish) {
  return {
    name: dish.name,
    ingredients: dish.ingredients.map(i => i.name),
    instructions: (dish.instructions ?? []).map(s => s.text).filter(t => t.trim()),
  }
}

/** Hash of the inputs the split tool sends — stored with the result on the dish. */
export function splitInputHash(dish: Dish): string {
  return hashInputs(JSON.stringify(splitPayload(dish)))
}

export async function splitInstructions(
  dish: Dish,
  settings: AppSettings,
  opts: { force?: boolean } = {},
): Promise<string[]> {
  const apiKey = settings.anthropicApiKey?.trim()
  if (!apiKey) {
    throw new Error('Ingen API-nyckel angiven. Lägg till den under Inställningar.')
  }
  const steps = (dish.instructions ?? []).map(s => s.text).filter(t => t.trim())
  if (steps.length === 0) {
    throw new Error('Receptet har inga instruktioner att dela upp.')
  }

  const payload = splitPayload(dish)

  // v3: split now uses Sonnet (was Haiku) for more accurate Swedish — bump the
  // version so results cached under the old model/prompt are regenerated.
  const cacheKey = `mp_ai_split_v3_${dish.id}`
  const hash = splitInputHash(dish)
  if (!opts.force) {
    // Result saved on the recipe (synced to every device) wins over the local cache.
    if (dish.ai?.split?.hash === hash) return dish.ai.split.steps
    const cached = readCache<string[]>(cacheKey, hash)
    if (cached) return cached
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: ANTHROPIC_HEADERS(apiKey),
    body: JSON.stringify({
      model: MODEL_IDS.sonnet,
      max_tokens: 8192,
      system: SPLIT_SYSTEM_PROMPT,
      tools: [SPLIT_TOOL],
      tool_choice: { type: 'tool', name: 'submit_steps' },
      messages: [
        {
          role: 'user',
          content: `Här är receptet:\n${JSON.stringify(payload, null, 2)}`,
        },
      ],
    }),
  })

  if (!res.ok) await throwApiError(res)

  const data = await res.json() as {
    content: Array<{ type: string; name?: string; input?: unknown }>
  }
  const toolUse = data.content.find(c => c.type === 'tool_use' && c.name === 'submit_steps')
  if (!toolUse?.input) {
    throw new Error('AI returnerade inget giltigt svar.')
  }

  const raw = (toolUse.input as { steps?: unknown }).steps
  if (!Array.isArray(raw)) {
    throw new Error('AI returnerade inget giltigt svar.')
  }
  const result = raw
    .filter((s): s is string => typeof s === 'string')
    .map(s => s.trim())
    .filter(s => s !== '')
  writeCache(cacheKey, hash, result)
  return result
}

// ════════════════════════════════════════════════════════════════════════
// Recipe improvement suggestions (Sonnet)
// ════════════════════════════════════════════════════════════════════════

export type { RecipeImprovement }

const IMPROVE_TOOL = {
  name: 'submit_improvements',
  description: 'Lämna in konkreta förbättringsförslag för receptet.',
  input_schema: {
    type: 'object',
    properties: {
      improvements: {
        type: 'array',
        description: 'Lista med fristående förbättringsförslag. Varje förslag ska gå att lägga till var för sig.',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Kort rubrik (några ord).' },
            detail: { type: 'string', description: 'Själva förslaget, en eller två meningar, formulerat så att det kan läggas till som en anteckning i receptet.' },
            category: {
              type: 'string',
              description: 'Typ av förbättring, t.ex. "smak", "teknik", "hälsa", "tid" eller "tillbehör".',
            },
          },
          required: ['title', 'detail', 'category'],
        },
      },
    },
    required: ['improvements'],
  },
} as const

const IMPROVE_SYSTEM_PROMPT = `Du är en erfaren kock som ger konkreta, valbara förbättringsförslag för ett matrecept. Du får receptets namn, ingredienser (med mängder), instruktioner, ev. anteckningar samt kategorisering (kök, typ, taggar).

Ge 3–6 fristående förslag som höjer rätten. Varje förslag ska:
- vara konkret och direkt användbart (inte vagt som "krydda mer").
- gälla EN sak, så att användaren kan välja att lägga till ett eller flera oberoende av varandra.
- formuleras på samma språk som receptet, så att det kan klistras in som en anteckning.

Variera gärna mellan smak, teknik, hälsosammare alternativ, tidsbesparing och passande tillbehör/garnering. Respektera receptets karaktär och eventuella taggar (t.ex. lågfett, barnvänlig). Hitta inte på att receptet innehåller saker det inte gör.`

export async function suggestRecipeImprovements(
  dish: Dish,
  settings: AppSettings,
  opts: { force?: boolean } = {},
): Promise<RecipeImprovement[]> {
  const apiKey = settings.anthropicApiKey?.trim()
  if (!apiKey) {
    throw new Error('Ingen API-nyckel angiven. Lägg till den under Inställningar.')
  }

  const payload = {
    name: dish.name,
    cuisine: dish.cuisine,
    type: dish.type,
    tags: dish.tags,
    ingredients: dish.ingredients.map(i => ({ name: i.name, amount: i.amount, unit: i.unit })),
    instructions: (dish.instructions ?? []).map(s => s.text),
    notes: dish.notes ?? '',
  }

  const cacheKey = `mp_ai_improve_v1_${dish.id}`
  const hash = hashInputs(JSON.stringify(payload))
  if (!opts.force) {
    // Suggestions saved on the recipe are kept even after notes change (e.g.
    // when some of them were added), so they're always available again.
    const saved = dish.ai?.improvements?.items
    if (saved?.length) return saved
    const cached = readCache<RecipeImprovement[]>(cacheKey, hash)
    if (cached) return cached
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: ANTHROPIC_HEADERS(apiKey),
    body: JSON.stringify({
      model: MODEL_IDS.sonnet,
      max_tokens: 4096,
      system: IMPROVE_SYSTEM_PROMPT,
      tools: [IMPROVE_TOOL],
      tool_choice: { type: 'tool', name: 'submit_improvements' },
      messages: [
        {
          role: 'user',
          content: `Här är receptet:\n${JSON.stringify(payload, null, 2)}`,
        },
      ],
    }),
  })

  if (!res.ok) await throwApiError(res)

  const data = await res.json() as {
    content: Array<{ type: string; name?: string; input?: unknown }>
  }
  const toolUse = data.content.find(c => c.type === 'tool_use' && c.name === 'submit_improvements')
  if (!toolUse?.input) {
    throw new Error('AI returnerade inget giltigt svar.')
  }

  const raw = (toolUse.input as { improvements?: unknown[] }).improvements ?? []
  const improvements: RecipeImprovement[] = []
  for (const c of raw) {
    if (typeof c !== 'object' || c === null) continue
    const { title, detail, category } = c as Record<string, unknown>
    if (typeof title !== 'string' || typeof detail !== 'string') continue
    if (title.trim() === '' || detail.trim() === '') continue
    improvements.push({
      title: title.trim(),
      detail: detail.trim(),
      category: typeof category === 'string' && category.trim() !== '' ? category.trim() : 'förslag',
    })
  }
  writeCache(cacheKey, hash, improvements)
  return improvements
}

// ════════════════════════════════════════════════════════════════════════
// Recipe extraction from arbitrary web pages (fallback when no parser works)
// ════════════════════════════════════════════════════════════════════════

export interface AiRecipeExtraction {
  title?: string
  servings?: number
  ingredients: string[]
  instructions: string[]
  ingredientSelector?: string
  instructionSelector?: string
  titleSelector?: string
  servingsSelector?: string
}

const RECIPE_EXTRACT_TOOL = {
  name: 'submit_recipe',
  description: 'Lämna in receptet som hittades på sidan samt CSS-selektorer för att hitta det igen.',
  input_schema: {
    type: 'object',
    properties: {
      found: { type: 'boolean', description: 'false om sidan inte innehåller något recept.' },
      title: { type: 'string', description: 'Receptets namn, exakt som på sidan.' },
      servings: { type: 'integer', description: 'Antal portioner receptet är skrivet för (gissa 4 om det inte anges).' },
      ingredients: {
        type: 'array',
        items: { type: 'string' },
        description: 'Varje ingrediensrad ordagrant som den står på sidan, med mängd och enhet (t.ex. "2 dl grädde"). Ta inte med rubriker.',
      },
      instructions: {
        type: 'array',
        items: { type: 'string' },
        description: 'Tillagningsstegen ordagrant från sidan, ett steg per element.',
      },
      ingredientSelector: {
        type: 'string',
        description: 'CSS-selektor för document.querySelectorAll där VARJE träff är exakt en ingrediensrad (t.ex. ".recipe-ingredients li"). Om alla ingredienser ligger i ett och samma element åtskilda av <br>, välj det elementet.',
      },
      instructionSelector: {
        type: 'string',
        description: 'CSS-selektor där varje träff är ett tillagningssteg (eller ett element som innehåller alla steg som stycken).',
      },
      titleSelector: { type: 'string', description: 'CSS-selektor för receptets rubrik.' },
      servingsSelector: { type: 'string', description: 'CSS-selektor för elementet som anger antal portioner, om sådant finns.' },
    },
    required: ['found', 'ingredients', 'instructions', 'ingredientSelector'],
  },
} as const

const RECIPE_EXTRACT_SYSTEM = `Du extraherar recept från HTML för en svensk matplaneringsapp. Du får förenklad HTML (skript och stilar borttagna, bara attributen class, id och itemprop kvar).

1. Hitta receptet på sidan: titel, antal portioner, ingredienser och tillagningssteg. Skriv av texten ordagrant – översätt eller ändra inget.
2. Ange också CSS-selektorer som appen kan använda för att hämta samma delar från andra recept på SAMMA webbplats utan din hjälp. Selektorerna ska därför vara generella för sajtens mall:
   - Använd stabila klassnamn, id:n eller itemprop som beskriver innehållet (t.ex. "ingredient", "instructions", "recipe").
   - Undvik :nth-child, autogenererade hash-klasser (t.ex. "css-1x2y3z", "sc-abc123") och id:n som innehåller receptets namn eller nummer.
   - Ingrediensselektorn måste matcha ingrediensraderna och inget annat (inga rubriker, inga knappar).
3. Om sidan inte innehåller något recept, sätt found=false och lämna tomma listor.`

/** Strips a page down to the markup that matters for finding a recipe. */
function simplifyHtmlForAi(html: string, maxChars = 90_000): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('script, style, noscript, svg, iframe, link, meta, img, picture, video, source, form, button, input, select, textarea, template')
    .forEach(el => el.remove())
  doc.querySelectorAll('*').forEach(el => {
    for (const attr of [...el.attributes]) {
      if (!['class', 'id', 'itemprop'].includes(attr.name)) el.removeAttribute(attr.name)
    }
  })
  // Drop HTML comments
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_COMMENT)
  const comments: Node[] = []
  while (walker.nextNode()) comments.push(walker.currentNode)
  comments.forEach(c => c.parentNode?.removeChild(c))

  const compact = (s: string) => s.replace(/\s+/g, ' ').replace(/> </g, '><').trim()
  let out = compact(doc.body.innerHTML)
  if (out.length > maxChars) {
    // Prefer the main content area if the page is huge
    const main = doc.querySelector('main, article, [role="main"]')
    if (main) out = compact(main.outerHTML)
  }
  if (out.length > maxChars) {
    // Centre the window on the ingredient section if we can find it
    const idx = out.search(/ingrediens|ingredient|zutaten|ingrédients/i)
    const start = idx > maxChars / 3 ? idx - Math.floor(maxChars / 3) : 0
    out = out.slice(start, start + maxChars)
  }
  return out
}

export async function extractRecipeWithAi(
  url: string,
  html: string,
  settings: AppSettings,
): Promise<AiRecipeExtraction> {
  const apiKey = settings.anthropicApiKey?.trim()
  if (!apiKey) {
    throw new Error('Kunde inte tolka receptet på sidan. Lägg till en Anthropic API-nyckel under Inställningar så kan AI tolka okända sajter.')
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: ANTHROPIC_HEADERS(apiKey),
    body: JSON.stringify({
      model: MODEL_IDS[settings.aiModel ?? 'haiku'],
      max_tokens: 8192,
      system: RECIPE_EXTRACT_SYSTEM,
      tools: [RECIPE_EXTRACT_TOOL],
      tool_choice: { type: 'tool', name: 'submit_recipe' },
      messages: [
        {
          role: 'user',
          content: `URL: ${url}\n\nHTML:\n${simplifyHtmlForAi(html)}`,
        },
      ],
    }),
  })

  if (!res.ok) await throwApiError(res)

  const data = await res.json() as {
    content: Array<{ type: string; name?: string; input?: unknown }>
  }
  const toolUse = data.content.find(c => c.type === 'tool_use' && c.name === 'submit_recipe')
  if (!toolUse?.input) throw new Error('AI returnerade inget giltigt svar.')

  const r = toolUse.input as Partial<AiRecipeExtraction> & { found?: boolean }
  const strList = (v: unknown) =>
    Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string' && s.trim() !== '').map(s => s.trim()) : []
  const optStr = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)

  const ingredients = strList(r.ingredients)
  if (r.found === false || ingredients.length === 0) {
    throw new Error('Hittade inget recept på sidan (inte ens med AI).')
  }

  return {
    title: optStr(r.title),
    servings: typeof r.servings === 'number' && r.servings > 0 ? Math.round(r.servings) : undefined,
    ingredients,
    instructions: strList(r.instructions),
    ingredientSelector: optStr(r.ingredientSelector),
    instructionSelector: optStr(r.instructionSelector),
    titleSelector: optStr(r.titleSelector),
    servingsSelector: optStr(r.servingsSelector),
  }
}
