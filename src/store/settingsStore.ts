import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import type { AppSettings, UnitConversion } from '../types'

interface SettingsStore {
  settings: AppSettings
  sha: string | undefined
  isDirty: boolean
  load: (settings: AppSettings, sha: string | undefined) => void
  update: (patch: Partial<AppSettings>) => void
  addPantryItem: (item: string) => void
  removePantryItem: (item: string) => void
  addUnitConversion: (conv: Omit<UnitConversion, 'id'>) => void
  removeUnitConversion: (id: string) => void
  applyCostOverrides: (patch: Record<string, number>) => void
  removeCostOverride: (name: string) => void
  clearCostOverrides: () => void
  markClean: (sha: string | undefined) => void
}

const DEFAULT: AppSettings = {
  defaultHouseholdSize: 2,
  costPerPortion: 35,
  pantryItems: [],
  unitConversions: [],
  anthropicApiKey: '',
  aiModel: 'haiku',
  calibrationModel: 'sonnet',
  costOverrides: {},
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  settings: DEFAULT,
  sha: undefined,
  isDirty: false,

  load: (settings, sha) => set({
    settings: { ...DEFAULT, ...settings },
    sha,
    isDirty: false,
  }),

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

  addUnitConversion: (conv) =>
    set((s) => ({
      settings: {
        ...s.settings,
        unitConversions: [...s.settings.unitConversions, { ...conv, id: uuid() }],
      },
      isDirty: true,
    })),

  removeUnitConversion: (id) =>
    set((s) => ({
      settings: {
        ...s.settings,
        unitConversions: s.settings.unitConversions.filter((c) => c.id !== id),
      },
      isDirty: true,
    })),

  applyCostOverrides: (patch) =>
    set((s) => ({
      settings: {
        ...s.settings,
        costOverrides: { ...(s.settings.costOverrides ?? {}), ...patch },
      },
      isDirty: true,
    })),

  removeCostOverride: (name) =>
    set((s) => {
      const next = { ...(s.settings.costOverrides ?? {}) }
      delete next[name]
      return { settings: { ...s.settings, costOverrides: next }, isDirty: true }
    }),

  clearCostOverrides: () =>
    set((s) => ({
      settings: { ...s.settings, costOverrides: {} },
      isDirty: true,
    })),

  markClean: (sha) => set({ isDirty: false, sha }),
}))
