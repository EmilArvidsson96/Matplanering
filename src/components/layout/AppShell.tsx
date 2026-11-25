import { useState, useEffect, useRef } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Calendar, BookOpen, ShoppingCart, Settings, UtensilsCrossed, Gamepad2,
  MoreHorizontal, LogOut, ChevronRight,
} from 'lucide-react'
import PlayerBar from '../game/PlayerBar'
import type { LucideIcon } from 'lucide-react'
import { useIsDesktop } from '../../hooks/useDevice'
import WeekNavigator from './WeekNavigator'
import SaveIndicator from './SaveIndicator'
import DebugPanel from './DebugPanel'
import Modal, { type ModalHandle } from '../common/Modal'
import type { SaveStatus, SaveError } from '../../hooks/useAutoSave'

interface Props {
  logout: () => void
  saveStatus: SaveStatus
  saveError: SaveError
  onRetrySave: () => void
}

interface NavDef { to: string; label: string; Icon: LucideIcon }

const PRIMARY_NAV: NavDef[] = [
  { to: '/',          label: 'Vecka',     Icon: Calendar },
  { to: '/recept',    label: 'Recept',    Icon: UtensilsCrossed },
  { to: '/bibliotek', label: 'Bibliotek', Icon: BookOpen },
  { to: '/inkop',     label: 'Inköp',     Icon: ShoppingCart },
]

const SECONDARY_NAV: NavDef[] = [
  { to: '/spel', label: 'Spel',          Icon: Gamepad2 },
  { to: '/inst', label: 'Inställningar', Icon: Settings },
]

/** Routes whose content depends on the active week → show the week navigator as page header. */
const WEEK_ROUTES = new Set(['/', '/planera', '/inkop', '/recept'])

/** Routes that manage their own full-height layout (split panes, own scroll areas). */
const FULLBLEED_ROUTES = new Set(['/recept'])

const PAGE_TITLES: Record<string, string> = {
  '/bibliotek': 'Bibliotek',
  '/inst':      'Inställningar',
  '/spel':      'Spel',
}

function PageHeader({ size }: { size: 'md' | 'lg' }) {
  const { pathname } = useLocation()
  if (WEEK_ROUTES.has(pathname)) return <WeekNavigator size={size} />
  return (
    <h1 className={`font-display font-extrabold tracking-tight leading-none text-ink ${size === 'lg' ? 'text-[44px]' : 'text-[32px]'}`}>
      {PAGE_TITLES[pathname] ?? 'Matplanering'}
    </h1>
  )
}

// ─── Page transitions ──────────────────────────────────────────────────────────

/** Visual order of routes — navigating "right" slides the new page in from the right. */
const ROUTE_ORDER = ['/', '/planera', '/recept', '/bibliotek', '/inkop', '/spel', '/inst']
const routeIndex = (p: string) => Math.max(0, ROUTE_ORDER.indexOf(p))

/**
 * Wraps a page so it slides/fades in when the route changes, in the direction
 * of travel (like moving between tabs). Also resets scroll to the top.
 */
function PageTransition({ children, className = '', scrollRef }: {
  children: React.ReactNode
  className?: string
  scrollRef?: React.RefObject<HTMLElement>
}) {
  const { pathname } = useLocation()
  const prev = useRef(pathname)
  const dir = useRef<'left' | 'right'>('right')
  if (prev.current !== pathname) {
    dir.current = routeIndex(pathname) >= routeIndex(prev.current) ? 'right' : 'left'
    prev.current = pathname
  }
  useEffect(() => { scrollRef?.current?.scrollTo({ top: 0 }) }, [pathname, scrollRef])

  return (
    <div
      key={pathname}
      className={`${className} ${dir.current === 'right' ? 'motion-safe:animate-page-from-right' : 'motion-safe:animate-page-from-left'}`}
    >
      {children}
    </div>
  )
}

// ─── Desktop sidebar item ────────────────────────────────────────────────────

function SideItem({ to, label, Icon }: NavDef) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `h-11 px-3.5 rounded-full flex items-center gap-3 text-sm transition-all duration-200 motion-safe:active:scale-[0.97]
         ${isActive ? 'bg-ink text-white font-semibold' : 'text-ink-soft font-medium hover:bg-white'}`
      }
    >
      <Icon className="w-[18px] h-[18px] shrink-0" />
      <span>{label}</span>
    </NavLink>
  )
}

// ─── Mobile floating tab bar item ────────────────────────────────────────────

function TabItem({ label, Icon, active, onClick, to }: NavDef & { active: boolean; onClick?: () => void }) {
  const cls = `h-12 rounded-full flex items-center justify-center gap-2 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-safe:active:scale-90
    ${active ? 'px-4 bg-ink text-white' : 'w-12 text-ink-muted hover:text-ink'}`
  const inner = (
    <>
      <Icon className="w-[22px] h-[22px] shrink-0" />
      {active && <span className="text-sm font-semibold whitespace-nowrap motion-safe:animate-fade-in">{label}</span>}
    </>
  )
  if (onClick) {
    return <button onClick={onClick} className={cls} aria-label={label}>{inner}</button>
  }
  return <NavLink to={to} end={to === '/'} className={cls} aria-label={label}>{inner}</NavLink>
}

