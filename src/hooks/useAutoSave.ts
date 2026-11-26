import { useCallback, useEffect, useRef, useState } from 'react'
import { getFile, saveFile } from '../api/github'
import { useWeekStore } from '../store/weekStore'
import { useLibraryStore } from '../store/libraryStore'
import { useSettingsStore } from '../store/settingsStore'
import { useGameStore } from '../store/gameStore'
import { migrateWeek, migrateDishCategories } from '../utils/weekUtils'
import type { AppSettings, LibraryData, WeekPlan } from '../types'
import type { GameData } from '../types/game'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'
export type SaveError = string | null

const DEBOUNCE_MS = 5000
const POLL_INTERVAL_MS = 30_000

export function useAutoSave() {
  const [status, setStatus]       = useState<SaveStatus>('idle')
  const [saveError, setSaveError] = useState<SaveError>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  const weekStore     = useWeekStore()
  const libraryStore  = useLibraryStore()
  const settingsStore = useSettingsStore()
  const gameStore     = useGameStore()

  const inFlightRef = useRef(false)

  const save = useCallback(async () => {
    // Two overlapping saves would send the same sha and conflict. Anything
    // changed meanwhile stays dirty and is picked up by the next debounce.
    if (inFlightRef.current) return
    inFlightRef.current = true
    setStatus('saving')
    try {
      // Save dirty weeks
      for (const weekId of weekStore.dirtyWeeks) {
        const plan = weekStore.weeks[weekId]
        if (!plan) continue
        const path = `weeks/${weekId}.json`
        const sha  = weekStore.shas[weekId]
        const newSha = await saveFile(path, JSON.stringify(plan, null, 2), sha, `Vecka ${weekId}`)
        weekStore.markClean(weekId, newSha)
      }

      // Save library if dirty. Read live state (not the render snapshot) and
      // remember the revision, so edits made while the request is in flight —
      // e.g. an AI result applied right after another change — stay dirty and
      // get saved in the next round instead of being marked as saved.
      const lib = useLibraryStore.getState()
      if (lib.isDirty) {
        const revision = lib.revision
        const data: LibraryData = { dishes: lib.dishes }
        const newSha = await saveFile(
          'library.json',
          JSON.stringify(data, null, 2),
          lib.sha,
          'Uppdaterat bibliotek',
        )
        useLibraryStore.getState().markClean(newSha, revision)
      }

      // Save game data if dirty
      if (gameStore.isDirty) {
        const newSha = await saveFile(
          'game.json',
          JSON.stringify(gameStore.data, null, 2),
          gameStore.sha,
          'Uppdaterad spelstatus',
        )
        gameStore.markClean(newSha)
      }

      // Save settings if dirty
      if (settingsStore.isDirty) {
        const newSha = await saveFile(
          'settings.json',
          JSON.stringify(settingsStore.settings, null, 2),
          settingsStore.sha,
          'Uppdaterade inställningar',
        )
        settingsStore.markClean(newSha)
      }

      setStatus('saved')
      setSaveError(null)
    } catch (e) {
      console.error('AutoSave failed', e)
      setStatus('error')
      setSaveError(e instanceof Error ? e.message : String(e))
    } finally {
      inFlightRef.current = false
    }
  }, [weekStore, libraryStore, settingsStore, gameStore])

  const isDirty =
    weekStore.dirtyWeeks.size > 0 || libraryStore.isDirty || settingsStore.isDirty || gameStore.isDirty

  useEffect(() => {
    if (!isDirty) return
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(save, DEBOUNCE_MS)
    return () => clearTimeout(timerRef.current)
  }, [isDirty, save])

  // Save right away when the app is hidden or closed (mobile app switch, tab
  // close) so changes inside the debounce window aren't lost.
  const saveRef = useRef(save)
  saveRef.current = save
  const dirtyRef = useRef(isDirty)
  dirtyRef.current = isDirty
  useEffect(() => {
    const flush = () => {
      if (!dirtyRef.current) return
      clearTimeout(timerRef.current)
      void saveRef.current()
    }
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush() }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', flush)
    }
  }, [])

  // Poll for remote changes every 30s and silently refresh non-dirty data.
  const pollRef = useRef<() => Promise<void>>()
  pollRef.current = async () => {
    try {
      const weekId = weekStore.activeWeekId
      if (!weekStore.dirtyWeeks.has(weekId)) {
        const file = await getFile(`weeks/${weekId}.json`)
        if (file && file.sha !== weekStore.shas[weekId]) {
          weekStore.loadWeek(migrateWeek(JSON.parse(file.content) as WeekPlan), file.sha)
        }
      }
      if (!libraryStore.isDirty) {
        const file = await getFile('library.json')
        if (file && file.sha !== libraryStore.sha) {
          libraryStore.load(migrateDishCategories((JSON.parse(file.content) as LibraryData).dishes), file.sha)
        }
      }
      if (!settingsStore.isDirty) {
        const file = await getFile('settings.json')
        if (file && file.sha !== settingsStore.sha) {
          settingsStore.load(JSON.parse(file.content) as AppSettings, file.sha)
        }
      }
    } catch {
      // polling errors are non-critical
    }
  }
  useEffect(() => {
    const id = setInterval(() => { pollRef.current?.() }, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [])

  return { status, saveError, saveNow: save }
}

/** Load initial data from GitHub on app startup. */
export async function loadInitialData() {
  const weekStore     = useWeekStore.getState()
  const libraryStore  = useLibraryStore.getState()
  const settingsStore = useSettingsStore.getState()
  const gameStore     = useGameStore.getState()

  // Load game data
  try {
    const gameFile = await getFile('game.json')
    if (gameFile) {
      gameStore.load(JSON.parse(gameFile.content) as GameData, gameFile.sha)
    }
  } catch { /* optional */ }

  // Load settings
  const settingsFile = await getFile('settings.json')
  if (settingsFile) {
    settingsStore.load(JSON.parse(settingsFile.content) as AppSettings, settingsFile.sha)
  }

  // Load library
  const libFile = await getFile('library.json')
  if (libFile) {
    const data = JSON.parse(libFile.content) as LibraryData
    if (data.dishes && data.dishes.length > 0) {
      libraryStore.load(migrateDishCategories(data.dishes), libFile.sha)
    } else {
      const { INITIAL_DISHES } = await import('../data/library')
      libraryStore.seed(migrateDishCategories(INITIAL_DISHES))
    }
  } else {
    const { INITIAL_DISHES } = await import('../data/library')
    libraryStore.seed(migrateDishCategories(INITIAL_DISHES))
  }

  // Load active week
  const id = weekStore.activeWeekId
  const weekFile = await getFile(`weeks/${id}.json`)
  if (weekFile) {
    weekStore.loadWeek(migrateWeek(JSON.parse(weekFile.content) as WeekPlan), weekFile.sha)
  }
}
