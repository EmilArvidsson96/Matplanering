import { forwardRef, useEffect, useImperativeHandle, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft } from 'lucide-react'
import { useIsDesktop } from '../../hooks/useDevice'

interface Props {
  title: string
  onClose: () => void
  children: React.ReactNode
  /** Wider content column on desktop */
  wide?: boolean
  /** Small text above the title (e.g. "Redigera rätt") */
  subtitle?: string
  /** Sticky footer (primary actions). Always visible, never scrolls away. */
  footer?: React.ReactNode
  /** Extra controls in the header, right of the title */
  headerAction?: React.ReactNode
  /** Content directly under the header that should not scroll (e.g. tabs) */
  toolbar?: React.ReactNode
}

/** Imperative handle: leave the sub-page with its exit animation from code (Spara, Klar, a pick …). */
export interface SubPageHandle {
  /** Animate out, then run `after` (if given) and finally `onClose`. */
  close: (after?: () => void) => void
}

// ── Shared state: which sub-pages are open, and where they render ─────────────
// Sub-pages are not popups: they replace the page content (the nav stays put),
// like pushing a new screen. AppShell renders <SubPageRoot/> over its content area.

let stack: symbol[] = []
let rootEl: HTMLElement | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach(l => l())
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }

/** True while any sub-page is open (AppShell hides the tab bar and makes the page underneath inert). */
export function useSubPageOpen() {
  return useSyncExternalStore(subscribe, () => stack.length > 0)
}

function useTopId() {
  return useSyncExternalStore(subscribe, () => stack[stack.length - 1])
}

/** Mount point for sub-pages. Place it inside a positioned container covering the page content. */
export function SubPageRoot() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    rootEl = ref.current
    emit()
    return () => { if (rootEl === ref.current) { rootEl = null; emit() } }
  }, [])
  return <div ref={ref} className="contents" />
}

/**
 * A full sub-page that takes over the content area (sidebar / tab bar logic stays in AppShell).
 * Leave with the back arrow or Escape. Nested sub-pages stack; only the topmost reacts to Escape.
 */
const SubPage = forwardRef<SubPageHandle, Props>(function SubPage({
  title, onClose, children, wide, subtitle, footer, headerAction, toolbar,
}, ref) {
  const isDesktop = useIsDesktop()
  const root = useSyncExternalStore(subscribe, () => rootEl)
  const idRef = useRef(Symbol('subpage'))
  const topId = useTopId()
  const isTop = topId === idRef.current
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const [closing, setClosing] = useState(false)

  const closingRef = useRef(false)
  const requestClose = useRef((_after?: () => void) => {})
  requestClose.current = (after?: () => void) => {
    if (closingRef.current) return
    closingRef.current = true
    const finish = () => { after?.(); onCloseRef.current() }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { finish(); return }
    setClosing(true)
    window.setTimeout(finish, 180)
  }
  useImperativeHandle(ref, () => ({ close: (after) => requestClose.current(after) }), [])

  useEffect(() => {
    const id = idRef.current
    const prevFocus = document.activeElement as HTMLElement | null
    stack = [...stack, id]
    emit()
    // Children's effects (autoFocus) ran first; only take focus if nothing inside has it.
    const panel = panelRef.current
    if (panel && !panel.contains(document.activeElement)) panel.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && stack[stack.length - 1] === id) requestClose.current()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      stack = stack.filter(s => s !== id)
      emit()
      if (prevFocus && document.contains(prevFocus)) prevFocus.focus({ preventScroll: true })
    }
  }, [])

  const position = !root
    ? 'fixed inset-0 z-50'
    : isDesktop ? 'absolute top-3 bottom-3 left-0 right-3 z-30 rounded-4xl' : 'absolute inset-0 z-30'
  const column = `w-full mx-auto ${wide ? 'max-w-5xl' : 'max-w-2xl'}`
  const gutter = isDesktop ? 'px-7' : 'px-4'

  const page = (
    <div
      ref={panelRef}
      tabIndex={-1}
      role="region"
      aria-label={title}
      {...(!isTop ? { inert: '' } : {})}
      className={`${position} bg-canvas flex flex-col overflow-hidden focus:outline-none ${closing ? 'animate-page-to-right' : 'animate-page-from-right'}`}
    >
      <div
        className={`shrink-0 ${gutter} ${isDesktop ? 'pt-6 pb-4' : 'pb-3'}`}
        style={isDesktop ? undefined : { paddingTop: 'max(16px, calc(env(safe-area-inset-top) + 8px))' }}
      >
        <div className={`${column} flex items-center gap-3`}>
          <button
            onClick={() => requestClose.current()}
            aria-label="Tillbaka"
            className="w-10 h-10 rounded-full bg-white border border-line flex items-center justify-center text-ink hover:bg-white/60 shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            {subtitle && <p className="text-[13px] font-medium text-ink-muted">{subtitle}</p>}
            <h2 className={`font-display font-extrabold tracking-tight text-ink truncate ${isDesktop ? 'text-2xl' : 'text-xl'}`}>
              {title}
            </h2>
          </div>
          {headerAction}
        </div>
      </div>
      {toolbar && <div className={`shrink-0 ${gutter} pb-3`}><div className={column}>{toolbar}</div></div>}
      <div className={`flex-1 min-h-0 overflow-y-auto overscroll-contain ${gutter} pb-6`}>
        <div className={column}>{children}</div>
      </div>
      {footer && (
        <div
          className={`shrink-0 border-t border-line-soft bg-canvas ${gutter} ${isDesktop ? 'py-4' : 'pt-3'}`}
          style={isDesktop ? undefined : { paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
        >
          <div className={column}>{footer}</div>
        </div>
      )}
    </div>
  )

  return createPortal(page, root ?? document.body)
})

export default SubPage
