import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import type { Dish } from '../types'

interface LibraryStore {
  dishes: Dish[]
  sha: string | undefined
  isDirty: boolean
  /** Bumped on every local change, so a save can tell if edits arrived while it ran. */
  revision: number
  load: (dishes: Dish[], sha: string | undefined) => void
  seed: (dishes: Dish[]) => void
  addDish: (dish: Omit<Dish, 'id' | 'cookingHistory'>) => string
  updateDish: (id: string, patch: Partial<Dish>) => void
  deleteDish: (id: string) => void
  /** Mark saved. If `revision` is given and the library changed since, it stays dirty. */
  markClean: (sha: string | undefined, revision?: number) => void
}

export const useLibraryStore = create<LibraryStore>((set) => ({
  dishes: [],
  sha: undefined,
  isDirty: false,
  revision: 0,

  load: (dishes, sha) => set({ dishes, sha, isDirty: false }),

  seed: (dishes) => set((s) => ({ dishes, sha: undefined, isDirty: true, revision: s.revision + 1 })),

  addDish: (dish) => {
    const id = uuid()
    set((s) => ({
      dishes: [...s.dishes, { ...dish, id, cookingHistory: [] }],
      isDirty: true,
      revision: s.revision + 1,
    }))
    return id
  },

  updateDish: (id, patch) =>
    set((s) => ({
      dishes: s.dishes.map((d) => (d.id === id ? { ...d, ...patch } : d)),
      isDirty: true,
      revision: s.revision + 1,
    })),

  deleteDish: (id) =>
    set((s) => ({
      dishes: s.dishes.filter((d) => d.id !== id),
      isDirty: true,
      revision: s.revision + 1,
    })),

  markClean: (sha, revision) =>
    set((s) => ({ sha, isDirty: revision !== undefined && s.revision !== revision })),
}))

if (typeof window !== 'undefined') {
  ;(window as any).__libraryStore = useLibraryStore
}
