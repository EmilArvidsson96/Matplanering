/**
 * Willys (Axfood) — product search and cart hand-off.
 *
 * Search is public JSON (willys.se/search?q=…) but Willys refuses requests
 * that carry another site's Origin, so prod goes through the recipe-proxy
 * Worker (it doesn't forward Origin) and dev through the Vite proxy
 * (`/willys-api`, Origin removed). Prices online are the same for the whole
 * country, so there's no store to pick. Adding to the cart needs the user's
 * Willys login and runs on willys.se itself, via the bookmarklet in shops.ts.
 * See docs/willys.md.
 */
import type { StoreProduct } from './shops'

const PROD_PROXY = 'https://matplanering-recipe-proxy.emil-arvidsson.workers.dev/?url='
export const WILLYS = 'https://www.willys.se'

interface RawPromotion {
  campaignType?: string           // GENERAL, LOYALTY (Willys Plus)
  conditionLabelFormatted?: string // "2 för"
  rewardLabel?: string            // "30,00" or "119/kg"
}

interface RawProduct {
  code: string                    // "101895177_ST", "100269139_KG" (sold by weight)
  name: string
  manufacturer?: string | null
  productLine2?: string           // "GARANT, 5dl" or "ca: 175g"
  displayVolume?: string          // "5dl", "ca: 175g"
  priceValue: number              // per piece, or per kg for _KG items
  priceUnit?: string              // "kr/st", "kr/kg"
  averageWeight?: number | null   // kg per piece for _KG items
  comparePrice?: string           // "55,80 kr"
  comparePriceUnit?: string       // "l"
  labels?: string[]
  potentialPromotions?: RawPromotion[]
  thumbnail?: { url?: string } | null
  image?: { url?: string } | null
  outOfStock?: boolean
  online?: boolean
}

function apiUrl(path: string): string {
  return import.meta.env.DEV
    ? `/willys-api${path}`
    : PROD_PROXY + encodeURIComponent(WILLYS + path)
}

const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase())
const money = (s: string) => s.replace(/,00\b/, '')

/** "2 för" + "30,00" → "2 för 30 kr"; "119/kg" → "119 kr/kg". */
function offerText(p: RawPromotion): string | undefined {
  const reward = (p.rewardLabel ?? '').trim()
  if (!reward) return undefined
  const perUnit = reward.match(/^([\d,]+)\/(\w+)$/)
  const price = perUnit ? `${money(perUnit[1])} kr/${perUnit[2]}` : `${money(reward)} kr`
  const cond = (p.conditionLabelFormatted ?? '').trim()
  return cond ? `${cond} ${price}` : `Nu ${price}`
}

/** "5dl" → "5 dl", "ca: 175g" → "ca 175 g". */
function tidyPack(s: string): string {
  return s.replace(/:/g, '').replace(/(\d)([a-zA-Z])/g, '$1 $2').trim()
}

export function toProduct(r: RawProduct): StoreProduct {
  const labels = r.labels ?? []
  const tags: string[] = []
  if (labels.some(l => /sweden|swedish/.test(l))) tags.push('Från Sverige')
  if (labels.some(l => /ecological|krav/.test(l)) || /\beko\b|ekologisk/i.test(r.name)) tags.push('Ekologisk')
  if (labels.includes('laktosfree') || /laktosfri/i.test(r.name)) tags.push('Laktosfri')

  const line = r.productLine2 ?? ''
  const brand = r.manufacturer || (line.includes(',') ? line.split(',')[0] : '')
  const byWeight = /kr\/kg/i.test(r.priceUnit ?? '') && !!r.averageWeight
  const general = (r.potentialPromotions ?? []).find(p => p.campaignType !== 'LOYALTY' && offerText(p))
  const loyalty = (r.potentialPromotions ?? []).find(p => p.campaignType === 'LOYALTY' && offerText(p))

  return {
    id: r.code,
    name: brand ? `${r.name}, ${titleCase(brand)}` : r.name,
    // Sold by weight: one piece of about averageWeight kg.
    packSize: byWeight ? `ca ${Math.round(r.averageWeight! * 1000)} g` : tidyPack(r.displayVolume ?? ''),
    price: byWeight ? Math.round(r.priceValue * r.averageWeight! * 100) / 100 : r.priceValue,
    unitPrice: r.comparePrice ? `${r.comparePrice}/${r.comparePriceUnit ?? ''}` : '',
    onSale: !!general,
    offer: general ? offerText(general) : loyalty ? `Willys Plus: ${offerText(loyalty)}` : undefined,
    tags,
    imageUrl: r.thumbnail?.url ?? r.image?.url,
    url: `${WILLYS}/produkt/${r.code}`,
  }
}

