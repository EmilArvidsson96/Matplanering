/**
 * Mathem (Oda platform) — product search and cart hand-off.
 *
 * Search is public (no login) but the API sends no CORS headers, so in
 * production it goes through the recipe-proxy Worker and in dev through the
 * Vite proxy (`/mathem-api`). Adding to the cart needs the user's Mathem
 * session + CSRF token, so that step runs on mathem.se itself, via the
 * bookmarklet below (or Claude driving Chrome). See docs/mathem-cart.md.
 */

const PROD_PROXY = 'https://matplanering-recipe-proxy.emil-arvidsson.workers.dev/?url='
const MATHEM = 'https://www.mathem.se'

export interface MathemProduct {
  id: number
  name: string          // full_name, e.g. "Arla Köket® Vispgrädde 36%"
  packSize: string      // name_extra, e.g. "5 dl"
  price: number         // SEK per pack
  unitPrice: string     // e.g. "48.00 kr/l"
  onSale: boolean
  /** Store labels, e.g. "Lactose free", "Från Sverige", "Ekologisk". */
  tags: string[]
  imageUrl?: string
  url: string
}

interface RawProduct {
  id: number
  full_name: string
  name_extra?: string
  gross_price: string
  gross_unit_price?: string
  unit_price_quantity_abbreviation?: string
  promotion?: { title?: string } | null
  discount?: { is_discounted?: boolean } | null
  availability?: { is_available?: boolean }
  client_classifiers?: Array<{ name?: string }>
  images?: Array<{ thumbnail?: { url?: string } }>
  front_url?: string
}

function apiUrl(path: string): string {
  return import.meta.env.DEV
    ? `/mathem-api${path}`
    : PROD_PROXY + encodeURIComponent(MATHEM + path)
}

function toProduct(a: RawProduct): MathemProduct {
  return {
    id: a.id,
    name: a.full_name,
    packSize: a.name_extra ?? '',
    price: Number(a.gross_price),
    unitPrice: a.gross_unit_price
      ? `${a.gross_unit_price} kr/${a.unit_price_quantity_abbreviation ?? ''}`
      : '',
    // "Prismatch" is also a promotion but not an offer, so only count real discounts.
    onSale: !!a.discount?.is_discounted || /extrapris/i.test(a.promotion?.title ?? ''),
    tags: (a.client_classifiers ?? []).map(c => c.name ?? '').filter(n => n && !/färskvarugaranti/i.test(n)),
    imageUrl: a.images?.[0]?.thumbnail?.url,
    url: a.front_url ?? `${MATHEM}/se/products/${a.id}/`,
  }
}

// ── Local cache (this browser) ────────────────────────────────────────────
//
// Products are kept by id (name, pack, image and tags rarely change; price
// and extrapris are refreshed whenever a search returns the product again).
// Search hits are kept as id lists for SEARCH_TTL, so reopening the page or
// switching alternatives never refetches.

const PRODUCTS_KEY = 'matplan.mathem.products.v2'
const SEARCHES_KEY = 'matplan.mathem.searches.v2'
const SEARCH_TTL = 24 * 3600_000
const MAX_PRODUCTS = 4000
const MAX_SEARCHES = 600

type Stored<T> = Record<string, T>
interface CachedProduct extends MathemProduct { seenAt: number }
interface CachedSearch { ids: number[]; at: number }

function readStore<T>(key: string): Stored<T> {
  try { return JSON.parse(localStorage.getItem(key) ?? '{}') as Stored<T> } catch { return {} }
}

const products: Stored<CachedProduct> = readStore(PRODUCTS_KEY)
const searches: Stored<CachedSearch> = readStore(SEARCHES_KEY)
let saveTimer: ReturnType<typeof setTimeout> | undefined

function prune<T>(map: Stored<T>, max: number, age: (t: T) => number) {
  const keys = Object.keys(map)
  if (keys.length <= max) return
  keys.sort((a, b) => age(map[a]) - age(map[b]))
  for (const k of keys.slice(0, keys.length - max)) delete map[k]
}

function persistSoon() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    prune(products, MAX_PRODUCTS, p => p.seenAt)
    prune(searches, MAX_SEARCHES, s => s.at)
    try {
      localStorage.setItem(PRODUCTS_KEY, JSON.stringify(products))
      localStorage.setItem(SEARCHES_KEY, JSON.stringify(searches))
    } catch { /* storage full or blocked: the cache is only a speed-up */ }
  }, 500)
}

function remember(list: MathemProduct[]) {
  const now = Date.now()
  for (const p of list) products[p.id] = { ...p, seenAt: now }
  persistSoon()
}

