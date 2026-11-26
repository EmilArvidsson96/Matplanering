/**
 * ICA — product search with prices (ICA Handla), cart hand-off and
 * shopping-list hand-off. See docs/ica.md.
 *
 * Search + prices go through the recipe-proxy Worker (`/ica/search`), which
 * keeps an anonymous ICA Handla session for the CSRF-protected price lookup.
 * In dev the Vite server runs the same code under `/ica-api`. Filling the
 * cart or the list needs the user's own ICA login, so those steps run on
 * ICA's pages via the bookmarklet in shops.ts.
 */

const PROD_WORKER = 'https://matplanering-recipe-proxy.emil-arvidsson.workers.dev/ica'
export const ICA_HANDLA = 'https://handlaprivatkund.ica.se'
export const DEFAULT_ICA_STORE = { id: '1003415', name: 'Maxi ICA Stormarknad Häggvik' }

export interface IcaProduct {
  id: string                 // product UUID (used by the cart)
  retailerProductId: string  // ICA article number
  name: string
  brand: string
  packSize: string           // e.g. "0.5L", "1kg"
  price: number
  unitPrice: string
  country: string
  available: boolean
  offers: string[]           // e.g. ["3 för 56 kr"]
  image?: string
}

function base(): string {
  return import.meta.env.DEV ? '/ica-api' : PROD_WORKER
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(base() + path, { headers: { accept: 'application/json' } })
  const data = await res.json().catch(() => ({})) as T & { error?: string }
  if (!res.ok) throw new Error(`ICA svarade inte (${res.status}${data.error ? `: ${data.error}` : ''})`)
  return data
}

const searchCache = new Map<string, Promise<IcaProduct[]>>()

/** Products for a query in one store, with that store's prices. Cached per session. */
export function searchIca(store: string, query: string, limit = 8): Promise<IcaProduct[]> {
  const key = `${store}|${query.trim().toLowerCase()}`
  const cached = searchCache.get(key)
  if (cached) return cached.then(list => list.slice(0, limit))
  const p = getJson<{ products: IcaProduct[] }>(
    `/search?store=${store}&limit=${Math.max(limit, 8)}&q=${encodeURIComponent(query.trim())}`,
  ).then(d => (d.products ?? []).filter(x => x.available))
  searchCache.set(key, p)
  p.catch(() => searchCache.delete(key))
  return p.then(list => list.slice(0, limit))
}

/** Specific products (e.g. earlier choices) in one store. */
export async function icaProducts(store: string, ids: string[]): Promise<IcaProduct[]> {
  if (ids.length === 0) return []
  const d = await getJson<{ products: IcaProduct[] }>(`/products?store=${store}&ids=${ids.join(',')}`)
  return d.products ?? []
}

/** Bytes-safe base64 for JSON with å/ä/ö (read back by the bookmarklet). */
export function toBase64Json(value: unknown): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(value))))
}

/** ICA Handla basket page carrying the plan, read by the bookmarklet. */
export function icaCartHandoffUrl(store: string, lines: Array<{ productId: string; quantity: number }>): string {
  return `${ICA_HANDLA}/stores/${store}/basket#matplan=${toBase64Json(lines.map(l => [l.productId, l.quantity]))}`
}

/** ica.se shopping-list page carrying the list name and rows, read by the bookmarklet. */
export function icaListHandoffUrl(listName: string, rows: string[]): string {
  return `https://www.ica.se/inkopslista/#matplanlista=${toBase64Json({ n: listName, r: rows })}`
}

export function icaCartClaudePrompt(store: string, lines: Array<{ productId: string; quantity: number; label: string }>): string {
  return [
    `Lägg följande produkter i min ICA Handla-varukorg (butik ${store}, jag är inloggad på handlaprivatkund.ica.se i Chrome).`,
    `Gör det med ett anrop från en flik på ${ICA_HANDLA}/stores/${store}/:`,
    `POST /stores/${store}/api/cart/v1/carts/active/apply-quantity med body [{"productId":…,"quantity":…}]`,
    'och header x-csrf-token = session.csrf.token i sidans window.__INITIAL_STATE__ (inline-skriptet).',
    'quantity läggs till det som redan finns i korgen. Lägg inte en beställning.',
    '',
    JSON.stringify(lines.map(l => ({ productId: l.productId, quantity: l.quantity, vara: l.label }))),
  ].join('\n')
}

export function icaListClaudePrompt(listName: string, rows: string[]): string {
  return [
    `Lägg följande varor i min ICA-inköpslista "${listName}" (jag är inloggad på ica.se i Chrome).`,
    'Från en flik på www.ica.se: hämta token med GET /api/user/information (accessToken),',
    'sedan med Authorization: Bearer <token> mot https://apim-pub.gw.ica.se/sverige/digx/shopping-list/v1/api:',
    `finns listan i GET /list/all, lägg till varje rad som saknas med POST /list/{id}/row {"text":…};`,
    `annars skapa den med POST /list {"name":"${listName}","rows":[{"text":…}]}.`,
    '',
    JSON.stringify(rows),
  ].join('\n')
}
