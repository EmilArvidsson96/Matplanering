import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import type { GameData, Player, ScoreEvent, PlayerStats, ScoreReason } from '../types/game'
import { ACHIEVEMENTS } from '../utils/achievements'

interface PendingToast {
  id: string
  playerId: string
  playerName: string
  playerColor: string
  playerAvatar: string
  points: number
  label: string
  emoji?: string
  kind: 'score' | 'achievement' | 'levelup'
}

interface GameStore {
  data: GameData
  sha: string | undefined
  isDirty: boolean
  toasts: PendingToast[]

  load: (data: GameData, sha: string | undefined) => void
  markClean: (sha: string | undefined) => void

  setGameMode: (on: boolean) => void
  addPlayer: (name: string, avatar: string, color: string) => string
  removePlayer: (id: string) => void
  updatePlayer: (id: string, patch: Partial<Player>) => void
  setActivePlayer: (id: string | null) => void

  // Awarding
  award: (args: {
    playerIds: string[]
    points: number
    reason: ScoreReason
    label: string
    splitKey?: string
    context?: string
    silent?: boolean
  }) => void

  hasKey: (key: string) => boolean
  markKey: (key: string) => void

  dismissToast: (id: string) => void
  clearToasts: () => void
  emitToast: (t: Omit<PendingToast, 'id'>) => void

  // Achievement scan
  scanAchievements: () => void
}

const DEFAULT_DATA: GameData = {
  players: [],
  activePlayerId: null,
  gameMode: false,
  events: [],
  unlockedAchievements: {},
  processedKeys: [],
}

const XP_BASE = 100
const XP_GROWTH = 1.35

export function statsFor(playerId: string, data: GameData): PlayerStats {
  const evts = data.events.filter(e => e.playerId === playerId)
  const totalPoints = evts.reduce((s, e) => s + e.points, 0)
  let level = 1
  let remaining = totalPoints
  let xpToNext = XP_BASE
  while (remaining >= xpToNext) {
    remaining -= xpToNext
    level += 1
    xpToNext = Math.round(XP_BASE * Math.pow(XP_GROWTH, level - 1))
  }
  return {
    totalPoints,
    level,
    xpInLevel: remaining,
    xpToNext,
    eventCount: evts.length,
    achievementIds: data.unlockedAchievements[playerId] ?? [],
    weeksCompleted: evts.filter(e => e.reason === 'plan_fully_completed').length,
    dishesPolished: evts.filter(e => e.reason === 'dish_fully_complete').length,
    healthyMealCount: evts.filter(e => e.reason === 'healthy_meal').length,
    ecoMealCount: evts.filter(e => e.reason === 'eco_meal').length,
    cheapWeekCount: evts.filter(e => e.reason === 'cheap_week').length,
    streak: computeStreak(evts),
  }
}

function computeStreak(events: ScoreEvent[]): number {
  const weekIds = new Set(
    events
      .filter(e => e.reason === 'plan_fully_completed' && e.context)
      .map(e => e.context as string),
  )
  if (weekIds.size === 0) return 0
  const sorted = [...weekIds].sort().reverse()
  let streak = 1
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1])
    const cur = new Date(sorted[i])
    const diffDays = Math.round((prev.getTime() - cur.getTime()) / 86_400_000)
    if (diffDays === 7) streak += 1
    else break
  }
  return streak
}