// ── Local cache (this browser) ────────────────────────────────────────────

const SEARCHES_KEY = 'matplan.willys.searches.v1'
const SEARCH_TTL = 24 * 3600_000
const MAX_SEARCHES = 600

interface CachedSearch { products: StoreProduct[]; at: number }

const searches: Record<string, CachedSearch> = (() => {
  try { return JSON.parse(localStorage.getItem(SEARCHES_KEY) ?? '{}') } catch { return {} }
})()
let saveTimer: ReturnType<typeof setTimeout> | undefined

function persistSoon() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const keys = Object.keys(searches)
    if (keys.length > MAX_SEARCHES) {
      keys.sort((a, b) => searches[a].at - searches[b].at)
      for (const k of keys.slice(0, keys.length - MAX_SEARCHES)) delete searches[k]
    }
    try { localStorage.setItem(SEARCHES_KEY, JSON.stringify(searches)) } catch { /* only a speed-up */ }
  }, 500)
}

const keyOf = (q: string) => q.trim().toLowerCase()

/** Cached hits for a query, if fresh. */
export function cachedWillys(query: string): StoreProduct[] | undefined {
  const hit = searches[keyOf(query)]
  return hit && Date.now() - hit.at < SEARCH_TTL ? hit.products : undefined
}

const inflight = new Map<string, Promise<StoreProduct[]>>()

/** Products in stock for a query, in Willys' ranking order. Cached locally for a day. */
export async function searchWillys(query: string, limit = 12): Promise<StoreProduct[]> {
  const key = keyOf(query)
  const hit = cachedWillys(key)
  if (hit) return hit.slice(0, limit)
  let p = inflight.get(key)
  if (!p) {
    p = (async () => {
      const res = await fetch(apiUrl(`/search?q=${encodeURIComponent(key)}&size=20`), { headers: { accept: 'application/json' } })
      if (!res.ok) throw new Error(`Willys-sök misslyckades (${res.status})`)
      const data = await res.json() as { results?: RawProduct[] }
      const list = (data.results ?? []).filter(r => r.online !== false && !r.outOfStock).map(toProduct)
      searches[key] = { products: list, at: Date.now() }
      persistSoon()
      return list
    })()
    inflight.set(key, p)
    p.finally(() => inflight.delete(key)).catch(() => {})
  }
  return (await p).slice(0, limit)
}

// ── Cart hand-off ──────────────────────────────────────────────────────────

/** willys.se carrying the plan in the hash, read by the bookmarklet. */
export function willysCartHandoffUrl(lines: Array<{ productId: string; quantity: number }>): string {
  return `${WILLYS}/#matplan=${btoa(JSON.stringify(lines.map(l => [l.productId, l.quantity])))}`
}

export function willysCartClaudePrompt(lines: Array<{ productId: string; quantity: number; label: string }>): string {
  return [
    'Lägg följande produkter i min Willys-varukorg (jag är inloggad på willys.se i Chrome).',
    'Gör det med anrop från en flik på www.willys.se:',
    'hämta token med GET /axfood/rest/csrf-token, sedan POST /axfood/rest/cart/addProducts med header x-csrf-token = token och body',
    '{"products":[{"productCodePost":…,"qty":…,"pickUnit":"pieces","hideDiscountToolTip":false,"noReplacementFlag":false}]}.',
    'Antalet läggs till det som redan finns i korgen. Lägg inte en beställning.',
    '',
    JSON.stringify(lines.map(l => ({ productCodePost: l.productId, qty: l.quantity, vara: l.label }))),
  ].join('\n')
}
