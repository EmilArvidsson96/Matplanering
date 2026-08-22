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
