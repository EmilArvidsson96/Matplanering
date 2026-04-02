/** GitHub data API — calls GitHub directly using the baked-in token. */

const TOKEN      = import.meta.env.VITE_GITHUB_TOKEN as string
const REPO_OWNER = 'EmilArvidsson96'
const REPO_NAME  = 'matplanering-data'

async function call(method: string, path: string, body?: unknown) {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`
  return fetch(url, {
    method,
    headers: {
      Authorization: `token ${TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
}

export interface GHFile {
  content: string
  sha: string
}

export async function getFile(path: string): Promise<GHFile | null> {
  const res = await call('GET', path)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`)
  const data = await res.json()
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

  let res = await call('PUT', path, bodyObj)

  // 422 = SHA mismatch. Fetch current SHA and retry once.
  if (res.status === 422) {
    const head = await call('GET', path)
    if (head.ok) {
      const headData = await head.json()
      bodyObj.sha = headData.sha as string
      res = await call('PUT', path, bodyObj)
    }
  }

  if (!res.ok) {
    let detail = res.status.toString()
    try { detail += ' — ' + ((await res.json() as Record<string, unknown>).message ?? '') } catch { /* ignore */ }
    throw new Error(`PUT ${path} failed: ${detail}`)
  }
  const data = await res.json()
  return (data as { content: { sha: string } }).content.sha
}
