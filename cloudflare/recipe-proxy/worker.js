// CORS proxy for fetchRecipeFromUrl() in src/utils/recipeFetcher.ts.
// Fetches ?url= server-side and returns the body with CORS headers so the
// browser can read a response that the target site itself doesn't send
// Access-Control-Allow-Origin for.

//
// Also: GET /ica/search?store=<nr>&q=<text>&limit=8 and
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

const ICA = 'https://handlaprivatkund.ica.se'
const ICA_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0 Safari/537.36'
const SESSION_TTL_MS = 10 * 60 * 1000
const icaSessions = new Map()   // store → { cookie, csrf, at }

export async function handleIca(url) {
  const store = url.searchParams.get('store') ?? ''
  if (!/^\d{3,8}$/.test(store)) return { status: 400, body: { error: 'store must be an ICA store number' } }
  try {
    if (url.pathname === '/ica/search') {
      const q = (url.searchParams.get('q') ?? '').trim()
      if (!q) return { status: 400, body: { error: 'q is required' } }
      const limit = Math.min(Number(url.searchParams.get('limit')) || 8, 20)
      const ids = await icaSearchIds(store, q, limit)
      return { status: 200, body: { products: ids.length ? await icaProducts(store, ids) : [] } }
    }
    if (url.pathname === '/ica/products') {
      const ids = (url.searchParams.get('ids') ?? '').split(',').filter(id => /^[0-9a-f-]{36}$/.test(id)).slice(0, 30)
      return { status: 200, body: { products: ids.length ? await icaProducts(store, ids) : [] } }
    }
    return { status: 404, body: { error: 'unknown ICA route' } }
  } catch (e) {
    return { status: 502, body: { error: String(e && e.message || e) } }
  }
}

// ICA's firewall answers 202 with an empty body when it wants a browser check.
// It usually passes again after a short pause, so retry a couple of times.
async function icaFetch(url, init) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, init)
    if (res.status !== 202 || attempt >= 2) return res
    await new Promise(r => setTimeout(r, 800 * (attempt + 1)))
  }
}

async function icaSearchIds(store, q, limit) {
  const res = await icaFetch(`${ICA}/stores/${store}/api/webproductpagews/v6/product-pages/search?q=${encodeURIComponent(q)}&maxPageSize=${limit}`, {
    headers: { 'user-agent': ICA_UA, accept: 'application/json' },
  })
  if (res.status === 202) throw new Error('ICA bot check (202), try again later')
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
  if (res.status === 202) throw new Error('ICA bot check (202), try again later')
  const html = await res.text()
  const csrf = html.match(/"csrf":\{"token":"([^"]+)"/)?.[1]
  if (!csrf) throw new Error(`ICA session failed (${res.status})`)
  const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [res.headers.get('set-cookie') ?? '']
  const cookie = setCookies.map(c => c.split(';')[0]).filter(Boolean).join('; ')
  const session = { cookie, csrf, at: Date.now() }
  icaSessions.set(store, session)
  return session
}

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
    if (res.status === 202) throw new Error('ICA bot check (202), try again later')
    if (!res.ok) throw new Error(`ICA products ${res.status}`)
    const data = await res.json()
    if (!(data.products ?? []).length) throw new Error('ICA returned no product details')
    const byId = new Map((data.products ?? []).map(p => [p.productId, p]))
    return ids.map(id => byId.get(id)).filter(Boolean).map(toIcaProduct)
  }
  return []
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
