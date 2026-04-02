import { useCallback } from 'react'
import { getFile } from '../api/github'
import { useWeekStore } from '../store/weekStore'
import { useSettingsStore } from '../store/settingsStore'
import { createEmptyWeek, migrateWeek, type WeekWindowOpts } from '../utils/weekUtils'
import type { WeekPlan } from '../types'

/** Returns a function that loads a specific week from GitHub (or creates empty).
 *  Pass `opts` when navigating forward to a brand-new week with a custom window. */
export function useWeekLoader() {
  const weekStore = useWeekStore()
  const { settings } = useSettingsStore()

  return useCallback(async (weekId: string, opts?: WeekWindowOpts) => {
    if (weekStore.weeks[weekId]) return  // already loaded

    try {
      const file = await getFile(`weeks/${weekId}.json`)
      if (file) {
        const plan = migrateWeek(JSON.parse(file.content) as WeekPlan)
        weekStore.loadWeek(plan, file.sha)
      } else {
        weekStore.loadWeek(createEmptyWeek(weekId, settings.defaultHouseholdSize, opts), undefined)
      }
    } catch {
      weekStore.loadWeek(createEmptyWeek(weekId, settings.defaultHouseholdSize, opts), undefined)
    }
  }, [weekStore, settings.defaultHouseholdSize])
}
