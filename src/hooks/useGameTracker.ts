import { useEffect, useRef } from 'react'
import { useGameStore } from '../store/gameStore'
import { useWeekStore } from '../store/weekStore'
import { useLibraryStore } from '../store/libraryStore'
import { useSettingsStore } from '../store/settingsStore'
import { weekPlanImpact, dishImpactPerPortion } from '../utils/ingredientImpact'
import { isFullyComplete } from '../utils/recipeCompleteness'
import type { Dish, WeekPlan } from '../types'

const ECO_PROTEINS = new Set(['vegetarisk', 'vegan', 'fisk'])
const HEALTHY_TAGS = new Set(['lågfett', 'lowfodmap', 'lchf'])

// CO2e per portion thresholds (kg) for climate-bonus tiers
const CO2_GREEN = 0.5     // grade A
const CO2_OK = 1.5        // grade B/C border

// Snapshot of a dish's filled fields for diffing.
// Defensive against legacy/partial library data — any array property may be missing.
function arr<T>(a: T[] | undefined | null): T[] {
  return Array.isArray(a) ? a : []
}
function dishSnapshot(dish: Dish) {
  return {
    name:         !!dish.name?.trim(),
    protein:      arr(dish.protein).length > 0,
    carb:         arr(dish.carb).length > 0,
    cuisine:      !!dish.cuisine && dish.cuisine !== 'övrigt',
    type:         arr(dish.type).length > 0,
    tags:         arr(dish.tags).length > 0,
    notes:        !!dish.notes?.trim(),
    recipeUrl:    !!dish.recipeUrl?.trim(),
    preferredMonths: arr(dish.preferredMonths).length > 0,
    ingredientCount:  arr(dish.ingredients).length,
    instructionCount: arr(dish.instructions).length,
  }
}

type Snap = ReturnType<typeof dishSnapshot>
const EMPTY_SNAP: Snap = {
  name: false, protein: false, carb: false, cuisine: false, type: false, tags: false,
  notes: false, recipeUrl: false, preferredMonths: false,
  ingredientCount: 0, instructionCount: 0,
}

// Per-field worth (points) — must align with handbook
const FIELD_POINTS = {
  protein: 4, carb: 3, cuisine: 3, type: 3, tags: 3,
  notes: 2, recipeUrl: 3, preferredMonths: 4,
  // Ingredients/instructions are typically imported from a source recipe,
  // so they're rewarded as flat "added" bonuses (not per-item).
  ingredients: 8, instructions: 8,
} as const

function totalCompletedDishes(dishes: Dish[]): number {
  return dishes.filter(isFullyComplete).length
}

