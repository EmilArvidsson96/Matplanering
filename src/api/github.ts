/** GitHub data API — all writes go through the Netlify proxy function
 *  so the Personal Access Token never leaves the server.
 *  In local dev mode (VITE_DEV_MODE=true) we call GitHub directly.
 */

const DEV_MODE    = import.meta.env.VITE_DEV_MODE === 'true'
const DEV_TOKEN   = import.meta.env.VITE_GITHUB_TOKEN as string | undefined
const REPO_OWNER  = 'EmilArvidsson96'
const REPO_NAME   = 'matplanering-data'

let _token: string | null = null

export function setAuthToken(token: string) {
  _token = token
}

async function proxy(method: string, path: string, body?: unknown) {
  if (DEV_MODE && DEV_TOKEN) {
    // In dev mode: call GitHub API directly
    const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`
    return fetch(url, {
      method,
      headers: {
        Authorization: `token ${DEV_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  }

  return fetch('/.netlify/functions/github-proxy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ..._token ? { Authorization: `Bearer ${_token}` } : {},
    },
    body: JSON.stringify({ method, path, body }),
  })
}

export interface GHFile {
  content: string
  sha: string
}

export async function getFile(path: string): Promise<GHFile | null> {
  const res = await proxy('GET', path)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`)
  const data = await res.json()
  // GitHub returns base64-encoded content with newlines
  const content = decodeURIComponent(
    escape(atob(data.content.replace(/\n/g, '')))
  )
  return { content, sha: data.sha as string }
}

export async function saveFile(
  path: string,
  content: string,
  sha: string | undefined,
  message: string,
): Promise<string> {
  const encoded = btoa(unescape(encodeURIComponent(content)))
  const bodyObj: Record<string, unknown> = { message, content: encoded }
  if (sha) bodyObj.sha = sha
  const res = await proxy('PUT', path, bodyObj)
  if (!res.ok) throw new Error(`PUT ${path} failed: ${res.status}`)
  const data = await res.json()
  return data.content.sha as string
}
