import { useEffect, useState } from 'react'
import { useGameStore } from '../../store/gameStore'

interface Confetti {
  id: number
  left: number
  delay: number
  color: string
  rotate: number
  size: number
}

export default function GameOverlay() {
  const toasts = useGameStore(s => s.toasts)
  const gameMode = useGameStore(s => s.data.gameMode)
  const dismiss = useGameStore(s => s.dismissToast)
  const [confetti, setConfetti] = useState<Confetti[]>([])

  // Auto-dismiss toasts
  useEffect(() => {
    const timers = toasts.map(t => setTimeout(() => dismiss(t.id), t.kind === 'levelup' ? 3200 : 2400))
    return () => { timers.forEach(clearTimeout) }
  }, [toasts, dismiss])

  // Trigger confetti on level-up or achievement
  useEffect(() => {
    const burst = toasts.find(t => t.kind === 'levelup' || t.kind === 'achievement')
    if (!burst) return
    const id = Date.now()
    const pieces: Confetti[] = Array.from({ length: 60 }, (_, i) => ({
      id: id + i,
      left: Math.random() * 100,
      delay: Math.random() * 0.4,
      color: ['#ff3b8c', '#ffd23f', '#3ecf8e', '#4f9cff', '#a855f7', '#ff7849'][i % 6],
      rotate: Math.random() * 720 - 360,
      size: 6 + Math.random() * 8,
    }))
    setConfetti(c => [...c, ...pieces])
    const t = setTimeout(() => {
      setConfetti(c => c.filter(p => !pieces.some(np => np.id === p.id)))
    }, 2400)
    return () => clearTimeout(t)
  }, [toasts])

  if (!gameMode) return null

  return (
    <div className="pointer-events-none fixed inset-0 z-[100] overflow-hidden">
      {/* Confetti */}
      {confetti.map(p => (
        <span
          key={p.id}
          className="absolute top-0 game-confetti"
          style={{
            left: `${p.left}%`,
            background: p.color,
            width: p.size,
            height: p.size * 1.4,
            animationDelay: `${p.delay}s`,
            ['--rot' as any]: `${p.rotate}deg`,
          }}
        />
      ))}

      {/* Toast stack */}
      <div className="absolute top-4 right-4 flex flex-col gap-2 items-end">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto game-toast flex items-center gap-3 px-4 py-2.5 rounded-2xl shadow-xl backdrop-blur-md
              ${t.kind === 'levelup' ? 'game-toast-levelup' : t.kind === 'achievement' ? 'game-toast-ach' : 'game-toast-score'}`}
            style={{
              borderLeft: `5px solid ${t.playerColor}`,
            }}
          >
            <span className="text-2xl drop-shadow">{t.playerAvatar}</span>
            <div className="flex flex-col">
              <span className="text-xs font-semibold opacity-80">{t.playerName}</span>
              <span className="text-sm font-bold leading-tight">
                {t.kind === 'levelup' ? `🚀 ${t.label}` :
                  t.kind === 'achievement' ? `🏆 ${t.label}` :
                  <>
                    <span className="text-yellow-300">+{t.points}</span> {t.label}
                  </>}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
