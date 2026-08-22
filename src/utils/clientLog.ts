/** Ring buffer of recent console errors/warnings, for bug-report context. */

export interface ClientLogEntry {
  level: 'error' | 'warn'
  message: string
  ts: string
}

const MAX_ENTRIES = 20
const buffer: ClientLogEntry[] = []
let initialized = false

function push(level: ClientLogEntry['level'], message: string) {
  buffer.push({ level, message: message.slice(0, 500), ts: new Date().toISOString() })
  if (buffer.length > MAX_ENTRIES) buffer.shift()
}

function stringifyArgs(args: unknown[]): string {
  return args
    .map((a) => {
      if (a instanceof Error) return a.stack ?? a.message
      if (typeof a === 'string') return a
      try { return JSON.stringify(a) } catch { return String(a) }
    })
    .join(' ')
}

/** Patches console.error/warn and window error handlers. Call once at startup. */
export function initClientLogging(): void {
  if (initialized) return
  initialized = true

  const origError = console.error.bind(console)
  const origWarn = console.warn.bind(console)

  console.error = (...args: unknown[]) => {
    push('error', stringifyArgs(args))
    origError(...args)
  }
  console.warn = (...args: unknown[]) => {
    push('warn', stringifyArgs(args))
    origWarn(...args)
  }

  window.addEventListener('error', (e) => {
    push('error', `${e.message} (${e.filename}:${e.lineno})`)
  })
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason
    push('error', `Unhandled promise rejection: ${reason instanceof Error ? reason.message : String(reason)}`)
  })
}

export function getRecentLogs(): ClientLogEntry[] {
  return [...buffer]
}
