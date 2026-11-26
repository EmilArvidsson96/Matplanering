import { useEffect } from 'react'
import { useLibraryStore } from '../store/libraryStore'
import { needsAutoImage, pickDishImage, toAutoImage } from '../utils/dishImage'

let running = false

/**
 * Finds pictures for dishes without one, in the background, one dish at a
 * time. Results are saved on the dish (and synced like any other edit), so
 * each dish is only searched once — again only if its name or link changes.
 */
export function useAutoDishImages(enabled: boolean) {
  const dishes = useLibraryStore(s => s.dishes)
  const pending = enabled && dishes.some(d => needsAutoImage(d))

  useEffect(() => {
    if (!pending || running) return
    // Runs to completion (App never unmounts); it re-reads the library each
    // round, so dishes added meanwhile are picked up too.
    running = true
    ;(async () => {
      const tried = new Set<string>()
      try {
        while (true) {
          const dish = useLibraryStore.getState().dishes.find(d => needsAutoImage(d) && !tried.has(d.id))
          if (!dish) break
          tried.add(dish.id)
          let pick
          try {
            pick = await pickDishImage(dish)
          } catch {
            // Search unreachable (offline, proxy down) — stop and try again next session.
            break
          }
          // The dish may have been edited or deleted while we searched.
          const now = useLibraryStore.getState().dishes.find(d => d.id === dish.id)
          if (!now || now.name !== dish.name || now.recipeUrl !== dish.recipeUrl || now.imageUrl?.trim()) continue
          useLibraryStore.getState().updateDish(dish.id, { autoImage: toAutoImage(dish, pick) })
          await new Promise(r => setTimeout(r, 400))
        }
      } finally {
        running = false
      }
    })()
  }, [pending])
}
