import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useNetlifyIdentity } from './hooks/useNetlifyIdentity'
import { useAutoSave, loadInitialData } from './hooks/useAutoSave'
import { useWeekLoader } from './hooks/useWeekLoader'
import { useWeekStore } from './store/weekStore'
import AppShell from './components/layout/AppShell'
import LoginPage from './components/auth/LoginPage'
import WeekPlanPage from './components/WeekPlanPage'
import LibraryPage from './components/library/LibraryPage'
import ShoppingPage from './components/shopping/ShoppingPage'
import SettingsPage from './components/settings/SettingsPage'

export default function App() {
  const { user, loading, login, logout, getToken } = useNetlifyIdentity()
  const [dataLoaded, setDataLoaded] = useState(false)
  const { status: saveStatus, saveError, saveNow } = useAutoSave(getToken)
  const loadWeek = useWeekLoader()
  const activeWeekId = useWeekStore(s => s.activeWeekId)

  // Load data once after login
  useEffect(() => {
    if (!user || dataLoaded) return
    loadInitialData(getToken).then(() => setDataLoaded(true))
  }, [user, dataLoaded, getToken])

  // Load the active week whenever it changes
  useEffect(() => {
    if (!dataLoaded) return
    loadWeek(activeWeekId)
  }, [activeWeekId, dataLoaded, loadWeek])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-50">
        <div className="text-brand-600 text-sm animate-pulse">Laddar…</div>
      </div>
    )
  }

  if (!user) {
    return <LoginPage onLogin={login} />
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell user={user} logout={logout} saveStatus={saveStatus} saveError={saveError} onRetrySave={saveNow} />}>
          <Route index element={<WeekPlanPage />} />
          <Route path="bibliotek" element={<LibraryPage />} />
          <Route path="inkop"     element={<ShoppingPage />} />
          <Route path="inst"      element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
