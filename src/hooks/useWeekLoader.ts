import { useCallback } from 'react'
import { getFile } from '../api/github'
import { useWeekStore } from '../store/weekStore'
import { useSettingsStore } from '../store/settingsStore'
import { createEmptyWeek, migrateWeek } from '../utils/weekUtils'
import type { WeekPlan } from '../types'

/** Returns a function that loads a specific week from GitHub (or creates empty). */
export function useWeekLoader() {
  const weekStore = useWeekStore()
  const { settings } = useSettingsStore()

  return useCallback(async (weekId: string) => {
    if (weekStore.weeks[weekId]) return  // already loaded

    try {
      const file = await getFile(`weeks/${weekId}.json`)
      if (file) {
        const plan = migrateWeek(JSON.parse(file.content) as WeekPlan)
        weekStore.loadWeek(plan, file.sha)
      } else {
        weekStore.loadWeek(createEmptyWeek(weekId, settings.defaultHouseholdSize), undefined)
      }
    } catch {
      weekStore.loadWeek(createEmptyWeek(weekId, settings.defaultHouseholdSize), undefined)
    }
  }, [weekStore, settings.defaultHouseholdSize])
}
