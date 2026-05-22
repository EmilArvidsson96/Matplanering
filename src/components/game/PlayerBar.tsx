import { useGameStore, statsFor } from '../../store/gameStore'
import { Link } from 'react-router-dom'

export default function PlayerBar() {
  const data = useGameStore(s => s.data)
  if (!data.gameMode || data.players.length === 0) return null

  const sorted = [...data.players].sort((a, b) => {
    return statsFor(b.id, data).totalPoints - statsFor(a.id, data).totalPoints
  })

  return (
    <Link to="/spel" className="block group">
      <div className="flex items-center gap-3 px-3 py-2 rounded-2xl bg-white/70 backdrop-blur border border-white/40 shadow-sm hover:shadow-md transition">
        {sorted.map((p) => {
          const stats = statsFor(p.id, data)
          const pct = Math.min(100, (stats.xpInLevel / stats.xpToNext) * 100)
          const isActive = p.id === data.activePlayerId
          return (
            <div key={p.id} className={`flex items-center gap-2 ${isActive ? '' : 'opacity-70'}`}>
              <div
                className="relative w-9 h-9 rounded-full flex items-center justify-center text-lg ring-2"
                style={{ background: p.color + '22', boxShadow: `0 0 0 2px ${p.color}` }}
              >
                <span>{p.avatar}</span>
                <span className="absolute -bottom-1 -right-1 text-[10px] bg-white rounded-full px-1 font-bold shadow" style={{ color: p.color }}>
                  {stats.level}
                </span>
              </div>
              <div className="flex flex-col min-w-[80px]">
                <span className="text-xs font-semibold text-gray-700 leading-tight">{p.name}</span>
                <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden mt-0.5">
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: p.color }} />
                </div>
                <span className="text-[10px] text-gray-500 mt-0.5">{stats.totalPoints} p</span>
              </div>
            </div>
          )
        })}
      </div>
    </Link>
  )
}
