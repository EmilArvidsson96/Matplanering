/** Anthropic API — calls the Messages API directly from the browser. */

import type { AiModel, AppSettings, ShoppingCategory, ShoppingItem } from '../types'

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
