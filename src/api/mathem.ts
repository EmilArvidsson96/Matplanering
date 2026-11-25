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
  promotion?: unknown
  discount?: unknown
  availability?: { is_available?: boolean }
  client_classifiers?: Array<{ name?: string }>
  images?: Array<{ thumbnail?: { url?: string } }>
  front_url?: string
}

function searchUrl(query: string): string {
  const path = `/api/v1/search/mixed/?q=${encodeURIComponent(query)}`
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
    onSale: !!(a.promotion || a.discount),
    tags: (a.client_classifiers ?? []).map(c => c.name ?? '').filter(n => n && !/färskvarugaranti/i.test(n)),
    imageUrl: a.images?.[0]?.thumbnail?.url,
    url: a.front_url ?? `${MATHEM}/se/products/${a.id}/`,
  }
}

const searchCache = new Map<string, Promise<MathemProduct[]>>()

/** Available products for a query, in Mathem's ranking order. Cached per session. */
export function searchMathem(query: string, limit = 8): Promise<MathemProduct[]> {
  const key = query.trim().toLowerCase()
  const cached = searchCache.get(key)
  if (cached) return cached.then(list => list.slice(0, limit))

  const p = (async () => {
    const res = await fetch(searchUrl(key), { headers: { accept: 'application/json' } })
    if (!res.ok) throw new Error(`Mathem-sök misslyckades (${res.status})`)
    const data = await res.json() as { items?: Array<{ type: string; attributes: RawProduct }> }
    return (data.items ?? [])
      .filter(i => i.type === 'product' && i.attributes.availability?.is_available !== false)
      .map(i => toProduct(i.attributes))
  })()
  searchCache.set(key, p)
  p.catch(() => searchCache.delete(key))
  return p.then(list => list.slice(0, limit))
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
