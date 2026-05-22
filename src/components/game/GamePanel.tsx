import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useGameStore, statsFor } from '../../store/gameStore'
import { useLibraryStore } from '../../store/libraryStore'
import { ACHIEVEMENTS } from '../../utils/achievements'
import { Gamepad2, Power, Plus, Trash2, Star, Flame, Trophy, BookOpen, ChevronDown, ChevronRight, Sparkles, Target } from 'lucide-react'
import { INGREDIENT_LEXICON } from '../../data/ingredientLexicon'
import { climateGrade, CLIMATE_COLORS } from '../../utils/ingredientImpact'
import { computeCompleteness } from '../../utils/recipeCompleteness'

const AVATARS = ['🦊','🐻','🐼','🐨','🦁','🐯','🐸','🐵','🐧','🦄','🐲','🐝','🍕','🌮','🥑','🍳','🥕','🍓','🌶️','🍣']
const COLORS = ['#ff3b8c','#ffd23f','#3ecf8e','#4f9cff','#a855f7','#ff7849','#06b6d4','#f43f5e','#84cc16','#eab308']

export default function GamePanel() {
  const data = useGameStore(s => s.data)
  const setGameMode = useGameStore(s => s.setGameMode)
  const addPlayer = useGameStore(s => s.addPlayer)
  const removePlayer = useGameStore(s => s.removePlayer)
  const setActivePlayer = useGameStore(s => s.setActivePlayer)
  const events = data.events

  const [newName, setNewName] = useState('')
  const [newAvatar, setNewAvatar] = useState(AVATARS[0])
  const [newColor, setNewColor] = useState(COLORS[0])
  const [handbookOpen, setHandbookOpen] = useState(true)
  const [lexiconOpen, setLexiconOpen] = useState(false)

  const sorted = [...data.players].sort((a, b) => statsFor(b.id, data).totalPoints - statsFor(a.id, data).totalPoints)
  const recent = [...events].sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 12)

  return (
    <div className={`max-w-4xl mx-auto px-4 py-6 ${data.gameMode ? 'game-mode-content' : ''}`}>
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl p-6 mb-6 shadow-lg game-hero">
        <div className="relative z-10 flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-white drop-shadow flex items-center gap-2">
              <Gamepad2 className="w-8 h-8" /> Matplaneringen — spelläget
            </h1>
            <p className="text-white/90 mt-1 text-sm max-w-md">
              Samla poäng genom att planera veckor, fylla i recept, äta klimatsmart, hålla budget och bygga ditt receptbibliotek.
            </p>
          </div>
          <button
            onClick={() => setGameMode(!data.gameMode)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-full font-bold shadow-lg transition
              ${data.gameMode ? 'bg-white text-pink-600 hover:scale-105' : 'bg-black/30 text-white hover:bg-black/50'}`}
          >
            <Power className="w-4 h-4" />
            {data.gameMode ? 'Spelläge PÅ' : 'Aktivera spelläge'}
          </button>
        </div>
      </div>

      {/* Players */}
      <section className="mb-8">
        <h2 className="text-lg font-bold mb-3 flex items-center gap-2"><Trophy className="w-5 h-5 text-yellow-500"/> Topplista</h2>

        {sorted.length === 0 && (
          <p className="text-sm text-gray-500 italic mb-3">Lägg till spelare för att börja samla poäng.</p>
        )}

        <div className="grid sm:grid-cols-2 gap-3">
          {sorted.map((p, idx) => {
            const stats = statsFor(p.id, data)
            const pct = Math.min(100, (stats.xpInLevel / stats.xpToNext) * 100)
            const medals = ['🥇','🥈','🥉']
            return (
              <div
                key={p.id}
                className={`relative p-4 rounded-2xl shadow transition cursor-pointer overflow-hidden
                  ${p.id === data.activePlayerId ? 'ring-2 ring-offset-2' : ''}`}
                style={{
                  background: `linear-gradient(135deg, ${p.color}22, ${p.color}11)`,
                  borderColor: p.color,
                  ['--tw-ring-color' as any]: p.color,
                }}
                onClick={() => setActivePlayer(p.id)}
              >
                <div className="absolute top-2 right-2 text-lg">{medals[idx] ?? ''}</div>
                <div className="flex items-center gap-3">
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl shadow"
                    style={{ background: p.color }}
                  >
                    {p.avatar}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-gray-900">{p.name}</h3>
                      {p.id === data.activePlayerId && (
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-white/80" style={{ color: p.color }}>aktiv</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-600 flex items-center gap-3 mt-0.5">
                      <span className="flex items-center gap-1"><Star className="w-3 h-3"/>Nivå {stats.level}</span>
                      <span>{stats.totalPoints} p</span>
                      {stats.streak > 0 && <span className="flex items-center gap-1"><Flame className="w-3 h-3 text-orange-500"/>{stats.streak}</span>}
                    </div>
                    <div className="h-2 w-full bg-white/60 rounded-full overflow-hidden mt-1.5">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: p.color }} />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-1 mt-3 text-center text-[11px] text-gray-700">
                  <div className="bg-white/60 rounded p-1">📅 {stats.weeksCompleted}</div>
                  <div className="bg-white/60 rounded p-1">📖 {stats.dishesPolished}</div>
                  <div className="bg-white/60 rounded p-1">🌍 {stats.ecoMealCount}</div>
                  <div className="bg-white/60 rounded p-1">🥗 {stats.healthyMealCount}</div>
                </div>

                <button
                  className="absolute bottom-2 right-2 text-gray-400 hover:text-red-500 p-1"
                  onClick={(e) => { e.stopPropagation(); if (confirm(`Ta bort ${p.name}?`)) removePlayer(p.id) }}
                >
                  <Trash2 className="w-3.5 h-3.5"/>
                </button>
              </div>
            )
          })}
        </div>

        {/* Add player */}
        <div className="mt-4 p-4 rounded-2xl border border-dashed border-gray-300 bg-white/60">
          <h3 className="font-semibold text-sm mb-2 flex items-center gap-2"><Plus className="w-4 h-4"/> Lägg till spelare</h3>
          <div className="flex flex-wrap gap-3 items-center">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Namn"
              className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm"
            />
            <div className="flex gap-1 flex-wrap">
              {AVATARS.slice(0, 10).map(a => (
                <button key={a} onClick={() => setNewAvatar(a)} className={`text-xl w-8 h-8 rounded-lg ${newAvatar === a ? 'bg-brand-100 ring-2 ring-brand-500' : 'bg-gray-100'}`}>{a}</button>
              ))}
            </div>
            <div className="flex gap-1">
              {COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setNewColor(c)}
                  className={`w-6 h-6 rounded-full ${newColor === c ? 'ring-2 ring-offset-1 ring-gray-700' : ''}`}
                  style={{ background: c }}
                />
              ))}
            </div>
            <button
              disabled={!newName.trim()}
              onClick={() => { addPlayer(newName.trim(), newAvatar, newColor); setNewName('') }}
              className="px-4 py-1.5 rounded-lg bg-brand-600 text-white font-semibold text-sm disabled:opacity-40"
            >
              Lägg till
            </button>
          </div>
        </div>
      </section>

      {/* Recipe Quests */}
      <RecipeQuests />

      {/* Handbook */}
      <section className="mb-8">
        <button
          onClick={() => setHandbookOpen(o => !o)}
          className="w-full flex items-center justify-between bg-white/70 rounded-2xl px-4 py-3 shadow-sm hover:shadow"
        >
          <h2 className="text-lg font-bold flex items-center gap-2"><BookOpen className="w-5 h-5"/> Handbok — så funkar spelet</h2>
          {handbookOpen ? <ChevronDown className="w-5 h-5"/> : <ChevronRight className="w-5 h-5"/>}
        </button>

        {handbookOpen && (
          <div className="mt-3 bg-white/70 rounded-2xl p-4 sm:p-5 shadow-sm space-y-5 text-sm leading-relaxed">
            <div>
              <h3 className="font-bold text-base mb-1">🎮 Grunden</h3>
              <p>
                Spelet kör i bakgrunden så fort du aktiverar <em>spelläge</em>. Vanlig användning av appen
                — fylla i recept, planera veckor, hålla budget, äta klimatsmart — ger poäng till spelarna.
                Klart en uppgift som hela hushållet gör tillsammans (t.ex. veckoplanen)? Då delas poängen
                lika mellan alla spelare. Individuella saker (t.ex. förbättra ett recept) går till den
                <strong> aktiva spelaren</strong> (klicka på en spelare för att göra den aktiv).
              </p>
            </div>

            <div>
              <h3 className="font-bold text-base mb-1">📈 Nivåer & XP</h3>
              <p>
                Varje poäng är 1 XP. Nivå 1 kräver 100 XP, sen växer kravet med 1.35× per nivå.
                Vid uppgradering smäller konfetti till.
              </p>
            </div>

            <div>
              <h3 className="font-bold text-base mb-1">🪙 Poängkällor</h3>
              <ul className="list-none space-y-1 ml-0">
                <li>📅 <b>Planeringssteg klart</b> (portioner / brainstorm / schema): +5 / +10 / +15 — <em>delas</em></li>
                <li>🎉 <b>Veckoplan klar</b> (alla 3 steg): +30 var</li>
                <li>🥗 <b>Nyttig måltid</b> i veckan (taggar: lågfett, lchf, lowfodmap, vego): +4 var per måltid</li>
                <li>🌍 <b>Klimatsmart val</b> (fisk/vegetariskt/veganskt): +5 var per måltid</li>
                <li>🌱 <b>Klimatbetyg A</b> per måltid (&lt;0.5 kg CO₂e/portion enligt lexikonet): +8 var</li>
                <li>🌳 <b>Klimatsmart vecka</b> (snitt &lt;0.5 kg CO₂e/portion): +50 var</li>
                <li>🌿 <b>Lågt klimatavtryck</b> (snitt &lt;1.5 kg CO₂e/portion): +20 var</li>
                <li>💰 <b>Inom budget</b> (vecka ≤ <code>kostnad/portion</code>): +15–30 var</li>
                <li>📖 <b>Recept – per fält</b>: 🥩 protein +4, 🍚 kolhydrat +3, 🌍 köksstil +3, 🍽️ typ +3, 🏷️ taggar +3, 🔗 källänk +3, 📝 noter +2, 🌱 säsong +4</li>
                <li>🥕 <b>Ingredienser tillagda</b>: +8 (engångsbonus — det vanliga är att hämta hela ingredienslistan från recept-URL)</li>
                <li>📋 <b>Instruktioner tillagda</b>: +8 (engångsbonus, samma princip)</li>
                <li>🎯 <b>Komplett recept</b> (alla fält ifyllda): <b>+25 (x2 för dina första 5!)</b></li>
                <li>🌍 <b>Köks-mästare</b> (3 kompletta recept i samma köksstil): +30</li>
                <li>🗺️ <b>Köksstils-variation</b>: kompletta recept i 3 / 5 / 8 olika köksstilar = +75 / +125 / +200</li>
                <li>🥗 <b>Protein-variation</b>: 3 / 5 / 8 olika proteiner med kompletta recept = +60 / +100 / +160</li>
                <li>⚡ <b>Snabb spurt</b>: polera 3 recept inom 24 h = +50</li>
                <li>🏆 <b>Bedrift låst upp</b>: +50 (se kortgalleriet nedan)</li>
              </ul>
            </div>

            <div>
              <h3 className="font-bold text-base mb-1">🥕 Klimat- & kostnadslexikonet</h3>
              <p className="mb-2">
                Appen har ett inbyggt lexikon för ca {INGREDIENT_LEXICON.length} svenska ingredienser med
                cirka-värden för pris (SEK/kg) och klimatpåverkan (kg CO₂e/kg, från-jord-till-butik).
                När du fyller i ingredienser med <em>kvantitet och enhet</em> beräknas:
              </p>
              <ul className="list-disc list-inside space-y-0.5 ml-2">
                <li>Uppskattad <b>kostnad per portion</b> för rätten</li>
                <li>Uppskattat <b>klimatavtryck per portion</b> i kg CO₂e</li>
                <li>Ett <b>klimatbetyg A–E</b> (likt EcoScore)</li>
                <li>Veckans totala uppskattade kostnad och CO₂e</li>
              </ul>
              <p className="mt-2">
                Värdena är ungefärliga (baserade på publika data som RISE klimatdatabas och Konsumentverket)
                och påverkar både dina rättkort och veckans automatiska bonusar. Källänken på receptet
                länkar till originalet — där hittar du de exakta värdena.
              </p>
              <div className="mt-2 flex flex-wrap gap-2 items-center text-xs">
                <span className="font-semibold">Klimatbetyg per portion:</span>
                {(['A','B','C','D','E'] as const).map(g => {
                  const ranges = { A:'< 0.5 kg', B:'< 1 kg', C:'< 2 kg', D:'< 4 kg', E:'≥ 4 kg' } as const
                  return (
                    <span key={g} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-white font-bold" style={{ background: CLIMATE_COLORS[g] }}>
                      {g} <span className="font-normal opacity-90">{ranges[g]}</span>
                    </span>
                  )
                })}
              </div>
            </div>

            <div>
              <button onClick={() => setLexiconOpen(o => !o)} className="text-sm font-bold flex items-center gap-1 text-purple-700 hover:text-purple-900">
                {lexiconOpen ? <ChevronDown className="w-4 h-4"/> : <ChevronRight className="w-4 h-4"/>}
                Visa hela lexikonet ({INGREDIENT_LEXICON.length} poster)
              </button>
              {lexiconOpen && (
                <div className="mt-2 max-h-72 overflow-y-auto border border-gray-200 rounded-xl">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-100 sticky top-0">
                      <tr>
                        <th className="px-2 py-1 text-left">Ingrediens</th>
                        <th className="px-2 py-1 text-right">kr/kg</th>
                        <th className="px-2 py-1 text-right">CO₂e/kg</th>
                        <th className="px-2 py-1 text-center">Betyg</th>
                      </tr>
                    </thead>
                    <tbody>
                      {INGREDIENT_LEXICON.map((e, i) => {
                        const g = climateGrade(e.co2ePerKg / 4)  // approx per ~250 g portion
                        return (
                          <tr key={i} className="border-t border-gray-100 odd:bg-white even:bg-gray-50/50">
                            <td className="px-2 py-1">{e.name}</td>
                            <td className="px-2 py-1 text-right tabular-nums">{e.costPerKg}</td>
                            <td className="px-2 py-1 text-right tabular-nums">{e.co2ePerKg}</td>
                            <td className="px-2 py-1 text-center">
                              <span className="inline-block w-5 h-5 rounded text-white text-[10px] font-bold leading-5" style={{ background: CLIMATE_COLORS[g] }}>{g}</span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div>
              <h3 className="font-bold text-base mb-1">💡 Tips för att maxa poängen</h3>
              <ul className="list-disc list-inside space-y-0.5 ml-2">
                <li>Fyll i <b>ingredienser med kvantitet och enhet</b> — då räknas klimat och kostnad automatiskt</li>
                <li>Variera proteiner: byt ut rött kött mot kyckling, fisk eller baljväxter ibland</li>
                <li>Kör <b>vegetariska dagar</b> — varje sådan måltid ger eco-bonus och stora CO₂-besparingar</li>
                <li>Bygg <b>streak</b> genom att slutföra veckoplaner flera veckor i rad — låser upp 🔥-bedrifter</li>
                <li>Fyll ut <b>hela receptbiblioteket</b>: kategorier + taggar + källänk = mer poäng</li>
              </ul>
            </div>
          </div>
        )}
      </section>

      {/* Achievements */}
      <section className="mb-8">
        <h2 className="text-lg font-bold mb-3">🏅 Bedrifter</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {ACHIEVEMENTS.map(ach => {
            const unlockedBy = data.players.filter(p => (data.unlockedAchievements[p.id] ?? []).includes(ach.id))
            const unlocked = unlockedBy.length > 0
            return (
              <div
                key={ach.id}
                className={`p-3 rounded-xl border text-center ${unlocked ? 'border-yellow-400 bg-gradient-to-br from-yellow-100 to-orange-100 shadow' : 'border-gray-200 bg-gray-50 opacity-60'}`}
              >
                <div className="text-3xl mb-1">{unlocked ? ach.emoji : '🔒'}</div>
                <div className="text-xs font-bold text-gray-800">{ach.name}</div>
                <div className="text-[10px] text-gray-600">{ach.description}</div>
                {unlocked && (
                  <div className="flex justify-center gap-1 mt-1">
                    {unlockedBy.map(p => (
                      <span key={p.id} className="text-xs" title={p.name}>{p.avatar}</span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* Recent activity */}
      <section>
        <h2 className="text-lg font-bold mb-3">📜 Senaste händelser</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-gray-500 italic">Inga händelser ännu — börja planera!</p>
        ) : (
          <ul className="space-y-1.5">
            {recent.map(e => {
              const p = data.players.find(pp => pp.id === e.playerId)
              return (
                <li key={e.id} className="flex items-center gap-2 text-sm bg-white/70 rounded-lg px-3 py-1.5">
                  <span className="text-lg">{p?.avatar ?? '?'}</span>
                  <span className="font-medium" style={{ color: p?.color }}>{p?.name ?? '?'}</span>
                  <span className="text-gray-700 flex-1">{e.label}</span>
                  <span className="font-bold text-brand-700">+{e.points}</span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

// ─── Recipe Quests panel ─────────────────────────────────────────────────────
function RecipeQuests() {
  const dishes = useLibraryStore(s => s.dishes)
  const [showAll, setShowAll] = useState(false)

  const enriched = dishes
    .map(d => ({ dish: d, c: computeCompleteness(d) }))
    .filter(x => x.c.pct < 100)
    .sort((a, b) => {
      // Closest to finish first; then highest worth
      if (b.c.pct !== a.c.pct) return b.c.pct - a.c.pct
      return b.c.totalWorth - a.c.totalWorth
    })

  const complete = dishes.length - enriched.length
  const totalPct = dishes.length === 0 ? 0 : Math.round(
    dishes.reduce((s, d) => s + computeCompleteness(d).pct, 0) / dishes.length,
  )

  const list = showAll ? enriched : enriched.slice(0, 6)

  return (
    <section className="mb-8">
      <div className="bg-white/80 rounded-2xl p-4 sm:p-5 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Target className="w-5 h-5 text-pink-500"/> Receptmål
            <span className="text-sm font-normal text-gray-600">— polera dina recept</span>
          </h2>
          <div className="flex items-center gap-2 text-sm">
            <span className="font-bold">{complete}/{dishes.length}</span>
            <span className="text-gray-500">kompletta</span>
            <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-pink-500 to-purple-500 transition-all" style={{ width: `${totalPct}%` }} />
            </div>
            <span className="text-xs text-gray-500 tabular-nums">{totalPct}%</span>
          </div>
        </div>

        {enriched.length === 0 ? (
          <p className="text-sm text-gray-500 italic">🎉 Alla recept är kompletta! Lägg till nya i biblioteket för fler mål.</p>
        ) : (
          <>
            <p className="text-sm text-gray-700 mb-3">
              <Sparkles className="inline w-4 h-4 text-yellow-500 mr-1"/>
              <b>Polera</b> ett recept för att fylla i saknade fält. Du får poäng per fält och en
              komboboost (<b>+25 p</b>, dubbel under de första 5 receptkompletteringarna!) när du
              når 100%.
            </p>
            <ul className="space-y-2">
              {list.map(({ dish, c }) => {
                const missing = c.fields.filter(f => !f.done)
                return (
                  <li key={dish.id}>
                    <Link
                      to={`/bibliotek?edit=${dish.id}`}
                      className="block p-3 rounded-xl border border-gray-200 bg-white hover:border-pink-300 hover:shadow transition group"
                    >
                      <div className="flex items-center justify-between gap-3 mb-1.5">
                        <h3 className="font-semibold text-sm text-gray-900 flex items-center gap-2">
                          {dish.name}
                          <span className="flex">{Array.from({length:5}).map((_, i) =>
                            <Star key={i} className="w-3.5 h-3.5" fill={i < c.stars ? '#facc15' : 'transparent'} stroke={i < c.stars ? '#facc15' : '#d4d4d8'} strokeWidth={2}/>
                          )}</span>
                        </h3>
                        <span className="text-xs font-bold text-pink-600 tabular-nums shrink-0">+{c.totalWorth} p möjliga</span>
                      </div>
                      <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden mb-2">
                        <div className="h-full bg-gradient-to-r from-pink-400 to-purple-500" style={{ width: `${c.pct}%` }} />
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {missing.slice(0, 8).map(f => (
                          <span key={f.id} className="text-[10px] bg-pink-50 text-pink-700 px-1.5 py-0.5 rounded-full border border-pink-100">
                            {f.emoji} {f.label}
                          </span>
                        ))}
                        {missing.length > 8 && (
                          <span className="text-[10px] text-gray-500">+{missing.length - 8}</span>
                        )}
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
            {enriched.length > 6 && (
              <button
                onClick={() => setShowAll(o => !o)}
                className="mt-3 text-xs text-purple-700 hover:underline"
              >
                {showAll ? 'Visa färre' : `Visa alla ${enriched.length}`}
              </button>
            )}
          </>
        )}
      </div>
    </section>
  )
}
