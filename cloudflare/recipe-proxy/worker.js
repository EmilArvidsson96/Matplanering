// CORS proxy for fetchRecipeFromUrl() in src/utils/recipeFetcher.ts.
// Fetches ?url= server-side and returns the body with CORS headers so the
// browser can read a response that the target site itself doesn't send
// Access-Control-Allow-Origin for.

//
// Also: GET /ica/search?store=<nr>&q=<text>&limit=8,
//       GET /ica/batch?store=<nr>&q=<a>&q=<b>… (up to 10 queries, one price lookup) and
//       GET /ica/products?store=<nr>&ids=<uuid>,<uuid>
// ICA Handla product search with prices for one store (see handleIca below).

const ALLOWED_ORIGIN = 'https://emilarvidsson96.github.io'

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() })
    }

    const reqUrl = new URL(request.url)
    if (reqUrl.pathname.startsWith('/ica/')) {
      const { status, body } = await handleIca(reqUrl)
      return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders(), 'content-type': 'application/json; charset=utf-8' },
      })
    }

    const target = new URL(request.url).searchParams.get('url')
    if (!target) {
      return new Response('Missing url parameter', { status: 400, headers: corsHeaders() })
    }

    let targetUrl
    try {
      targetUrl = new URL(target)
    } catch {
      return new Response('Invalid url parameter', { status: 400, headers: corsHeaders() })
    }

    if (targetUrl.protocol !== 'https:') {
      return new Response('Only https:// targets are allowed', { status: 400, headers: corsHeaders() })
    }

    if (isDisallowedHost(targetUrl.hostname)) {
      return new Response('Target host not allowed', { status: 403, headers: corsHeaders() })
    }

    const upstream = await fetch(targetUrl.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MatplaneringRecipeFetcher/1.0)' },
      redirect: 'follow',
    })

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        ...corsHeaders(),
        'content-type': upstream.headers.get('content-type') || 'text/plain',
      },
    })
  },
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': '*',
  }
}

// Basic SSRF guard: refuse to proxy to loopback/link-local/private targets.
function isDisallowedHost(hostname) {
  const h = hostname.toLowerCase()
  if (h === 'localhost' || h === '169.254.169.254') return true

  const ipv4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!ipv4) return false

  const [a, b] = ipv4.slice(1, 3).map(Number)
  return (
    a === 127 ||
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  )
}

// ── ICA Handla (handlaprivatkund.ica.se, Ocado platform) ──────────────────
//
// Search is a public GET, but it returns only product ids. Prices and names
// come from a PUT that needs a session cookie + CSRF token, which any store
// page hands out to anonymous visitors. We cache that anonymous session per
// store for a few minutes. No customer login is involved. Exported so the
// Vite dev server can run the same code (see vite.config.ts).
//
// ICA rate-limits automated traffic: its firewall answers 202 (a browser
// check) when there are too many requests. We respect that instead of working
// around it: few requests (a batch of queries shares one price lookup, every
// answer is cached for 12 h), and on a 202 we stop and tell the app, which
// waits several minutes before asking again.

const ICA = 'https://handlaprivatkund.ica.se'
const ICA_UA = 'Mozilla/5.0 (compatible; Matplanering/1.0; household meal planner)'
const SESSION_TTL_MS = 10 * 60 * 1000
const CACHE_SECONDS = 12 * 60 * 60
const BATCH_MAX = 10
const icaSessions = new Map()   // store → { cookie, csrf, at }

class RateLimited extends Error {
  constructor() { super('ICA is rate-limiting (202), try again in a few minutes'); this.rateLimited = true }
}

export async function handleIca(url) {
  const store = url.searchParams.get('store') ?? ''
  if (!/^\d{3,8}$/.test(store)) return { status: 400, body: { error: 'store must be an ICA store number' } }
  const limit = Math.min(Number(url.searchParams.get('limit')) || 8, 20)
  try {
    if (url.pathname === '/ica/search') {
      const q = (url.searchParams.get('q') ?? '').trim()
      if (!q) return { status: 400, body: { error: 'q is required' } }
      const [r] = await icaBatch(store, [q], limit)
      if (r.error) return { status: r.rateLimited ? 429 : 502, body: { error: r.error, rateLimited: !!r.rateLimited } }
      return { status: 200, body: { products: r.products } }
    }
    if (url.pathname === '/ica/batch') {
      const qs = [...new Set(url.searchParams.getAll('q').map(q => q.trim()).filter(Boolean))].slice(0, BATCH_MAX)
      if (!qs.length) return { status: 400, body: { error: 'q is required' } }
      return { status: 200, body: { results: await icaBatch(store, qs, limit) } }
    }
    if (url.pathname === '/ica/products') {
      const ids = (url.searchParams.get('ids') ?? '').split(',').filter(id => /^[0-9a-f-]{36}$/.test(id)).slice(0, 30)
      return { status: 200, body: { products: ids.length ? (await icaProducts(store, ids)).map(toIcaProduct) : [] } }
    }
    return { status: 404, body: { error: 'unknown ICA route' } }
  } catch (e) {
    return { status: e && e.rateLimited ? 429 : 502, body: { error: String(e && e.message || e), rateLimited: !!(e && e.rateLimited) } }
  }
}

