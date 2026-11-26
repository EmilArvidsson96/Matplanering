import { useEffect } from 'react'
import { useUndo, undo, redo } from '../../store/undoStore'

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

function typingIn(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
}

/** ⌘Z / Ctrl+Z undo, ⇧⌘Z / Ctrl+Y redo, and the "… · Ångra" toast. */
export default function UndoToast({ bottomClass }: { bottomClass: string }) {
  const { toast, dismissToast } = useUndo()

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = isMac ? e.metaKey : e.ctrlKey
      if (!mod || typingIn(e.target)) return   // leave text undo to the browser
      const k = e.key.toLowerCase()
      if (k === 'z' && !e.shiftKey) { if (undo()) e.preventDefault() }
      else if ((k === 'z' && e.shiftKey) || (k === 'y' && !isMac)) { if (redo()) e.preventDefault() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(dismissToast, 6000)
    return () => clearTimeout(t)
  }, [toast, dismissToast])

  if (!toast) return null
  return (
    <div className={`fixed left-1/2 -translate-x-1/2 ${bottomClass} z-50 w-[calc(100%-32px)] max-w-md animate-pop-in`}>
      <div role="status" className="bg-ink text-white rounded-2xl pl-4 pr-2 py-2 flex items-center gap-3 shadow-[0_8px_24px_rgba(21,23,26,0.25)]">
        <span className="flex-1 min-w-0 text-sm truncate">{toast.label}</span>
        <button
          onClick={() => undo()}
          className="h-9 px-4 rounded-full bg-mint-bright text-mint-ink text-sm font-bold shrink-0"
        >
          Ångra <span className="hidden md:inline font-medium opacity-70">{isMac ? '⌘Z' : 'Ctrl+Z'}</span>
        </button>
        <button onClick={dismissToast} aria-label="Stäng" className="w-8 h-8 rounded-full text-white/60 hover:text-white shrink-0">✕</button>
      </div>
    </div>
  )
}