/** A product we've seen in this browser, if any. */
export function cachedProduct(id: number): MathemProduct | undefined {
  return products[id]
}

const inflight = new Map<string, Promise<MathemProduct[]>>()

/** Available products for a query, in Mathem's ranking order. Cached locally for a day. */
export async function searchMathem(query: string, limit = 8): Promise<MathemProduct[]> {
  const key = query.trim().toLowerCase()
  const hit = searches[key]
  if (hit && Date.now() - hit.at < SEARCH_TTL && hit.ids.every(id => products[id])) {
    return hit.ids.slice(0, limit).map(id => products[id])
  }

  let p = inflight.get(key)
  if (!p) {
    p = (async () => {
      const res = await fetch(apiUrl(`/api/v1/search/mixed/?q=${encodeURIComponent(key)}`), { headers: { accept: 'application/json' } })
      if (!res.ok) throw new Error(`Mathem-sök misslyckades (${res.status})`)
      const data = await res.json() as { items?: Array<{ type: string; attributes: RawProduct }> }
      const list = (data.items ?? [])
        .filter(i => i.type === 'product' && i.attributes.availability?.is_available !== false)
        .map(i => toProduct(i.attributes))
        .slice(0, 20)
      remember(list)
      searches[key] = { ids: list.map(x => x.id), at: Date.now() }
      persistSoon()
      return list
    })()
    inflight.set(key, p)
    p.finally(() => inflight.delete(key)).catch(() => {})
  }
  return (await p).slice(0, limit)
}

/** One product by id: from the local cache when we have it, else from Mathem. */
export async function getMathemProduct(id: number): Promise<MathemProduct | null> {
  if (products[id]) return products[id]
  try {
    const res = await fetch(apiUrl(`/api/v1/products/${id}/`), { headers: { accept: 'application/json' } })
    if (!res.ok) return null
    const raw = await res.json() as RawProduct & { attributes?: RawProduct }
    const a = raw.full_name ? raw : raw.attributes
    if (!a?.id || !a.full_name) return null
    const p = toProduct(a)
    remember([p])
    return p
  } catch {
    return null
  }
}

// ── Cart hand-off ──────────────────────────────────────────────────────────

export interface CartLine { productId: number; quantity: number }

/** Mathem cart URL carrying the plan in the hash, read by the bookmarklet. */
export function cartHandoffUrl(lines: CartLine[]): string {
  const compact = lines.map(l => [l.productId, l.quantity])
  return `${MATHEM}/se/cart/#matplan=${btoa(JSON.stringify(compact))}`
}

/**
 * Bookmarklet run on mathem.se: reads #matplan=…, POSTs it to the cart with
 * the page's own session + CSRF token, clears the hash so a second click
 * can't add everything twice, and reloads the cart.
 */
export const MATHEM_BOOKMARKLET = 'javascript:' + encodeURIComponent(`(async()=>{
const m=location.hash.match(/matplan=([^&]+)/);
if(!m){alert('Ingen inköpslista hittades. Öppna Mathem via knappen i Matplanering först.');return}
let plan;try{plan=JSON.parse(atob(decodeURIComponent(m[1])))}catch(e){alert('Kunde inte läsa listan.');return}
const c=document.cookie.match(/csrftoken=([^;]+)/);
const r=await fetch('/api/v1/cart/items/',{method:'POST',credentials:'include',headers:{'content-type':'application/json',accept:'application/json','x-csrftoken':c?c[1]:''},body:JSON.stringify({items:plan.map(p=>({product_id:p[0],quantity:p[1]}))})});
history.replaceState(null,'',location.pathname+location.search);
if(r.ok){alert('Klart! '+plan.length+' produkter lades i korgen.');location.reload()}
else alert('Mathem svarade '+r.status+'. Är du inloggad på mathem.se?')
})()`)

/** Instructions + plan for Claude (desktop app with Chrome control). */
export function claudeCartPrompt(lines: Array<CartLine & { label: string }>): string {
  return [
    'Lägg följande produkter i min Mathem-kundkorg (jag är inloggad på mathem.se i Chrome).',
    'Gör det med ett anrop från en mathem.se-flik:',
    "POST /api/v1/cart/items/ med body {\"items\":[{\"product_id\":…,\"quantity\":…}]} och header x-csrftoken = cookien csrftoken.",
    'quantity läggs till det som redan finns i korgen. Lägg inte en beställning.',
    '',
    JSON.stringify(lines.map(l => ({ product_id: l.productId, quantity: l.quantity, vara: l.label }))),
  ].join('\n')
}
