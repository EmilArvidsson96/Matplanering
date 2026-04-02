import type { Handler } from '@netlify/functions'

const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? ''
const REPO_OWNER   = 'EmilArvidsson96'
const REPO_NAME    = 'matplanering-data'
const API_BASE     = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents`

const handler: Handler = async (event, context) => {
  // Require Netlify Identity authentication
  const user = context.clientContext?.user
  if (!user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Ej autentiserad' }) }
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Metod ej tillåten' }) }
  }

  if (!GITHUB_TOKEN) {
    return { statusCode: 500, body: JSON.stringify({ error: 'GITHUB_TOKEN saknas' }) }
  }

  let parsed: { method?: string; path?: string; body?: unknown }
  try {
    parsed = JSON.parse(event.body ?? '{}')
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Ogiltig JSON' }) }
  }

  const { method = 'GET', path = '', body } = parsed

  // Restrict to data paths only
  if (!/^(weeks\/[\w-]+\.json|library\.json|settings\.json)$/.test(path)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Otillåten sökväg' }) }
  }

  const url = `${API_BASE}/${path}`

  const ghRes = await fetch(url, {
    method,
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'Matplanering-App',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const text = await ghRes.text()

  return {
    statusCode: ghRes.status,
    headers: { 'Content-Type': 'application/json' },
    body: text,
  }
}

export { handler }
