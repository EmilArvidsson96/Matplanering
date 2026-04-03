import { useCallback, useEffect, useRef, useState } from 'react'
import { getFile, saveFile } from '../api/github'
import { useWeekStore } from '../store/weekStore'
import { useLibraryStore } from '../store/libraryStore'
import { useSettingsStore } from '../store/settingsStore'
import { migrateWeek } from '../utils/weekUtils'
import type { AppSettings, LibraryData, WeekPlan } from '../types'

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

  const save = useCallback(async () => {
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

      // Save library if dirty
      if (libraryStore.isDirty) {
        const data: LibraryData = { dishes: libraryStore.dishes }
        const newSha = await saveFile(
          'library.json',
          JSON.stringify(data, null, 2),
          libraryStore.sha,
          'Uppdaterat bibliotek',
        )
        libraryStore.markClean(newSha)
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
    }
  }, [weekStore, libraryStore, settingsStore])

  const isDirty =
    weekStore.dirtyWeeks.size > 0 || libraryStore.isDirty || settingsStore.isDirty

  useEffect(() => {
    if (!isDirty) return
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(save, DEBOUNCE_MS)
    return () => clearTimeout(timerRef.current)
  }, [isDirty, save])

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
          libraryStore.load((JSON.parse(file.content) as LibraryData).dishes, file.sha)
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
      libraryStore.load(data.dishes, libFile.sha)
    } else {
      const { INITIAL_DISHES } = await import('../data/library')
      libraryStore.seed(INITIAL_DISHES)
    }
  } else {
    const { INITIAL_DISHES } = await import('../data/library')
    libraryStore.seed(INITIAL_DISHES)
  }

  // Load active week
  const id = weekStore.activeWeekId
  const weekFile = await getFile(`weeks/${id}.json`)
  if (weekFile) {
    weekStore.loadWeek(JSON.parse(weekFile.content) as WeekPlan, weekFile.sha)
  }
}
