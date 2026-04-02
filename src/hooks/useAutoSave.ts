import { useCallback, useEffect, useRef, useState } from 'react'
import { getFile, saveFile, setAuthToken } from '../api/github'
import { useWeekStore } from '../store/weekStore'
import { useLibraryStore } from '../store/libraryStore'
import { useSettingsStore } from '../store/settingsStore'
import type { AppSettings, LibraryData, WeekPlan } from '../types'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

const DEBOUNCE_MS = 5000

export function useAutoSave(getToken: () => Promise<string | null>) {
  const [status, setStatus] = useState<SaveStatus>('idle')
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  const weekStore     = useWeekStore()
  const libraryStore  = useLibraryStore()
  const settingsStore = useSettingsStore()

  const save = useCallback(async () => {
    const token = await getToken()
    if (!token) return
    setAuthToken(token)

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
    } catch (e) {
      console.error('AutoSave failed', e)
      setStatus('error')
    }
  }, [weekStore, libraryStore, settingsStore, getToken])

  const isDirty =
    weekStore.dirtyWeeks.size > 0 || libraryStore.isDirty || settingsStore.isDirty

  useEffect(() => {
    if (!isDirty) return
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(save, DEBOUNCE_MS)
    return () => clearTimeout(timerRef.current)
  }, [isDirty, save])

  return { status, saveNow: save }
}

/** Load initial data from GitHub on app startup. */
export async function loadInitialData(getToken: () => Promise<string | null>) {
  const token = await getToken()
  if (!token) return
  setAuthToken(token)

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
    libraryStore.load(data.dishes, libFile.sha)
  } else {
    // First run: seed with initial library
    const { INITIAL_DISHES } = await import('../data/library')
    libraryStore.load(INITIAL_DISHES, undefined)
    libraryStore['isDirty'] = true  // trigger first save
  }

  // Load active week
  const id = weekStore.activeWeekId
  const weekFile = await getFile(`weeks/${id}.json`)
  if (weekFile) {
    weekStore.loadWeek(JSON.parse(weekFile.content) as WeekPlan, weekFile.sha)
  }
}
