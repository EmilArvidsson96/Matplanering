// Receives in-app bug reports / feature ideas from FeedbackWidget and files them
// as GitHub issues on the PRIVATE matplanering-data repo.
//
// The app is a static GitHub Pages site with no backend, so something has to
// hold the GitHub token off the client — this Worker is that something. The
// token lives only as a Worker secret (GITHUB_TOKEN) and only ever leaves here
// as the Authorization header on the call to GitHub. Reports go to the private
// data repo (not the public app repo) because they carry app context and logs.

const REPO = 'EmilArvidsson96/matplanering-data'
const ALLOWED_ORIGIN = 'https://emilarvidsson96.github.io'
const MAX_BODY_BYTES = 100_000
const MAX_ISSUE_BODY_CHARS = 65_000

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders() })
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

    // CORS only stops browsers reading the response; this also rejects casual
    // cross-site posts (not a hard security boundary — headers can be spoofed).
    if (request.headers.get('Origin') !== ALLOWED_ORIGIN) return json({ error: 'Forbidden origin' }, 403)

    if (Number(request.headers.get('Content-Length') ?? '0') > MAX_BODY_BYTES) {
      return json({ error: 'Payload too large' }, 413)
    }

    if (!env.GITHUB_TOKEN) return json({ error: 'Worker saknar GITHUB_TOKEN-secret' }, 500)

    let payload
    try {
      payload = await request.json()
    } catch {
      return json({ error: 'Invalid JSON' }, 400)
    }

    const title = typeof payload.title === 'string' ? payload.title.trim().slice(0, 200) : ''
    const description = typeof payload.description === 'string' ? payload.description.trim() : ''
    const kind = payload.kind === 'bug' ? 'bug' : payload.kind === 'idea' ? 'idea' : null
    if (!title || !kind) return json({ error: 'title och giltig kind krävs' }, 400)

    const body = [
      description || '_Ingen beskrivning angiven._',
      '',
      '<details>',
      '<summary>Teknisk kontext</summary>',
      '',
      '```json',
      JSON.stringify(payload.context ?? {}, null, 2),
      '```',
      '</details>',
    ].join('\n')

    const ghRes = await fetch(`https://api.github.com/repos/${REPO}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'matplanering-report-worker',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: `${kind === 'bug' ? '[Bugg]' : '[Förslag]'} ${title}`,
        body: truncate(body, MAX_ISSUE_BODY_CHARS),
        labels: ['in-app-report', kind === 'bug' ? 'bug' : 'enhancement'],
      }),
    })

    if (!ghRes.ok) {
      const text = await ghRes.text()
      return json({ error: `GitHub svarade ${ghRes.status}: ${text.slice(0, 300)}` }, 502)
    }

    const issue = await ghRes.json()
    return json({ ok: true, number: issue.number })
  },
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

function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max)}\n...[trunkerad]` : text
}
