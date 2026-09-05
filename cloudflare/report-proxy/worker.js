// Cloudflare Worker: receives in-app bug/idea/unsupported-recipe-site reports
// from src/api/feedback.ts and files them as GitHub issues on this repo. It
// never ships the GitHub token to the browser — the token only ever leaves
// this Worker as an Authorization header on the outbound call to GitHub.
// Same pattern as budgetmanager's report worker (see README.md).

const REPO = 'EmilArvidsson96/Matplanering'
const ALLOWED_ORIGIN = 'https://emilarvidsson96.github.io'
const MAX_BODY_BYTES = 100_000
const MAX_ISSUE_BODY_CHARS = 60_000

const LABELS_BY_KIND = {
  bug: ['feedback', 'bug'],
  idea: ['feedback', 'enhancement'],
  'recipe-parser': ['feedback', 'recipe-parser'],
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  })
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders() })
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

    // Belt-and-suspenders alongside CORS: CORS only stops browsers from reading
    // a cross-origin response, it doesn't stop a direct curl. Still not a
    // security boundary against a determined attacker who can spoof headers.
    const origin = request.headers.get('Origin')
    if (origin !== ALLOWED_ORIGIN) return json({ error: 'Forbidden origin' }, 403)

    const contentLength = Number(request.headers.get('Content-Length') ?? '0')
    if (contentLength > MAX_BODY_BYTES) return json({ error: 'Payload too large' }, 413)

    let payload
    try {
      payload = await request.json()
    } catch {
      return json({ error: 'Invalid JSON' }, 400)
    }

    const title = typeof payload.title === 'string' ? payload.title.trim() : ''
    const body = typeof payload.body === 'string' ? payload.body.trim() : ''
    const labels = typeof payload.kind === 'string' ? LABELS_BY_KIND[payload.kind] : undefined
    if (!title || !body || !labels) {
      return json({ error: 'title, body and a valid kind are required' }, 400)
    }

    const truncatedBody = body.length > MAX_ISSUE_BODY_CHARS
      ? `${body.slice(0, MAX_ISSUE_BODY_CHARS)}\n...[truncated]`
      : body

    const ghRes = await fetch(`https://api.github.com/repos/${REPO}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'matplanering-report-worker',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ title, body: truncatedBody, labels }),
    })

    if (!ghRes.ok) {
      const text = await ghRes.text()
      return json({ error: `GitHub error ${ghRes.status}: ${text.slice(0, 500)}` }, 502)
    }

    const issue = await ghRes.json()
    return json({ ok: true, number: issue.number })
  },
}
