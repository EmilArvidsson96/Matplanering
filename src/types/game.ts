export interface Player {
  id: string
  name: string
  avatar: string  // emoji
  color: string   // hex
  createdAt: string
}

export type ScoreReason =
  | 'plan_portions_done'
  | 'plan_brainstorm_done'
  | 'plan_schedule_done'
  | 'plan_fully_completed'
  | 'shopping_cost_under_budget'
  | 'shopping_cost_well_under_budget'
  | 'healthy_meal'
  | 'eco_meal'
  | 'cheap_week'
  | 'dish_created'
  | 'dish_ingredients_added'
  | 'dish_instructions_added'
  | 'dish_categories_complete'
  | 'dish_recipe_url'
  | 'dish_notes'
  | 'dish_fully_complete'
  | 'cooking_logged'
  | 'streak_bonus'
  | 'achievement_unlocked'

export interface ScoreEvent {
  id: string
  playerId: string         // recipient — if split, multiple events share splitKey
  ts: string               // ISO
  reason: ScoreReason
  points: number
  label: string            // user-facing
  splitKey?: string        // identifier so we don't double-count split events
  context?: string         // weekId, dishId, etc.
}

export interface Achievement {
  id: string
  name: string
  description: string
  emoji: string
  unlock: (stats: PlayerStats) => boolean
}

export interface PlayerStats {
  totalPoints: number
  level: number
  xpInLevel: number
  xpToNext: number
  eventCount: number
  achievementIds: string[]
  weeksCompleted: number
  dishesPolished: number
  healthyMealCount: number
  ecoMealCount: number
  cheapWeekCount: number
  streak: number
}

export interface GameData {
  players: Player[]
  activePlayerId: string | null
  gameMode: boolean
  events: ScoreEvent[]
  unlockedAchievements: Record<string, string[]>  // playerId -> achievementIds
  processedKeys: string[]   // deduplication for trigger keys
}
