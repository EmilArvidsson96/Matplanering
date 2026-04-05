import { useEffect, useState } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { usePinAuth } from './hooks/usePinAuth'
import { useAutoSave, loadInitialData } from './hooks/useAutoSave'
import { useWeekLoader } from './hooks/useWeekLoader'
import { useWeekStore } from './store/weekStore'
import AppShell from './components/layout/AppShell'
import LoginPage from './components/auth/LoginPage'
import SummaryPage from './components/SummaryPage'
import WeekPlanPage from './components/WeekPlanPage'
import LibraryPage from './components/library/LibraryPage'
import ShoppingPage from './components/shopping/ShoppingPage'
import SettingsPage from './components/settings/SettingsPage'
import RecipePage from './components/recipe/RecipePage'

export default function App() {
  const { authed, login, logout } = usePinAuth()
  const [dataLoaded, setDataLoaded] = useState(false)
  const { status: saveStatus, saveError, saveNow } = useAutoSave()
  const loadWeek = useWeekLoader()
  const activeWeekId = useWeekStore(s => s.activeWeekId)

  // Load data once after login
  useEffect(() => {
    if (!authed || dataLoaded) return
    loadInitialData().then(() => setDataLoaded(true))
  }, [authed, dataLoaded])

  // Load the active week whenever it changes
  useEffect(() => {
    if (!dataLoaded) return
    loadWeek(activeWeekId)
  }, [activeWeekId, dataLoaded, loadWeek])

  if (!authed) {
    return <LoginPage onLogin={login} />
  }

  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell logout={logout} saveStatus={saveStatus} saveError={saveError} onRetrySave={saveNow} />}>
          <Route path="recept"    element={<RecipePage />} />
          <Route index element={<SummaryPage />} />
          <Route path="planera" element={<WeekPlanPage />} />
          <Route path="bibliotek" element={<LibraryPage />} />
          <Route path="inkop"     element={<ShoppingPage />} />
          <Route path="inst"      element={<SettingsPage />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
