import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useIsDesktop } from '../../hooks/useDevice'

interface Props {
  title: string
  onClose: () => void
  children: React.ReactNode
  /** Wider dialog on desktop */
  wide?: boolean
  /** Small text above the title (e.g. "Redigera rätt") */
  subtitle?: string
  /** Sticky footer (primary actions). Always visible, never scrolls away. */
  footer?: React.ReactNode
  /** Extra controls in the header, right of the title (e.g. a Save button on mobile) */
  headerAction?: React.ReactNode
  /** Mobile: take (almost) the full screen height instead of fitting content */
  fullHeight?: boolean
  /** Content directly under the header that should not scroll (e.g. tabs) */
  toolbar?: React.ReactNode
}

/** Imperative handle: close the sheet with its exit animation from code (Spara, Klar, a pick …). */
export interface ModalHandle {
  /** Animate out, then run `after` (if given) and finally `onClose`. */
  close: (after?: () => void) => void
}

/** Open modals, innermost last — Escape only closes the topmost one. */
const openStack: symbol[] = []

/**
 * Bottom sheet on mobile, centered dialog on desktop.
 * Close with Escape, backdrop tap, the X button, or (mobile) by dragging the handle down.
 */
const Modal = forwardRef<ModalHandle, Props>(function Modal({
  title, onClose, children, wide, subtitle, footer, headerAction, fullHeight, toolbar,
}, ref) {
  const isDesktop = useIsDesktop()
  const idRef = useRef(Symbol('modal'))
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const mouseDownOnBackdropRef = useRef(false)
  const [dragY, setDragY] = useState(0)
  const dragStartRef = useRef<number | null>(null)
  const [closing, setClosing] = useState(false)

  /** Play the exit animation, then tell the parent to unmount us. */
  const closingRef = useRef(false)
  const requestClose = useRef((_after?: () => void) => {})
  requestClose.current = (after?: () => void) => {
    if (closingRef.current) return
    closingRef.current = true
    const finish = () => { after?.(); onCloseRef.current() }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) { finish(); return }
    setClosing(true)
    window.setTimeout(finish, 200)
  }
  useImperativeHandle(ref, () => ({ close: (after) => requestClose.current(after) }), [])


  useEffect(() => {
    const id = idRef.current
    openStack.push(id)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && openStack[openStack.length - 1] === id) requestClose.current()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      openStack.splice(openStack.indexOf(id), 1)
      document.body.style.overflow = prevOverflow
    }
  }, [])

  // ── Drag-to-dismiss (mobile handle/header only) ──
  function onPointerDown(e: React.PointerEvent) {
    if (isDesktop) return
    if ((e.target as HTMLElement).closest('button, a, input, select, textarea')) return
    dragStartRef.current = e.clientY
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  function onPointerMove(e: React.PointerEvent) {
    if (dragStartRef.current == null) return
    setDragY(Math.max(0, e.clientY - dragStartRef.current))
  }
  function onPointerUp() {
    if (dragStartRef.current == null) return
    dragStartRef.current = null
    if (dragY > 110) requestClose.current()
    else setDragY(0)
  }

  const backdrop = (
    <div
      className={`fixed inset-0 bg-ink/45 ${closing ? 'animate-fade-out' : 'animate-fade-in'}`}
      aria-hidden="true"
    />
  )

  const header = (
    <div
      className={`shrink-0 ${isDesktop ? 'px-7 pt-6 pb-4' : 'px-5 pt-2 pb-3 touch-none'}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {!isDesktop && (
        <div className="flex justify-center pb-2">
          <span className="w-10 h-[5px] rounded-full bg-line" />
        </div>
      )}
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          {subtitle && <p className="text-[13px] font-medium text-ink-muted">{subtitle}</p>}
          <h2 className={`font-display font-extrabold tracking-tight text-ink truncate ${isDesktop ? 'text-2xl' : 'text-xl'}`}>
            {title}
          </h2>
        </div>
        {headerAction}
        <button
          onClick={() => requestClose.current()}
          aria-label="Stäng"
          className="w-10 h-10 rounded-full bg-white border border-line flex items-center justify-center text-ink hover:bg-canvas shrink-0"
        >
          <X className="w-[18px] h-[18px]" />
        </button>
      </div>
    </div>
  )

  const body = (
    <>
      {header}
      {toolbar && <div className={`shrink-0 ${isDesktop ? 'px-7 pb-3' : 'px-4 pb-3'}`}>{toolbar}</div>}
      <div className={`overflow-y-auto overscroll-contain flex-1 min-h-0 ${isDesktop ? 'px-7 pb-6' : 'px-4 pb-6'}`}>
        {children}
      </div>
      {footer && (
        <div
          className={`shrink-0 border-t border-line-soft bg-canvas ${isDesktop ? 'px-7 py-4' : 'px-4 pt-3'}`}
          style={isDesktop ? undefined : { paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
        >
          {footer}
        </div>
      )}
    </>
  )

  return (
    <div
      className={`fixed inset-0 z-50 flex justify-center ${isDesktop ? 'items-center p-6' : 'items-end'}`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => { mouseDownOnBackdropRef.current = e.target === e.currentTarget }}
      onClick={(e) => {
        if (e.target === e.currentTarget && mouseDownOnBackdropRef.current) requestClose.current()
        mouseDownOnBackdropRef.current = false
      }}
    >
      {backdrop}
      {isDesktop ? (
        <div
          className={`relative bg-canvas rounded-4xl shadow-2xl w-full max-h-[88vh] flex flex-col ${closing ? 'animate-pop-out' : 'animate-pop-in'}
            ${wide ? 'max-w-4xl' : 'max-w-lg'}`}
        >
          {body}
        </div>
      ) : (
        <div
          className={`relative bg-canvas rounded-t-[28px] w-full flex flex-col ${closing ? 'animate-sheet-down' : 'animate-sheet-up'} shadow-[0_-8px_32px_rgba(0,0,0,0.18)]
            ${fullHeight ? 'h-[94dvh]' : 'max-h-[94dvh]'}`}
          style={{
            transform: dragY ? `translateY(${dragY}px)` : undefined,
            ['--drag-y' as string]: `${dragY}px`,
            transition: dragStartRef.current == null ? 'transform 0.2s ease-out' : 'none',
            paddingBottom: footer ? undefined : 'env(safe-area-inset-bottom)',
          }}
        >
          {body}
        </div>
      )}
    </div>
  )
})

export default Modal
