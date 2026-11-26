/**
 * App-wide undo/redo (⌘Z / ⇧⌘Z). Stores record what they changed as
 * undo/redo closures; `batch()` folds several changes (e.g. one in the week
 * and one in settings) into a single step. `notify()` shows a short toast
 * with an Ångra button, for phones that have no keyboard.
 */
import { create } from 'zustand'

interface Entry {
  undo: () => void
  redo: () => void
  at: number
  /** Changes with the same key in quick succession (typing) merge into one step. */
  key?: string
}

interface UndoState {
  canUndo: boolean
  canRedo: boolean
  toast: { id: number; label: string } | null
  dismissToast: () => void
}

const MAX = 50
const COALESCE_MS = 1500
const undoStack: Entry[] = []
const redoStack: Entry[] = []
let applying = false
let batching: Entry[] | null = null
let toastSeq = 0

export const useUndo = create<UndoState>((set) => ({
  canUndo: false,
  canRedo: false,
  toast: null,
  dismissToast: () => set({ toast: null }),
}))

function sync() {
  useUndo.setState({ canUndo: undoStack.length > 0, canRedo: redoStack.length > 0 })
}

/** Called by stores after a user-visible change. Ignored while undoing/redoing. */
export function record(undo: () => void, redo: () => void, key?: string) {
  if (applying) return
  const entry: Entry = { undo, redo, at: Date.now(), key }
  if (batching) { batching.push(entry); return }
  const last = undoStack[undoStack.length - 1]
  if (key && last?.key === key && entry.at - last.at < COALESCE_MS) {
    // Keep the oldest "undo", take the newest "redo".
    undoStack[undoStack.length - 1] = { ...last, redo, at: entry.at }
  } else {
    undoStack.push(entry)
    if (undoStack.length > MAX) undoStack.shift()
  }
  redoStack.length = 0
  sync()
}

/** Run several changes as one undo step. */
export function batch<T>(fn: () => T): T {
  if (batching || applying) return fn()
  batching = []
  try {
    return fn()
  } finally {
    const parts = batching
    batching = null
    if (parts.length) {
      record(
        () => { for (const p of [...parts].reverse()) p.undo() },
        () => { for (const p of parts) p.redo() },
      )
    }
  }
}

export function undo() {
  const e = undoStack.pop()
  if (!e) return false
  applying = true
  try { e.undo() } finally { applying = false }
  redoStack.push(e)
  useUndo.setState({ toast: null })
  sync()
  return true
}

export function redo() {
  const e = redoStack.pop()
  if (!e) return false
  applying = true
  try { e.redo() } finally { applying = false }
  undoStack.push(e)
  sync()
  return true
}

/** Show "label · Ångra" for a few seconds. */
export function notify(label: string) {
  useUndo.setState({ toast: { id: ++toastSeq, label } })
}

/** True while an undo/redo is being applied (stores skip side effects then). */
export function isApplyingUndo() {
  return applying
}
