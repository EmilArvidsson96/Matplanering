import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { HomeGuess } from '../../utils/stock'
import { markAtHome, answerBuy, answerAll } from '../../store/shoppingActions'

const COLLAPSED_KEY = 'matplan.atHome.collapsed'

function readCollapsed(): boolean {
  try { return localStorage.getItem(COLLAPSED_KEY) === '1' } catch { return false }
}

/** "Har du redan hemma?": the rows most likely at home, with Köp / Har hemma. */
export default function AtHomeSection({ guesses, wide }: { guesses: HomeGuess[]; wide?: boolean }) {
  const [collapsed, setCollapsed] = useState(readCollapsed)
  if (guesses.length === 0) return null

  function toggle() {
    setCollapsed(c => {
      try { localStorage.setItem(COLLAPSED_KEY, c ? '0' : '1') } catch { /* only a convenience */ }
      return !c
    })
  }
  const items = guesses.map(g => g.item)

  return (
    <section aria-labelledby="hemma-rubrik" className="card overflow-hidden">
      <div className="flex items-center gap-2 pl-4 pr-1.5 py-1.5 flex-wrap">
        <h2 id="hemma-rubrik" className="flex-1 min-w-0 text-[15px] font-bold">
          Har du redan hemma? <span className="text-[13px] font-medium text-ink-muted">{guesses.length} {guesses.length === 1 ? 'trolig' : 'troliga'}</span>
        </h2>
        {wide && !collapsed && (
          <>
            <button onClick={() => answerAll(items, 'buy')} className="h-9 px-3.5 rounded-full bg-canvas hover:bg-line text-[13px] font-medium">Köp alla</button>
            <button onClick={() => answerAll(items, 'home')} className="h-9 px-3.5 rounded-full bg-brand-600 hover:bg-brand-700 text-white text-[13px] font-semibold">{guesses.length === 1 ? 'Har hemma' : `Alla ${guesses.length} hemma`}</button>
          </>
        )}
        <button
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-controls="hemma-lista"
          aria-label={collapsed ? 'Visa' : 'Minimera'}
          title={collapsed ? 'Visa' : 'Minimera'}
          className="w-11 h-11 rounded-full flex items-center justify-center text-ink-muted hover:bg-canvas"
        >
          <ChevronDown className={`w-5 h-5 transition-transform ${collapsed ? '' : 'rotate-180'}`} />
        </button>
      </div>

      {!collapsed && (
        <div id="hemma-lista">
          <p className="px-4 pb-2 -mt-1 text-[12.5px] text-ink-muted">
            Mest troliga först. Har hemma tar bort varan, Köp lägger den kvar i listan.
          </p>
          <div className={wide ? 'grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-2 px-3 pb-3' : 'divide-y divide-line-soft border-t border-line-soft'}>
            {guesses.map(g => (
              <div key={g.item.id} className={`flex items-center gap-1.5 ${wide ? 'bg-canvas rounded-2xl pl-3.5 pr-2 py-2' : 'pl-4 pr-2 py-2'}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-medium truncate">
                    {g.item.name}{' '}
                    {(g.item.amount || g.item.unit) && <span className="text-[12.5px] font-normal text-ink-muted">{g.item.amount} {g.item.unit}</span>}
                  </p>
                  <p className={`text-[11.5px] truncate ${g.score >= 0.8 ? 'text-brand-700' : 'text-ink-muted'}`}>{g.reason}</p>
                </div>
                <button
                  onClick={() => answerBuy(g.item)}
                  className={`h-9 px-3 rounded-full text-[13px] font-medium shrink-0 ${wide ? 'bg-white' : 'bg-canvas'} hover:bg-line`}
                >Köp</button>
                <button
                  onClick={() => markAtHome(g.item, { fromQuestion: true })}
                  className={`h-9 px-3 rounded-full text-[13px] font-semibold text-brand-700 shrink-0 ${wide ? 'bg-white' : 'bg-brand-50'} hover:bg-brand-100`}
                >Har hemma</button>
              </div>
            ))}
          </div>
          {!wide && (
            <div className="flex gap-2 px-4 py-3 border-t border-line-soft">
              <button onClick={() => answerAll(items, 'home')} className="h-10 px-4 rounded-full bg-brand-600 hover:bg-brand-700 text-white text-[13px] font-semibold">{guesses.length === 1 ? 'Har hemma' : `Alla ${guesses.length} hemma`}</button>
              <button onClick={() => answerAll(items, 'buy')} className="h-10 px-4 rounded-full bg-canvas hover:bg-line text-[13px] font-medium">Köp alla</button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
