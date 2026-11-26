import { useEffect, useState } from 'react'
import { Minus, Plus, Search } from 'lucide-react'
import type { MathemSuggestion, ShoppingItem } from '../../types'
import { searchMathem, type MathemProduct } from '../../api/mathem'
import { useSettingsStore } from '../../store/settingsStore'
import { learnChoice, packsFor, snapshot } from '../../store/mathemStore'

const SOURCE_LABEL: Record<NonNullable<MathemSuggestion['source']>, string> = {
  preference: 'Som förra gången',
  ai: 'AI-val',
  search: 'Första sökträffen',
  manual: 'Ditt val',
}

function kr(n: number) {
  return Number.isFinite(n) ? `${Math.round(n)} kr` : ''
}

/** The Mathem product suggested for one shopping row, shown under its name. */
export default function MathemSuggestionLine({ item, onUpdate }: {
  item: ShoppingItem
  onUpdate: (patch: Partial<ShoppingItem>) => void
}) {
  const s = item.mathem!
  const [open, setOpen] = useState(false)
  const set = (patch: Partial<MathemSuggestion>) => onUpdate({ mathem: { ...s, ...patch } })
  const p = s.product

  return (
    <div className="pl-[52px] pr-3 pb-2.5 -mt-1 space-y-1.5">
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className={`w-full flex items-center gap-2 text-left rounded-xl px-2 py-1.5 transition-colors
          ${s.include ? 'bg-canvas hover:bg-line-soft' : 'hover:bg-canvas'}`}
      >
        {p?.imageUrl
          ? <img src={p.imageUrl} alt="" loading="lazy" className={`w-8 h-8 object-contain rounded-lg bg-white shrink-0 ${s.include ? '' : 'opacity-40'}`} />
          : <span className="w-8 h-8 rounded-lg bg-line-soft shrink-0" />}
        <span className="flex-1 min-w-0">
          <span className={`block text-[13px] truncate ${s.include ? 'text-ink-soft' : 'text-ink-faint line-through'}`}>
            {p ? `${p.name} · ${p.packSize}` : 'Ingen produkt'}
          </span>
          {(s.note || (s.source && s.include)) && (
            <span className="block text-[11px] text-ink-faint truncate">
              {s.include && s.source ? SOURCE_LABEL[s.source] : ''}
              {s.include && s.source && s.note ? ' · ' : ''}
              {s.note}
            </span>
          )}
        </span>
        {s.include && p && (
          <span className="text-[13px] text-ink-muted whitespace-nowrap shrink-0">
            {s.quantity} st · {kr(p.price * s.quantity)}
            {p.onSale && <span className="text-red-700"> %</span>}
          </span>
        )}
      </button>

      {s.include && s.saleAlt && p && <SaleSwap item={item} s={s} set={set} />}

      {open && <Editor item={item} s={s} set={set} onClose={() => setOpen(false)} />}
    </div>
  )
}

function SaleSwap({ item, s, set }: { item: ShoppingItem; s: MathemSuggestion; set: (p: Partial<MathemSuggestion>) => void }) {
  const alt = s.saleAlt!
  const cur = s.product!
  const altQty = packsFor(item, alt.packSize, s.quantity)
  const diff = cur.price * s.quantity - alt.price * altQty
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl px-2.5 py-2 text-xs text-amber-900 space-y-1.5">
      <div>
        <span className="font-semibold">Extrapris:</span> {alt.name} · {alt.packSize} · {alt.price.toFixed(2)} kr
        {Number.isFinite(diff) && (diff > 0 ? <> (spara ca {diff.toFixed(0)} kr)</> : <> (inte billigare totalt)</>)}
        {s.saleReason && <div className="text-amber-700 italic mt-0.5">{s.saleReason}</div>}
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => {
            learnChoice(item.name, alt, false)
            set({ product: alt, quantity: altQty, saleAlt: undefined, saleReason: undefined, source: 'manual', note: 'Bytt till extrapris' })
          }}
          className="bg-amber-600 hover:bg-amber-700 text-white px-3 py-1 rounded-full font-semibold"
        >Byt</button>
        <button
          onClick={() => set({ saleAlt: undefined, saleReason: undefined })}
          className="border border-amber-300 hover:bg-amber-100 px-3 py-1 rounded-full"
        >Behåll</button>
      </div>
    </div>
  )
}