/** Search several queries: cached ones cost nothing, the rest share one price lookup. */
async function icaBatch(store, queries, limit) {
  const results = new Map()
  const fresh = []
  for (const q of queries) {
    const hit = await cacheGet(cacheKey(store, q, limit))
    if (hit) results.set(q, { q, products: hit, cached: true })
    else fresh.push(q)
  }

  const idsByQuery = new Map()
  for (const [i, q] of fresh.entries()) {
    if (i > 0) await sleep(500)
    try {
      idsByQuery.set(q, await icaSearchIds(store, q, limit))
    } catch (e) {
      // Rate-limited: stop here; the rest of the batch waits for a later call.
      const rest = e.rateLimited ? fresh.slice(i) : [q]
      for (const r of rest) results.set(r, { q: r, error: String(e.message || e), rateLimited: !!e.rateLimited })
      if (e.rateLimited) break
    }
  }

  const allIds = [...new Set([...idsByQuery.values()].flat())]
  if (allIds.length) {
    try {
      const byId = new Map((await icaProducts(store, allIds)).map(p => [p.productId, p]))
      for (const [q, ids] of idsByQuery) {
        if (!ids.length) continue
        const products = ids.map(id => byId.get(id)).filter(Boolean).map(toIcaProduct)
        results.set(q, { q, products })
        await cachePut(cacheKey(store, q, limit), products)
      }
    } catch (e) {
      for (const [q, ids] of idsByQuery) if (ids.length) results.set(q, { q, error: String(e.message || e), rateLimited: !!e.rateLimited })
    }
  }
  for (const [q, ids] of idsByQuery) {
    if (!ids.length) { results.set(q, { q, products: [] }); await cachePut(cacheKey(store, q, limit), []) }
  }
  return queries.map(q => results.get(q) ?? { q, error: 'no result' })
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function icaFetch(url, init) {
  const res = await fetch(url, init)
  if (res.status === 202 || res.status === 429) throw new RateLimited()
  return res
}

async function icaSearchIds(store, q, limit) {
  const res = await icaFetch(`${ICA}/stores/${store}/api/webproductpagews/v6/product-pages/search?q=${encodeURIComponent(q)}&maxPageSize=${limit}`, {
    headers: { 'user-agent': ICA_UA, accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`ICA search ${res.status}`)
  const data = await res.json()
  const ids = []
  for (const g of data.productGroups ?? []) {
    for (const p of g.decoratedProducts ?? []) if (p.productId) ids.push(p.productId)
    for (const id of g.otherProductIds ?? []) ids.push(id)
  }
  return [...new Set(ids)].slice(0, limit)
}

async function icaSession(store, fresh = false) {
  const cached = icaSessions.get(store)
  if (!fresh && cached && Date.now() - cached.at < SESSION_TTL_MS) return cached
  // A missing page is the lightest one that still carries the CSRF token.
  const res = await icaFetch(`${ICA}/stores/${store}/matplanering`, { headers: { 'user-agent': ICA_UA, accept: 'text/html' } })
  const html = await res.text()
  const csrf = html.match(/"csrf":\{"token":"([^"]+)"/)?.[1]
  if (!csrf) throw new Error(`ICA session failed (${res.status})`)
  const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [res.headers.get('set-cookie') ?? '']
  const cookie = setCookies.map(c => c.split(';')[0]).filter(Boolean).join('; ')
  const session = { cookie, csrf, at: Date.now() }
  icaSessions.set(store, session)
  return session
}

/** Raw ICA products for these ids, in one request. */
async function icaProducts(store, ids) {
  for (const fresh of [false, true]) {
    const s = await icaSession(store, fresh)
    const res = await icaFetch(`${ICA}/stores/${store}/api/webproductpagews/v6/products`, {
      method: 'PUT',
      headers: {
        'user-agent': ICA_UA, accept: 'application/json', 'content-type': 'application/json',
        'x-csrf-token': s.csrf, cookie: s.cookie,
      },
      body: JSON.stringify(ids),
    })
    if ((res.status === 401 || res.status === 403) && !fresh) continue
    if (!res.ok) throw new Error(`ICA products ${res.status}`)
    const data = await res.json()
    if (!(data.products ?? []).length) throw new Error('ICA returned no product details')
    return data.products
  }
  return []
}

// ── Cache (Workers Cache API; a no-op in Node) ──
function cacheKey(store, q, limit) {
  return `https://ica-cache.matplanering/${store}/${limit}/${encodeURIComponent(q.toLowerCase())}`
}
async function cacheGet(key) {
  if (typeof caches === 'undefined') return null
  const hit = await caches.default.match(key)
  return hit ? hit.json() : null
}
async function cachePut(key, value) {
  if (typeof caches === 'undefined') return
  await caches.default.put(key, new Response(JSON.stringify(value), {
    headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${CACHE_SECONDS}` },
  }))
}

function toIcaProduct(p) {
  return {
    id: p.productId,
    retailerProductId: p.retailerProductId,
    name: p.name,
    brand: p.brand ?? '',
    packSize: p.packSizeDescription ?? '',
    price: Number(p.price?.amount),
    unitPrice: p.unitPrice?.price?.amount ? `${p.unitPrice.price.amount} kr/${unitLabel(p.unitPrice.unitName)}` : '',
    country: p.countryOfOrigin ?? '',
    available: p.available !== false,
    offers: (p.promotions ?? []).map(x => x.description).filter(Boolean),
    image: p.image?.src,
  }
}

function unitLabel(unitName) {
  return { PER_KILOGRAM: 'kg', PER_LITRE: 'l', PER_ITEM: 'st', EACH: 'st' }[unitName] ?? (unitName ?? '').replace(/^PER_/, '').toLowerCase()
}