export default function AppShell({ logout, saveStatus, saveError, onRetrySave }: Props) {
  const isDesktop = useIsDesktop()
  const [debugOpen, setDebugOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const mainRef = useRef<HTMLElement>(null)
  const moreModal = useRef<ModalHandle>(null)

  // Toggle debug panel with Ctrl+Shift+D
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault()
        setDebugOpen(o => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const debug = debugOpen && (
    <DebugPanel onClose={() => setDebugOpen(false)} saveStatus={saveStatus} saveError={saveError} />
  )

  if (isDesktop) {
    return (
      <div className="flex h-screen bg-canvas">
        <aside className="w-60 flex flex-col py-7 px-4 gap-1 shrink-0">
          <div className="flex items-center gap-2.5 px-3 pb-6">
            <span className="w-8 h-8 rounded-[10px] bg-brand-600 text-white flex items-center justify-center">
              <UtensilsCrossed className="w-[18px] h-[18px]" />
            </span>
            <span className="font-display text-lg font-extrabold tracking-tight">Matplanering</span>
          </div>
          {PRIMARY_NAV.map(item => <SideItem key={item.to} {...item} />)}
          <div className="h-px bg-line mx-3 my-3" />
          {SECONDARY_NAV.map(item => <SideItem key={item.to} {...item} />)}
          <div className="mt-auto flex flex-col gap-3 px-3.5">
            <SaveIndicator status={saveStatus} error={saveError} onRetry={onRetrySave} />
            <button onClick={logout} className="text-xs text-ink-muted hover:text-ink text-left flex items-center gap-1.5">
              <LogOut className="w-3.5 h-3.5" /> Logga ut
            </button>
          </div>
        </aside>

        <div className="flex-1 flex flex-col overflow-hidden py-3 pr-3">
          {FULLBLEED_ROUTES.has(pathname) ? (
            <main className="flex-1 overflow-hidden rounded-4xl bg-white">
              <PageTransition className="h-full"><Outlet /></PageTransition>
            </main>
          ) : (
          <main ref={mainRef} className="flex-1 overflow-y-auto">
            <PageTransition className="max-w-6xl px-5 pt-5 pb-12" scrollRef={mainRef}>
              <header className="flex flex-wrap items-end gap-4 mb-7">
                <div className="flex-1 min-w-[280px]"><PageHeader size="lg" /></div>
                <PlayerBar />
              </header>
              <Outlet />
            </PageTransition>
          </main>
          )}
        </div>
        {debug}
      </div>
    )
  }

  // ── Mobile ──
  const moreActive = SECONDARY_NAV.some(n => n.to === pathname)

  return (
    <div className="flex flex-col h-dvh bg-canvas">
      {FULLBLEED_ROUTES.has(pathname) ? (
        <main
          className="flex-1 min-h-0 overflow-hidden flex flex-col"
          style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'calc(88px + env(safe-area-inset-bottom))' }}
        >
          <PageTransition className="flex-1 min-h-0 flex flex-col"><Outlet /></PageTransition>
        </main>
      ) : (
      <main ref={mainRef} className="flex-1 overflow-y-auto overflow-x-hidden">
        <PageTransition scrollRef={mainRef}>
        <header
          className="px-5 pb-4 flex flex-col gap-3"
          style={{ paddingTop: 'max(20px, calc(env(safe-area-inset-top) + 12px))' }}
        >
          <PageHeader size="md" />
          {saveStatus === 'error' && (
            <div className="rounded-2xl bg-red-50 border border-red-200 px-4 py-3">
              <SaveIndicator status={saveStatus} error={saveError} onRetry={onRetrySave} />
            </div>
          )}
          <PlayerBar />
        </header>
        <div className="px-4 pb-32">
          <Outlet />
        </div>
        </PageTransition>
      </main>
      )}

      {/* Floating tab bar */}
      <nav
        aria-label="Huvudmeny"
        className="fixed left-0 right-0 bottom-0 z-40 px-4 pt-6 bg-gradient-to-b from-canvas/0 via-canvas/90 to-canvas pointer-events-none"
        style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
      >
        <div className="pointer-events-auto h-16 rounded-full bg-white shadow-[0_8px_24px_rgba(21,23,26,0.10),0_0_0_1px_rgba(21,23,26,0.05)] flex items-center justify-between px-2">
          {PRIMARY_NAV.map(item => (
            <TabItem
              key={item.to}
              {...item}
              active={item.to === '/' ? pathname === '/' || pathname === '/planera' : pathname === item.to}
            />
          ))}
          <TabItem to="" label="Mer" Icon={MoreHorizontal} active={moreActive} onClick={() => setMoreOpen(true)} />
        </div>
      </nav>

      {moreOpen && (
        <Modal ref={moreModal} title="Mer" onClose={() => setMoreOpen(false)}>
          <div className="card overflow-hidden">
            {SECONDARY_NAV.map(({ to, label, Icon }, i) => (
              <button
                key={to}
                onClick={() => { navigate(to); moreModal.current?.close() }}
                className={`w-full min-h-[56px] px-4 flex items-center gap-3 text-left text-[15px] ${i > 0 ? 'border-t border-line-soft' : ''}`}
              >
                <Icon className="w-5 h-5 text-ink-muted" />
                <span className="flex-1 font-medium">{label}</span>
                <ChevronRight className="w-4 h-4 text-ink-faint" />
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between mt-4 px-1">
            <SaveIndicator status={saveStatus} error={saveError} onRetry={onRetrySave} />
            <button onClick={logout} className="h-11 px-4 rounded-full text-sm font-semibold text-red-700 flex items-center gap-2">
              <LogOut className="w-4 h-4" /> Logga ut
            </button>
          </div>
        </Modal>
      )}

      {debug}
    </div>
  )
}
