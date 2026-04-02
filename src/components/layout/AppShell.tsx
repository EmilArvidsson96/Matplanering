import { NavLink, Outlet } from 'react-router-dom'
import { useIsDesktop } from '../../hooks/useDevice'
import WeekNavigator from './WeekNavigator'
import SaveIndicator from './SaveIndicator'
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
  { to: '/',          label: 'Veckoplanen', icon: '📅' },
  { to: '/bibliotek', label: 'Bibliotek',   icon: '📚' },
  { to: '/inkop',     label: 'Inköp',       icon: '🛒' },
  { to: '/inst',      label: 'Inställningar',icon: '⚙️' },
]

function NavItem({ to, label, icon }: { to: string; label: string; icon: string }) {
  const isDesktop = useIsDesktop()
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors
         ${isActive
           ? 'bg-brand-100 text-brand-800'
           : 'text-gray-600 hover:bg-gray-100'
         }
         ${isDesktop ? '' : 'flex-col gap-0.5 text-xs py-1'}
        `
      }
    >
      <span className="text-lg leading-none">{icon}</span>
      <span>{label}</span>
    </NavLink>
  )
}

export default function AppShell({ user, logout, saveStatus, saveError, onRetrySave }: Props) {
  const isDesktop = useIsDesktop()

  if (isDesktop) {
    return (
      <div className="flex h-screen bg-gray-50">
        {/* Sidebar */}
        <aside className="w-56 bg-white border-r border-gray-100 flex flex-col py-6 px-3 gap-1 shrink-0">
          <div className="px-3 mb-6">
            <h1 className="text-lg font-bold text-brand-700">🍽️ Matplanering</h1>
          </div>
          {NAV_ITEMS.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}
          <div className="mt-auto flex flex-col gap-2 px-3">
            <SaveIndicator status={saveStatus} error={saveError} onRetry={onRetrySave} />
            <button
              onClick={logout}
              className="text-xs text-gray-400 hover:text-gray-600 text-left"
            >
              {user.email} · Logga ut
            </button>
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Top bar with week navigator */}
          <header className="bg-white border-b border-gray-100 px-6 py-3 flex items-center gap-4">
            <WeekNavigator />
          </header>
          <main className="flex-1 overflow-y-auto p-6">
            <Outlet />
          </main>
        </div>
      </div>
    )
  }

  // Mobile layout
  return (
    <div className="flex flex-col h-dvh bg-gray-50">
      {/* Mobile top bar */}
      <header className="bg-white border-b border-gray-100 px-4 py-2 flex items-center justify-between">
        <WeekNavigator />
        <SaveIndicator status={saveStatus} error={saveError} onRetry={onRetrySave} />
      </header>

      {/* Scrollable content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>

      {/* Bottom navigation */}
      <nav className="bg-white border-t border-gray-100 px-2 py-1 flex justify-around safe-area-inset-bottom">
        {NAV_ITEMS.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}
      </nav>
    </div>
  )
}