export function useGameTracker() {
  const lastDishesRef = useRef<Map<string, Dish>>(new Map())
  const lastWeekRef = useRef<Map<string, WeekPlan>>(new Map())
  const seededRef = useRef(false)

  useEffect(() => {
    function checkLibrary() {
      const game = useGameStore.getState()
      const players = game.data.players
      if (!game.data.gameMode || players.length === 0) return
      const active = game.data.activePlayerId ?? players[0]?.id
      if (!active) return

      const dishes = useLibraryStore.getState().dishes
      const prev = lastDishesRef.current

      const completedBefore = totalCompletedDishes([...prev.values()])
      let completedAfter = completedBefore

      for (const dish of dishes) {
        const before = prev.get(dish.id)
        if (!before) {
          // freshly seen dish
          if (!seededRef.current) continue   // first sync — just record snapshot
          const key = `dish-created-${dish.id}`
          if (!game.hasKey(key)) {
            game.markKey(key)
            game.award({
              playerIds: [active],
              points: 10,
              reason: 'dish_created',
              label: `📖 Nytt recept: ${dish.name}`,
              splitKey: key,
              context: dish.id,
            })
          }
        }

        const oldSnap = before ? dishSnapshot(before) : EMPTY_SNAP
        const newSnap = dishSnapshot(dish)

        // ── Per-field rewards (each field rewarded once via key) ──
        const fieldChecks: Array<[keyof Snap, number, string, string]> = [
          ['protein',         FIELD_POINTS.protein,         'protein',  '🥩 Protein ifyllt'],
          ['carb',            FIELD_POINTS.carb,            'carb',     '🍚 Kolhydrat ifylld'],
          ['cuisine',         FIELD_POINTS.cuisine,         'cuisine',  '🌍 Köksstil ifylld'],
          ['type',            FIELD_POINTS.type,            'type',     '🍽️ Maträttstyp ifylld'],
          ['tags',            FIELD_POINTS.tags,            'tags',     '🏷️ Taggar tillagda'],
          ['notes',           FIELD_POINTS.notes,           'notes',    '📝 Noter skrivna'],
          ['recipeUrl',       FIELD_POINTS.recipeUrl,       'url',      '🔗 Källänk tillagd'],
          ['preferredMonths', FIELD_POINTS.preferredMonths, 'season',   '🌱 Säsong ifylld'],
        ]
        for (const [field, pts, prefix, label] of fieldChecks) {
          const wasDone = oldSnap[field]
          const nowDone = newSnap[field]
          const key = `f-${prefix}-${dish.id}`
          if (nowDone && !wasDone && !game.hasKey(key)) {
            game.markKey(key)
            game.award({
              playerIds: [active],
              points: pts,
              reason: 'dish_categories_complete',
              label: `${label} — ${dish.name}`,
              splitKey: key,
              context: dish.id,
            })
          }
        }

        // ── Ingredients added (flat one-time bonus — typically imported from source) ──
        if (newSnap.ingredientCount > 0 && oldSnap.ingredientCount === 0) {
          const key = `ing-${dish.id}`
          if (!game.hasKey(key)) {
            game.markKey(key)
            game.award({
              playerIds: [active],
              points: FIELD_POINTS.ingredients,
              reason: 'dish_ingredients_added',
              label: `🥕 Ingredienser tillagda — ${dish.name}`,
              splitKey: key,
              context: dish.id,
            })
          }
        }

        // ── Instructions added (flat one-time bonus) ──
        if (newSnap.instructionCount > 0 && oldSnap.instructionCount === 0) {
          const key = `step-${dish.id}`
          if (!game.hasKey(key)) {
            game.markKey(key)
            game.award({
              playerIds: [active],
              points: FIELD_POINTS.instructions,
              reason: 'dish_instructions_added',
              label: `📋 Instruktioner tillagda — ${dish.name}`,
              splitKey: key,
              context: dish.id,
            })
          }
        }

        // ── Fully complete combo bonus + early-game multiplier ──
        const fullKey = `full-${dish.id}`
        if (isFullyComplete(dish) && !game.hasKey(fullKey)) {
          game.markKey(fullKey)
          completedAfter += 1
          // Early-game x2 multiplier for first 5 polished recipes (globally)
          const multiplier = completedBefore < 5 ? 2 : 1
          const base = 25
          const points = base * multiplier
          game.award({
            playerIds: [active],
            points,
            reason: 'dish_fully_complete',
            label: multiplier > 1
              ? `🎯✨ Komplett recept (x${multiplier}): ${dish.name}`
              : `🎯 Komplett recept: ${dish.name}`,
            splitKey: fullKey,
            context: dish.id,
          })
        }
      }

      // ── Diversity bonuses (after all dish processing) ──
      const polished = dishes.filter(isFullyComplete)
      // Cuisine sweep: 3+ complete recipes in same cuisine
      const cuisineCounts: Record<string, number> = {}
      for (const d of polished) cuisineCounts[d.cuisine] = (cuisineCounts[d.cuisine] ?? 0) + 1
      for (const [cuisine, count] of Object.entries(cuisineCounts)) {
        if (count >= 3) {
          const key = `cuisine-master-${cuisine}`
          if (!game.hasKey(key)) {
            game.markKey(key)
            game.award({
              playerIds: [active],
              points: 30,
              reason: 'achievement_unlocked',
              label: `🌍 Köks-mästare: ${cuisine} (3 kompletta)`,
              splitKey: key,
              context: cuisine,
            })
          }
        }
      }
      // Cuisine variety: at least one complete recipe in N distinct cuisines
      const distinctCuisines = new Set(polished.map(d => d.cuisine).filter(c => c && c !== 'övrigt')).size
      for (const milestone of [3, 5, 8]) {
        if (distinctCuisines >= milestone) {
          const key = `cuisine-variety-${milestone}`
          if (!game.hasKey(key)) {
            game.markKey(key)
            game.award({
              playerIds: [active],
              points: 25 * milestone,
              reason: 'achievement_unlocked',
              label: `🗺️ ${milestone} olika köksstilar kompletta`,
              splitKey: key,
            })
          }
        }
      }
      // Protein variety
      const proteinSet = new Set<string>()
      for (const d of polished) arr(d.protein).forEach(p => proteinSet.add(p))
      for (const milestone of [3, 5, 8]) {
        if (proteinSet.size >= milestone) {
          const key = `protein-variety-${milestone}`
          if (!game.hasKey(key)) {
            game.markKey(key)
            game.award({
              playerIds: [active],
              points: 20 * milestone,
              reason: 'achievement_unlocked',
              label: `🥗 ${milestone} olika proteiner kompletta`,
              splitKey: key,
            })
          }
        }
      }
      // Polish-burst: 3 complete recipes within 24h
      if (completedAfter > completedBefore) {
        const recentCompletes = game.data.events
          .filter(e => e.reason === 'dish_fully_complete')
          .map(e => new Date(e.ts).getTime())
        const cutoff = Date.now() - 24 * 60 * 60 * 1000
        const recent = recentCompletes.filter(t => t >= cutoff).length
        if (recent >= 3) {
          const key = `polish-burst-${new Date().toISOString().slice(0, 10)}`
          if (!game.hasKey(key)) {
            game.markKey(key)
            game.award({
              playerIds: [active],
              points: 50,
              reason: 'achievement_unlocked',
              label: `⚡ Snabb spurt: 3 recept polerade på 24h`,
              splitKey: key,
            })
          }
        }
      }

      // Update snapshot
      const next = new Map<string, Dish>()
      for (const d of dishes) next.set(d.id, d)
      lastDishesRef.current = next
      if (!seededRef.current) seededRef.current = true
    }

    function checkWeek() {
      const game = useGameStore.getState()
      const players = game.data.players
      if (!game.data.gameMode || players.length === 0) return
      const allPlayerIds = players.map(p => p.id)

      const ws = useWeekStore.getState()
      const settings = useSettingsStore.getState().settings
      const library = useLibraryStore.getState().dishes
      const weeks = ws.weeks

      for (const weekId in weeks) {
        const plan = weeks[weekId]

        // Planning step completions
        const steps = plan.stepsCompleted ?? {}
        const stepDefs: Array<['portioner' | 'brainstorm' | 'schema', number, any, string]> = [
          ['portioner', 5, 'plan_portions_done', 'Portioner klart'],
          ['brainstorm', 10, 'plan_brainstorm_done', 'Brainstorm klart'],
          ['schema', 15, 'plan_schedule_done', 'Schema klart'],
        ]
        for (const [step, pts, reason, label] of stepDefs) {
          if (steps[step]) {
            const key = `step-${weekId}-${step}`
            if (!game.hasKey(key)) {
              game.markKey(key)
              game.award({
                playerIds: allPlayerIds,
                points: pts * allPlayerIds.length,  // so each player gets full pts
                reason,
                label: `${label} (v.${weekId.slice(5)})`,
                splitKey: key,
                context: weekId,
              })
            }
          }
        }

        // All three steps done → full plan
        if (steps.portioner && steps.brainstorm && steps.schema) {
          const key = `fullplan-${weekId}`
          if (!game.hasKey(key)) {
            game.markKey(key)
            game.award({
              playerIds: allPlayerIds,
              points: 30 * allPlayerIds.length,
              reason: 'plan_fully_completed',
              label: `🎉 Veckoplan slutförd!`,
              splitKey: key,
              context: weekId,
            })

            // ── Real-impact climate bonuses (uses ingredient lexicon) ──
            const conversions = settings.unitConversions
            const totalPortions = plan.schedule.reduce(
              (s, sl) => s + (sl.assignments ?? []).reduce((a, x) => a + (x.portions || 0), 0),
              0,
            )
            const totalImpact = weekPlanImpact(plan, library, conversions)
            const co2PerPortion = totalPortions > 0 ? totalImpact.co2eKg / totalPortions : 0

            // Per-dish climate scoring
            let healthyCount = 0
            let ecoCount = 0
            let greenestMeals = 0
            for (const meal of plan.meals) {
              for (const comp of meal.components ?? []) {
                const dish = library.find(d => d.id === comp.dishId)
                if (!dish) continue
                const isEco = arr(dish.protein).some(p => ECO_PROTEINS.has(p))
                const isHealthy = arr(dish.tags).some(t => HEALTHY_TAGS.has(t)) || isEco
                if (isEco) ecoCount += 1
                if (isHealthy) healthyCount += 1
                const perP = dishImpactPerPortion(dish, conversions)
                if (perP.matched && perP.co2eKg < CO2_GREEN) greenestMeals += 1
              }
            }
            if (healthyCount > 0) {
              game.award({
                playerIds: allPlayerIds,
                points: healthyCount * 4 * allPlayerIds.length,
                reason: 'healthy_meal',
                label: `🥗 ${healthyCount} nyttiga måltider`,
                splitKey: `healthy-${weekId}`,
                context: weekId,
              })
            }
            if (ecoCount > 0) {
              game.award({
                playerIds: allPlayerIds,
                points: ecoCount * 5 * allPlayerIds.length,
                reason: 'eco_meal',
                label: `🌍 ${ecoCount} klimatsmarta val`,
                splitKey: `eco-${weekId}`,
                context: weekId,
              })
            }
            if (greenestMeals > 0) {
              game.award({
                playerIds: allPlayerIds,
                points: greenestMeals * 8 * allPlayerIds.length,
                reason: 'eco_meal',
                label: `🌱 ${greenestMeals} klimatbetyg A`,
                splitKey: `green-${weekId}`,
                context: weekId,
              })
            }
            // Weekly climate-target bonus
            if (totalPortions >= 3 && co2PerPortion > 0) {
              if (co2PerPortion < CO2_GREEN) {
                game.award({
                  playerIds: allPlayerIds,
                  points: 50 * allPlayerIds.length,
                  reason: 'eco_meal',
                  label: `🌳 Klimatsmart vecka (<0.5 kg CO₂e/portion)`,
                  splitKey: `climate-A-${weekId}`,
                  context: weekId,
                })
              } else if (co2PerPortion < CO2_OK) {
                game.award({
                  playerIds: allPlayerIds,
                  points: 20 * allPlayerIds.length,
                  reason: 'eco_meal',
                  label: `🌿 Lågt klimatavtryck`,
                  splitKey: `climate-B-${weekId}`,
                  context: weekId,
                })
              }
            }

            // Estimated-cost bonus (lexicon based) — only if user didn't fill actualCost
            if (plan.actualCost == null && totalPortions >= 3 && totalImpact.costSEK > 0) {
              const costPerPortion = totalImpact.costSEK / totalPortions
              const budget = settings.costPerPortion
              if (costPerPortion <= budget * 0.8) {
                const k = `est-cheap-strong-${weekId}`
                if (!game.hasKey(k)) {
                  game.markKey(k)
                  game.award({
                    playerIds: allPlayerIds,
                    points: 30 * allPlayerIds.length,
                    reason: 'cheap_week',
                    label: `💰 Budgetstjärna (uppskattat)`,
                    splitKey: k,
                    context: weekId,
                  })
                }
              } else if (costPerPortion <= budget) {
                const k = `est-cheap-${weekId}`
                if (!game.hasKey(k)) {
                  game.markKey(k)
                  game.award({
                    playerIds: allPlayerIds,
                    points: 15 * allPlayerIds.length,
                    reason: 'shopping_cost_under_budget',
                    label: `💰 Inom budget (uppskattat)`,
                    splitKey: k,
                    context: weekId,
                  })
                }
              }
            }
          }
        }

        // Cheap-week bonus
        if (plan.actualCost != null && plan.actualCost > 0) {
          const totalPortions = plan.schedule.reduce((s, sl) => s + (sl.portionsNeeded || 0), 0)
          if (totalPortions > 0) {
            const costPerPortion = plan.actualCost / totalPortions
            const budget = settings.costPerPortion
            if (costPerPortion <= budget * 0.8) {
              const key = `cheap-strong-${weekId}`
              if (!game.hasKey(key)) {
                game.markKey(key)
                game.award({
                  playerIds: allPlayerIds,
                  points: 40 * allPlayerIds.length,
                  reason: 'cheap_week',
                  label: `💰 Långt under budget!`,
                  splitKey: key,
                  context: weekId,
                })
              }
            } else if (costPerPortion <= budget) {
              const key = `cheap-${weekId}`
              if (!game.hasKey(key)) {
                game.markKey(key)
                game.award({
                  playerIds: allPlayerIds,
                  points: 20 * allPlayerIds.length,
                  reason: 'shopping_cost_under_budget',
                  label: `💰 Under budget`,
                  splitKey: key,
                  context: weekId,
                })
              }
            }
          }
        }
      }

      // Snapshot
      const next = new Map<string, WeekPlan>()
      for (const id in weeks) next.set(id, weeks[id])
      lastWeekRef.current = next
    }

    // initial scan to seed snapshot without awarding (for dishes)
    checkLibrary()
    checkWeek()

    const unsubLib = useLibraryStore.subscribe(() => checkLibrary())
    const unsubWeek = useWeekStore.subscribe(() => checkWeek())

    return () => {
      unsubLib()
      unsubWeek()
    }
  }, [])
}
