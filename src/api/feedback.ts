/** Feedback API — posts bug reports / feature ideas to a small Cloudflare Worker
 *  (cloudflare/report-worker/), which files them as GitHub issues on the private
 *  matplanering-data repo. The Worker holds the GitHub token, so no credentials
 *  ship to the client and reporters need no GitHub account. */

const REPORT_ENDPOINT = 'https://matplanering-report.emil-arvidsson.workers.dev'

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

export async function submitFeedback(input: FeedbackInput): Promise<void> {
  const res = await fetch(REPORT_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      kind: input.type,
      title: input.title.trim(),
      description: input.description.trim(),
      context: input.context,
    }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(`Kunde inte skicka feedback: ${body.error ?? `servern svarade ${res.status}`}`)
  }
}
