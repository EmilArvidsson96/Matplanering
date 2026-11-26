import { create } from 'zustand'
import { record } from './undoStore'
import { v4 as uuid } from 'uuid'
import type { AppSettings, ProductPreference, RecipeSiteRule, ShopId, ShoppingCategory, UnitConversion } from '../types'
import { categoryKey } from '../data/categories'

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
  setRecipeSiteRule: (host: string, rule: RecipeSiteRule | null) => void
  /** Merge in product choices (null removes that key). */
  setProductPreferences: (patch: Record<string, ProductPreference | null>, shop?: ShopId) => void
  /** Remember a category the household picked by hand for this ingredient name. */
  setCategoryOverride: (name: string, category: ShoppingCategory) => void
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

let loading = false

export const useSettingsStore = create<SettingsStore>((set) => ({
  settings: DEFAULT,
  sha: undefined,
  isDirty: false,

  load: (settings, sha) => {
    loading = true
    try {
      set({ settings: { ...DEFAULT, ...settings }, sha, isDirty: false })
    } finally {
      loading = false
    }
  },

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

  setRecipeSiteRule: (host, rule) =>
    set((s) => {
      const next = { ...(s.settings.recipeSiteRules ?? {}) }
      if (rule) next[host] = rule
      else delete next[host]
      return { settings: { ...s.settings, recipeSiteRules: next }, isDirty: true }
    }),

  setProductPreferences: (patch, shop = 'mathem') =>
    set((s) => {
      const field = shop === 'ica' ? 'icaProductPreferences' : 'productPreferences'
      const next = { ...(s.settings[field] ?? {}) }
      for (const [key, pref] of Object.entries(patch)) {
        if (pref) next[key] = pref
        else delete next[key]
      }
      return { settings: { ...s.settings, [field]: next }, isDirty: true }
    }),

  setCategoryOverride: (name, category) =>
    set((s) => {
      const key = categoryKey(name)
      if (!key || s.settings.categoryOverrides?.[key] === category) return s
      return {
        settings: { ...s.settings, categoryOverrides: { ...s.settings.categoryOverrides, [key]: category } },
        isDirty: true,
      }
    }),

  markClean: (sha) => set({ isDirty: false, sha }),
}))

// Every settings change by the user is undoable (⌘Z). Quick successive
// changes (typing in a field) merge into one step.
useSettingsStore.subscribe((state, prev) => {
  if (loading || state.settings === prev.settings) return
  const before = prev.settings
  const after = state.settings
  record(
    () => useSettingsStore.setState({ settings: before, isDirty: true }),
    () => useSettingsStore.setState({ settings: after, isDirty: true }),
    'settings',
  )
})
