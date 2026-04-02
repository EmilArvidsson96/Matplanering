/** GitHub data API — all writes go through the Netlify proxy function
 *  so the Personal Access Token never leaves the server.
 */

let _token: string | null = null

export function setAuthToken(token: string) {
  _token = token
}

async function proxy(method: string, path: string, body?: unknown) {
  const res = await fetch('/.netlify/functions/github-proxy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ..._token ? { Authorization: `Bearer ${_token}` } : {},
    },
    body: JSON.stringify({ method, path, body }),
  })
  return res
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
