import { create } from 'zustand'
import type { AppSettings } from '../types'

interface SettingsStore {
  settings: AppSettings
  sha: string | undefined
  isDirty: boolean
  load: (settings: AppSettings, sha: string | undefined) => void
  update: (patch: Partial<AppSettings>) => void
  addPantryItem: (item: string) => void
  removePantryItem: (item: string) => void
  markClean: (sha: string | undefined) => void
}

const DEFAULT: AppSettings = {
  defaultHouseholdSize: 2,
  costPerPortion: 35,
  pantryItems: [],
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  settings: DEFAULT,
  sha: undefined,
  isDirty: false,

  load: (settings, sha) => set({ settings, sha, isDirty: false }),

  update: (patch) =>
    set((s) => ({ settings: { ...s.settings, ...patch }, isDirty: true })),

  addPantryItem: (item) =>
    set((s) => ({
      settings: {
        ...s.settings,
        pantryItems: [...s.settings.pantryItems, item],
      },
      isDirty: true,
    })),

  removePantryItem: (item) =>
    set((s) => ({
      settings: {
        ...s.settings,
        pantryItems: s.settings.pantryItems.filter((p) => p !== item),
      },
      isDirty: true,
    })),

  markClean: (sha) => set({ isDirty: false, sha }),
}))
