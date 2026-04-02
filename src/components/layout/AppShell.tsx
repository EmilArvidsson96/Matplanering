import { useState, useEffect } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { Calendar, BookOpen, ShoppingCart, Settings } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useIsDesktop } from '../../hooks/useDevice'
import WeekNavigator from './WeekNavigator'
import SaveIndicator from './SaveIndicator'
import DebugPanel from './DebugPanel'
import type { SaveStatus, SaveError } from '../../hooks/useAutoSave'
import type { NlUser } from '../../hooks/useNetlifyIdentity'

interface Props {
  user: NlUser
  logout: () => void
  saveStatus: SaveStatus
  saveError: SaveError
  onRetrySave: () => void
}

const NAV_ITEMS = [
  { to: '/',          label: 'Veckoplanen',   Icon: Calendar },
  { to: '/bibliotek', label: 'Bibliotek',     Icon: BookOpen },
  { to: '/inkop',     label: 'Inköp',         Icon: ShoppingCart },
  { to: '/inst',      label: 'Inställningar', Icon: Settings },
]

function NavItem({ to, label, Icon }: { to: string; label: string; Icon: LucideIcon }) {
  const isDesktop = useIsDesktop()
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors
         ${isActive
           ? 'bg-brand-100 text-brand-800'
           : 'text-gray-700 hover:bg-gray-100'
         }
         ${isDesktop ? '' : 'flex-col gap-0.5 text-xs py-1.5'}
        `
      }
    >
      <Icon className={isDesktop ? 'w-4 h-4 shrink-0' : 'w-5 h-5 shrink-0'} />
      <span>{label}</span>
    </NavLink>
  )
}

export default function AppShell({ user, logout, saveStatus, saveError, onRetrySave }: Props) {
  const isDesktop = useIsDesktop()
  const [debugOpen, setDebugOpen] = useState(false)

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

  if (isDesktop) {
    return (
      <div className="flex h-screen bg-gray-50">
        {/* Sidebar */}
        <aside className="w-56 bg-white border-r border-gray-200 flex flex-col py-6 px-3 gap-1 shrink-0">
          <div className="px-3 mb-6">
            <h1 className="text-base font-bold text-gray-900 tracking-tight">Matplanering</h1>
          </div>
          {NAV_ITEMS.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}
          <div className="mt-auto flex flex-col gap-2 px-3">
            <SaveIndicator status={saveStatus} error={saveError} onRetry={onRetrySave} />
            <button
              onClick={logout}
              className="text-xs text-gray-500 hover:text-gray-700 text-left"
            >
              {user.email} · Logga ut
            </button>
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Top bar with week navigator */}
          <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-4">
            <WeekNavigator />
          </header>
          <main className="flex-1 overflow-y-auto p-6">
            <Outlet />
          </main>
        </div>

        {debugOpen && <DebugPanel onClose={() => setDebugOpen(false)} saveStatus={saveStatus} saveError={saveError} />}
      </div>
    )
  }

  // Mobile layout
  return (
    <div className="flex flex-col h-dvh bg-gray-50">
      {/* Mobile top bar */}
      <header className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between">
        <WeekNavigator />
        <SaveIndicator status={saveStatus} error={saveError} onRetry={onRetrySave} />
      </header>

      {/* Scrollable content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>

      {/* Bottom navigation */}
      <nav className="bg-white border-t border-gray-200 px-2 py-1 flex justify-around safe-area-inset-bottom">
        {NAV_ITEMS.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}
      </nav>

      {debugOpen && <DebugPanel onClose={() => setDebugOpen(false)} saveStatus={saveStatus} saveError={saveError} />}
    </div>
  )
}
