import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import type { Dish } from '../types'

interface LibraryStore {
  dishes: Dish[]
  sha: string | undefined
  isDirty: boolean
  load: (dishes: Dish[], sha: string | undefined) => void
  seed: (dishes: Dish[]) => void
  addDish: (dish: Omit<Dish, 'id' | 'cookingHistory'>) => string
  updateDish: (id: string, patch: Partial<Dish>) => void
  deleteDish: (id: string) => void
  markClean: (sha: string | undefined) => void
}

export const useLibraryStore = create<LibraryStore>((set) => ({
  dishes: [],
  sha: undefined,
  isDirty: false,

  load: (dishes, sha) => set({ dishes, sha, isDirty: false }),

  seed: (dishes) => set({ dishes, sha: undefined, isDirty: true }),

  addDish: (dish) => {
    const id = uuid()
    set((s) => ({
      dishes: [...s.dishes, { ...dish, id, cookingHistory: [] }],
      isDirty: true,
    }))
    return id
  },

  updateDish: (id, patch) =>
    set((s) => ({
      dishes: s.dishes.map((d) => (d.id === id ? { ...d, ...patch } : d)),
      isDirty: true,
    })),

  deleteDish: (id) =>
    set((s) => ({
      dishes: s.dishes.filter((d) => d.id !== id),
      isDirty: true,
    })),

  markClean: (sha) => set({ isDirty: false, sha }),
}))