export const useGameStore = create<GameStore>((set, get) => ({
  data: DEFAULT_DATA,
  sha: undefined,
  isDirty: false,
  toasts: [],

  load: (data, sha) =>
    set({ data: { ...DEFAULT_DATA, ...data }, sha, isDirty: false }),

  markClean: (sha) => set({ isDirty: false, sha }),

  setGameMode: (on) =>
    set(s => ({ data: { ...s.data, gameMode: on }, isDirty: true })),

  addPlayer: (name, avatar, color) => {
    const id = uuid()
    set(s => ({
      data: {
        ...s.data,
        players: [...s.data.players, { id, name, avatar, color, createdAt: new Date().toISOString() }],
        activePlayerId: s.data.activePlayerId ?? id,
      },
      isDirty: true,
    }))
    return id
  },

  removePlayer: (id) =>
    set(s => ({
      data: {
        ...s.data,
        players: s.data.players.filter(p => p.id !== id),
        activePlayerId: s.data.activePlayerId === id ? null : s.data.activePlayerId,
      },
      isDirty: true,
    })),

  updatePlayer: (id, patch) =>
    set(s => ({
      data: {
        ...s.data,
        players: s.data.players.map(p => (p.id === id ? { ...p, ...patch } : p)),
      },
      isDirty: true,
    })),

  setActivePlayer: (id) =>
    set(s => ({ data: { ...s.data, activePlayerId: id }, isDirty: true })),

  award: ({ playerIds, points, reason, label, splitKey, context, silent }) => {
    if (playerIds.length === 0 || points === 0) return
    const per = Math.max(1, Math.round(points / playerIds.length))
    const ts = new Date().toISOString()
    const newEvents: ScoreEvent[] = playerIds.map(pid => ({
      id: uuid(),
      playerId: pid,
      ts,
      reason,
      points: per,
      label,
      splitKey,
      context,
    }))
    set(s => {
      const prevStats = playerIds.map(pid => statsFor(pid, s.data))
      const nextData = { ...s.data, events: [...s.data.events, ...newEvents] }
      const newStats = playerIds.map(pid => statsFor(pid, nextData))

      // Emit toasts and level-up
      if (!silent) {
        const newToasts: PendingToast[] = []
        playerIds.forEach((pid, i) => {
          const player = s.data.players.find(p => p.id === pid)
          if (!player) return
          newToasts.push({
            id: uuid(),
            playerId: pid,
            playerName: player.name,
            playerColor: player.color,
            playerAvatar: player.avatar,
            points: per,
            label,
            kind: 'score',
          })
          if (newStats[i].level > prevStats[i].level) {
            newToasts.push({
              id: uuid(),
              playerId: pid,
              playerName: player.name,
              playerColor: player.color,
              playerAvatar: player.avatar,
              points: 0,
              label: `Nivå ${newStats[i].level}!`,
              kind: 'levelup',
            })
          }
        })
        return { data: nextData, isDirty: true, toasts: [...s.toasts, ...newToasts] }
      }
      return { data: nextData, isDirty: true }
    })

    // Scan achievements after award
    setTimeout(() => get().scanAchievements(), 50)
  },

  hasKey: (key) => get().data.processedKeys.includes(key),
  markKey: (key) =>
    set(s => ({
      data: { ...s.data, processedKeys: [...s.data.processedKeys, key].slice(-2000) },
      isDirty: true,
    })),

  dismissToast: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
  clearToasts: () => set({ toasts: [] }),
  emitToast: (t) =>
    set(s => ({ toasts: [...s.toasts, { ...t, id: uuid() }] })),

  scanAchievements: () => {
    const { data } = get()
    const updates: PendingToast[] = []
    let changed = false
    const next = { ...data.unlockedAchievements }
    for (const player of data.players) {
      const stats = statsFor(player.id, data)
      const have = new Set(next[player.id] ?? [])
      for (const ach of ACHIEVEMENTS) {
        if (have.has(ach.id)) continue
        if (ach.unlock(stats)) {
          have.add(ach.id)
          changed = true
          updates.push({
            id: uuid(),
            playerId: player.id,
            playerName: player.name,
            playerColor: player.color,
            playerAvatar: player.avatar,
            points: 50,
            label: `${ach.emoji} ${ach.name}`,
            kind: 'achievement',
          })
        }
      }
      next[player.id] = [...have]
    }
    if (changed) {
      set(s => ({
        data: { ...s.data, unlockedAchievements: next },
        isDirty: true,
        toasts: [...s.toasts, ...updates],
      }))
      // award achievement bonus
      for (const t of updates) {
        get().award({
          playerIds: [t.playerId],
          points: 50,
          reason: 'achievement_unlocked',
          label: t.label,
          splitKey: `ach-${t.playerId}-${t.label}`,
          silent: true,
        })
      }
    }
  },
}))

if (typeof window !== 'undefined') {
  ;(window as any).__gameStore = useGameStore
}
