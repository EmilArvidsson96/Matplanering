import { useState } from 'react'
import { AnimatedDiv } from '../common/Animated'
import { Link } from 'react-router-dom'
import { Plus, X } from 'lucide-react'
import { useSettingsStore } from '../../store/settingsStore'
import { useWeekStore, activeWeek } from '../../store/weekStore'
import { stockLevel, levelLabel, looksLikeStock } from '../../utils/stock'
import { stockOut, stockRefill, removeStock, addStock, setBuyMode, declineStock } from '../../store/shoppingActions'
import { useMinWidth } from '../../hooks/useDevice'

const BAR: Record<string, string> = { ok: 'bg-brand-600', low: 'bg-amber-600', out: 'bg-red-700' }
const INK: Record<string, string> = { ok: 'text-ink-soft', low: 'text-amber-800', out: 'text-red-700' }

/** Förråd: things bought in a big pack, only when they run out, plus "Alltid hemma". */
export default function StockPage() {
  const { settings, removePantryItem } = useSettingsStore()
  const week = activeWeek(useWeekStore())
  const wide = useMinWidth(1100)
  const [tab, setTab] = useState<'stock' | 'pantry'>('stock')
  const [newName, setNewName] = useState('')

  const stock = Object.entries(settings.stockItems ?? {}).sort(([, a], [, b]) => a.name.localeCompare(b.name, 'sv'))
  const suggestions = week.shoppingList.filter(i => !i.deletedAt && looksLikeStock(i, settings))
  const pantry = [...settings.pantryItems].sort((a, b) => a.localeCompare(b, 'sv'))

  const stockList = (
    <div className="space-y-3">
      <AnimatedDiv className="card overflow-hidden divide-y divide-line-soft">
        {stock.length === 0 && (
          <p className="px-4 py-6 text-sm text-ink-muted">
            Inga förrådsvaror än. Välj "Förråd" i en varas Mathem-förslag på <Link to="/inkop">Inköp</Link>, eller lägg till här.
          </p>
        )}
        {stock.map(([key, s]) => {
          const { fraction, state } = stockLevel(s)
          const pct = fraction == null ? (state === 'out' ? 0 : 100) : Math.round(fraction * 100)
          return (
            <div key={key} className="flex items-center gap-3 pl-3 pr-2 py-2.5">
              {s.imageUrl
                ? <img src={s.imageUrl} alt="" loading="lazy" className="w-10 h-10 object-contain rounded-xl bg-white shrink-0" />
                : <span className="w-10 h-10 rounded-xl bg-canvas shrink-0" />}
              <div className="flex-1 min-w-0 space-y-1">
                <p className="flex items-baseline gap-2 min-w-0">
                  <span className="text-[15px] font-semibold">{s.name}</span>
                  <span className="text-[12px] text-ink-muted truncate">{[s.productName, s.packSize].filter(Boolean).join(' · ')}</span>
                </p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-line overflow-hidden max-w-[260px]">
                    <div className={`h-full rounded-full ${BAR[state]}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className={`text-[11.5px] font-semibold whitespace-nowrap ${INK[state]}`}>{levelLabel(s)}</span>
                  {fraction == null && state !== 'out' && <span className="text-[11px] text-ink-muted hidden sm:inline">mängden går inte att räkna</span>}
                </div>
              </div>
              {state === 'out'
                ? <button onClick={() => stockRefill(key)} className="h-9 px-3 rounded-full bg-brand-50 text-brand-700 text-[12.5px] font-semibold shrink-0">Köpt, full igen</button>
                : (
                  <>
                    <button onClick={() => stockRefill(key)} className="hidden sm:block h-9 px-3 rounded-full bg-canvas hover:bg-line text-[12.5px] font-medium shrink-0">Full igen</button>
                    <button
                      onClick={() => stockOut(key)}
                      className={`h-9 px-3 rounded-full text-[12.5px] font-semibold shrink-0 ${state === 'low' ? 'bg-ink text-white' : 'bg-canvas hover:bg-line'}`}
                    >Slut</button>
                  </>
                )}
              <button onClick={() => removeStock(key)} aria-label={`Ta bort ${s.name} från förrådet`} title="Inte längre förrådsvara" className="w-9 h-9 rounded-full flex items-center justify-center text-ink-faint hover:text-red-700 shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
          )
        })}
      </AnimatedDiv>
      <form
        onSubmit={e => { e.preventDefault(); addStock(newName); setNewName('') }}
        className="flex items-center gap-2 bg-white rounded-full p-1.5 pl-4 shadow-[0_0_0_1px_rgba(21,23,26,0.06)]"
      >
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="Lägg till förrådsvara, t.ex. soja"
          aria-label="Lägg till förrådsvara"
          className="flex-1 min-w-0 h-10 bg-transparent text-base focus:outline-none"
        />
        <button type="submit" disabled={!newName.trim()} aria-label="Lägg till" className="w-10 h-10 rounded-full bg-brand-600 hover:bg-brand-700 text-white flex items-center justify-center disabled:opacity-40">
          <Plus className="w-5 h-5" />
        </button>
      </form>
    </div>
  )

  const pantryList = (
    <section className="card p-4 space-y-2.5">
      <div>
        <h2 className="text-[15px] font-bold">Alltid hemma</h2>
        <p className="text-[12.5px] text-ink-muted">Kommer aldrig upp på listan och spåras inte.</p>
      </div>
      {pantry.length === 0
        ? <p className="text-sm text-ink-muted">Inget än.</p>
        : (
          <AnimatedDiv className="flex flex-wrap gap-1.5">
            {pantry.map(p => (
              <span key={p} className="inline-flex items-center gap-1 bg-canvas rounded-full pl-3 pr-1 py-1 text-[13px]">
                {p}
                <button onClick={() => removePantryItem(p)} aria-label={`Ta bort ${p}`} className="w-6 h-6 rounded-full bg-white text-ink-muted hover:text-red-700 flex items-center justify-center">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </AnimatedDiv>
        )}
    </section>
  )

  const suggestionCard = suggestions.length > 0 && (
    <section className="bg-mint rounded-3xl p-4 space-y-3">
      <h2 className="text-[15px] font-bold text-mint-ink">Förslag från era val</h2>
      {suggestions.map(i => (
        <div key={i.id} className="space-y-2">
          <p className="text-[13px] text-mint-ink">
            Ni köper {i.mathem!.product!.packSize.replace(/^.*,\s*/, '')} {i.name} när recepten behöver {i.amount} {i.unit}.
          </p>
          <div className="flex gap-2">
            <button onClick={() => setBuyMode(i, 'stock')} className="h-9 px-3.5 rounded-full bg-brand-600 hover:bg-brand-700 text-white text-[13px] font-semibold">Gör till förrådsvara</button>
            <button onClick={() => declineStock(i)} className="h-9 px-3 rounded-full text-mint-ink text-[13px]">Nej tack</button>
          </div>
        </div>
      ))}
    </section>
  )

  const intro = (
    <p className="text-sm text-ink-muted">
      Det ni köper stort och bara när det tar slut. Nivån räknas av från planerade recept, och appen frågar när något börjar ta slut. Tryck Slut så hamnar det på veckans inköpslista.
    </p>
  )

  if (wide) {
    return (
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(300px,360px)] gap-6 items-start">
        <div className="space-y-4 min-w-0">{intro}{stockList}</div>
        <aside className="space-y-4">{suggestionCard}{pantryList}</aside>
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-4">
      {intro}
      <div role="tablist" aria-label="Visa" className="grid grid-cols-2 gap-1 bg-line-soft rounded-full p-1">
        <button role="tab" aria-selected={tab === 'stock'} onClick={() => setTab('stock')} className={`h-10 rounded-full text-sm ${tab === 'stock' ? 'bg-white font-semibold shadow-sm' : 'text-ink-soft'}`}>
          Förråd ({stock.length})
        </button>
        <button role="tab" aria-selected={tab === 'pantry'} onClick={() => setTab('pantry')} className={`h-10 rounded-full text-sm ${tab === 'pantry' ? 'bg-white font-semibold shadow-sm' : 'text-ink-soft'}`}>
          Alltid hemma ({pantry.length})
        </button>
      </div>
      {tab === 'stock' ? <>{stockList}{suggestionCard}</> : pantryList}
    </div>
  )
}
