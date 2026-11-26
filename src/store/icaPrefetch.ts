/**
 * Fetches ICA prices for the shopping list in the background, slowly, so the
 * store comparison fills in on its own and ICA isn't asked too much at once.
 * Runs while the app is open. When ICA asks us to wait (202), the job pauses
 * for several minutes instead of retrying.
 */
import { create } from 'zustand'
import { cachedIca, icaBatch, IcaRateLimited } from '../api/ica'

const BATCH = 8
const GAP_MS = 6_000            // between batches
const COOLDOWN_MS = 5 * 60_000  // after ICA says "wait"

interface IcaPrefetch {
  store: string | null
  queue: string[]
  total: number
  done: number
  /** Epoch ms until which we're waiting because ICA asked us to. */
  pausedUntil: number | null
  running: boolean
  error: string | null
  /** Add queries for a store (others are dropped). Starts the job if needed. */
  want: (store: string, queries: string[]) => void
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export const useIcaPrefetch = create<IcaPrefetch>((set, get) => ({
  store: null, queue: [], total: 0, done: 0, pausedUntil: null, running: false, error: null,

  want: (store, queries) => {
    const s = get()
    const missing = [...new Set(queries.map(q => q.trim()).filter(Boolean))].filter(q => !cachedIca(store, q))
    if (s.store !== store) {
      set({ store, queue: missing, total: missing.length, done: 0, error: null })
    } else {
      const queue = [...new Set([...s.queue, ...missing])]
      set({ queue, total: s.done + queue.length })
    }
    if (!get().running && get().queue.length) void run()
  },
}))

async function run() {
  useIcaPrefetch.setState({ running: true })
  try {
    for (;;) {
      const { store, queue } = useIcaPrefetch.getState()
      if (!store) break
      const batch = queue.filter(q => !cachedIca(store, q)).slice(0, BATCH)
      if (!batch.length) { useIcaPrefetch.setState({ queue: [] }); break }
      try {
        await icaBatch(store, batch)
        useIcaPrefetch.setState({ pausedUntil: null, error: null })
      } catch (e) {
        if (e instanceof IcaRateLimited) {
          const until = Date.now() + COOLDOWN_MS
          useIcaPrefetch.setState({ pausedUntil: until })
          await sleep(COOLDOWN_MS)
        } else {
          useIcaPrefetch.setState({ error: e instanceof Error ? e.message : String(e) })
          await sleep(30_000)
        }
      }
      useIcaPrefetch.setState(s => {
        const queue = s.queue.filter(q => !cachedIca(store, q))
        return { queue, done: s.total - queue.length }
      })
      await sleep(GAP_MS)
    }
  } finally {
    useIcaPrefetch.setState({ running: false, pausedUntil: null })
  }
}
