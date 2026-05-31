/** Anthropic API — calls the Messages API directly from the browser. */

import type { AiModel, AppSettings, ShoppingCategory, ShoppingItem } from '../types'
import { LEX_BY_NAME } from '../data/ingredientLexicon'

const MODEL_IDS: Record<AiModel, string> = {
  haiku: 'claude-haiku-4-5',
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-7',
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