function Editor({ item, s, set, onClose }: {
  item: ShoppingItem
  s: MathemSuggestion
  set: (p: Partial<MathemSuggestion>) => void
  onClose: () => void
}) {
  const { addPantryItem } = useSettingsStore()
  const [query, setQuery] = useState(s.query)
  const [hits, setHits] = useState<MathemProduct[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load(q: string) {
    setBusy(true)
    setError(null)
    try {
      setHits(await searchMathem(q, 12))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  // Alternatives come from the local search cache, so this is instant after the first time.
  useEffect(() => { if (s.query) load(s.query) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function choose(p: MathemProduct) {
    const snap = snapshot(p)
    learnChoice(item.name, snap, false)
    set({ product: snap, quantity: packsFor(item, p.packSize, s.quantity || 1), include: true, source: 'manual', note: undefined, saleAlt: undefined, query })
  }

  return (
    <div className="border border-line-soft rounded-2xl p-2.5 space-y-2.5 bg-white">
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 text-[13px] text-ink-soft mr-auto">
          <input
            type="checkbox"
            checked={s.include}
            disabled={!s.product}
            onChange={e => set({ include: e.target.checked, quantity: Math.max(s.quantity, 1) })}
            className="w-4 h-4 accent-brand-600"
          />
          Lägg i korgen
        </label>
        {s.include && s.product && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => set(s.quantity <= 1 ? { include: false } : { quantity: s.quantity - 1 })}
              aria-label="Färre"
              className="w-9 h-9 rounded-full bg-canvas hover:bg-line flex items-center justify-center"
            ><Minus className="w-4 h-4" /></button>
            <span className="w-6 text-center text-sm font-semibold">{s.quantity}</span>
            <button
              onClick={() => set({ quantity: s.quantity + 1 })}
              aria-label="Fler"
              className="w-9 h-9 rounded-full bg-canvas hover:bg-line flex items-center justify-center"
            ><Plus className="w-4 h-4" /></button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5 bg-canvas rounded-full pl-3 pr-1">
        <Search className="w-4 h-4 text-ink-faint shrink-0" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && query.trim() && load(query)}
          placeholder="Sök annan produkt"
          className="flex-1 min-w-0 h-9 bg-transparent text-base md:text-sm focus:outline-none"
        />
        <button
          onClick={() => query.trim() && load(query)}
          disabled={busy}
          className="h-7 px-3 rounded-full bg-white text-xs font-semibold text-brand-700 disabled:opacity-50"
        >{busy ? '…' : 'Sök'}</button>
      </div>

      {error && <p className="text-xs text-red-700">{error}</p>}
      {hits && hits.length === 0 && <p className="text-xs text-ink-faint">Inga träffar.</p>}
      {hits && hits.length > 0 && (
        <ul className="max-h-72 overflow-y-auto -mx-1 divide-y divide-line-soft">
          {hits.map(h => {
            const chosen = h.id === s.product?.productId
            return (
              <li key={h.id}>
                <button
                  onClick={() => choose(h)}
                  className={`w-full flex items-center gap-2 px-1 py-1.5 text-left rounded-lg ${chosen ? 'bg-brand-50' : 'hover:bg-canvas'}`}
                >
                  {h.imageUrl
                    ? <img src={h.imageUrl} alt="" loading="lazy" className="w-9 h-9 object-contain rounded-lg bg-white shrink-0" />
                    : <span className="w-9 h-9 rounded-lg bg-line-soft shrink-0" />}
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] text-ink truncate">{h.name}</span>
                    <span className="block text-[11px] text-ink-faint truncate">
                      {[h.packSize, h.unitPrice, ...h.tags].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className={`text-[13px] whitespace-nowrap ${h.onSale ? 'text-red-700 font-semibold' : 'text-ink-muted'}`}>
                    {h.price.toFixed(2)} kr
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <div className="flex items-center justify-between pt-1">
        <button
          onClick={() => {
            addPantryItem(item.name.toLowerCase())
            set({ include: false, note: 'Tillagd i skafferiet' })
            onClose()
          }}
          className="text-xs text-ink-muted hover:text-brand-700"
        >
          🏠 Har alltid hemma
        </button>
        <button onClick={onClose} className="h-8 px-3 rounded-full bg-ink text-white text-xs font-semibold">Klar</button>
      </div>
    </div>
  )
}
