/** Feedback API — files bug reports / feature ideas as GitHub issues on the app repo,
 *  so they show up right alongside the code they describe. */

const TOKEN      = import.meta.env.VITE_GITHUB_TOKEN as string
const REPO_OWNER = 'EmilArvidsson96'
const REPO_NAME  = 'Matplanering'

export type FeedbackType = 'bug' | 'idea'

export interface FeedbackContext {
  page: string
  path: string
  device: 'desktop' | 'mobile'
  viewport: string
  userAgent: string
  gameMode: boolean
  activeWeekId: string
  dirty: {
    weeks: number
    library: boolean
    settings: boolean
    game: boolean
  }
  settings: {
    defaultHouseholdSize: number
    aiModel: string
    calibrationModel: string
  }
  recentLogs: string[]
  timestamp: string
}

export interface FeedbackInput {
  type: FeedbackType
  title: string
  description: string
  context: FeedbackContext
}

function buildBody({ description, context }: FeedbackInput): string {
  return [
    description.trim() || '_Ingen beskrivning angiven._',
    '',
    '<details>',
    '<summary>Teknisk kontext</summary>',
    '',
    '```json',
    JSON.stringify(context, null, 2),
    '```',
    '</details>',
  ].join('\n')
}

export async function submitFeedback(input: FeedbackInput): Promise<void> {
  if (!TOKEN) {
    throw new Error('Ingen GitHub-token konfigurerad (VITE_GITHUB_TOKEN).')
  }

  const prefix = input.type === 'bug' ? '[Bugg]' : '[Förslag]'
  const res = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `token ${TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      title: `${prefix} ${input.title.trim()}`,
      body: buildBody(input),
      labels: ['feedback', input.type === 'bug' ? 'bug' : 'enhancement'],
    }),
  })

  if (!res.ok) {
    let detail = res.status.toString()
    try { detail += ' — ' + ((await res.json() as { message?: string }).message ?? '') } catch { /* ignore */ }
    throw new Error(`Kunde inte skicka feedback: ${detail}`)
  }
}

// ── Unsupported recipe site reporting ────────────────────────────────────────
// When recipeFetcher.ts can't parse a page (unknown site, or a known site whose
// markup changed), it files an issue here instead of just refusing — so support
// for that page/page-type can be added later. Best-effort and de-duplicated per
// hostname (in localStorage) so repeated visits don't spam the issue tracker.

const REPORTED_HOSTS_KEY = 'mp_reported_recipe_hosts'

function alreadyReportedHost(hostname: string): boolean {
  try {
    const raw = localStorage.getItem(REPORTED_HOSTS_KEY)
    const hosts: string[] = raw ? JSON.parse(raw) : []
    return hosts.includes(hostname)
  } catch {
    return false
  }
}

function markHostReported(hostname: string): void {
  try {
    const raw = localStorage.getItem(REPORTED_HOSTS_KEY)
    const hosts: string[] = raw ? JSON.parse(raw) : []
    if (!hosts.includes(hostname)) {
      localStorage.setItem(REPORTED_HOSTS_KEY, JSON.stringify([...hosts, hostname]))
    }
  } catch {
    /* quota / disabled storage — de-dup is best-effort */
  }
}

export interface UnsupportedRecipeSite {
  url: string
  hostname: string
  reason: string
}

/** Best-effort: never throws, so a failed report can't block the AI fallback. */
export async function reportUnsupportedRecipeSite(input: UnsupportedRecipeSite): Promise<void> {
  if (!TOKEN || alreadyReportedHost(input.hostname)) return
  markHostReported(input.hostname)

  const body = [
    'En receptsida kunde inte tolkas av de befintliga parsarna och föll tillbaka på en AI-läsning av sidan.',
    '',
    `**URL:** ${input.url}`,
    `**Domän:** ${input.hostname}`,
    `**Anledning:** ${input.reason}`,
    '',
    'Lägg till en sidspecifik parser (eller lägg till domänen i `ALLOWED_HOSTS` om sidan har schema.org/Recipe-data) i `src/utils/recipeFetcher.ts` så att AI-fallbacket inte längre behövs för den här sidan.',
  ].join('\n')

  try {
    const res = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `token ${TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        title: `[Recept] Sida stöds inte: ${input.hostname}`,
        body,
        labels: ['feedback', 'recipe-parser'],
      }),
    })
    if (!res.ok) console.warn(`Kunde inte rapportera receptsida (${input.hostname}): HTTP ${res.status}`)
  } catch (e) {
    console.warn(`Kunde inte rapportera receptsida (${input.hostname}):`, e)
  }
}
