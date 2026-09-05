// CORS proxy for fetchRecipeFromUrl() in src/utils/recipeFetcher.ts.
// Fetches ?url= server-side and returns the body with CORS headers so the
// browser can read a response that the target site itself doesn't send
// Access-Control-Allow-Origin for.

const ALLOWED_ORIGIN = 'https://emilarvidsson96.github.io'

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() })
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
