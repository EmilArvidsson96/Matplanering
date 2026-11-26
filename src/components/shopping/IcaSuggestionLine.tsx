import { useEffect, useState, type ReactNode } from 'react'
import { AnimatedDiv, AnimatedUl } from '../common/Animated'
import { Minus, Plus, Search } from 'lucide-react'
import type { IcaSuggestion, ShoppingItem } from '../../types'
import { searchIca, IcaRateLimited } from '../../api/ica'
import { fromIca, type StoreProduct } from '../../api/shops'
import { icaCandidates, icaSnapshot, learnIcaChoice } from '../../store/icaJob'
import { packsFor } from '../../store/mathemStore'
import { buyModeOf } from '../../store/shoppingActions'
import { BuyModePicker } from './MathemSuggestionLine'
import { useSettingsStore } from '../../store/settingsStore'
import { findPreference } from '../../utils/productMatch'

const SOURCE_LABEL: Record<NonNullable<IcaSuggestion['source']>, string> = {
  preference: 'Som förra gången',
  ai: 'AI-val',
  search: 'Bästa träffen enligt reglerna',
  manual: 'Ditt val',
}

const kr = (n: number) => Number.isFinite(n) ? `${Math.round(n)} kr` : ''

/** The ICA product suggested for one shopping row, shown under its name. */
export default function IcaSuggestionLine({ item, onUpdate, open, onToggle, inlineEditor, other }: {
  item: ShoppingItem
  onUpdate: (patch: Partial<ShoppingItem>) => void
  open: boolean
  onToggle: () => void
  /** Phones: the editor opens under the row. Desktop: in the side column. */
  inlineEditor: boolean
  /** The other store's price for the same row, e.g. "Mathem 15 kr". */
  other?: ReactNode
}) {
  const s = item.ica!
  const p = s.product

  return (
    <div>
    <AnimatedDiv className="pl-[52px] pr-3 pb-2.5 -mt-1 space-y-1.5">
      <button
        onClick={onToggle}
        aria-expanded={open}
        className={`w-full flex items-center gap-2 text-left rounded-xl px-2 py-1.5 transition-colors
          ${open ? 'bg-brand-50 ring-1 ring-brand-300' : s.include ? 'bg-canvas hover:bg-line-soft' : 'hover:bg-canvas'}`}
      >
        {p?.imageUrl
          ? <img src={p.imageUrl} alt="" loading="lazy" className={`w-8 h-8 object-contain rounded-lg bg-white shrink-0 ${s.include ? '' : 'opacity-40'}`} />
          : <span className="w-8 h-8 rounded-lg bg-line-soft shrink-0" />}
        <span className="flex-1 min-w-0">
          <span className={`block text-[13px] truncate ${s.include ? 'text-ink-soft' : 'text-ink-faint line-through'}`}>
            {p ? `${p.name} · ${p.packSize}` : 'Ingen produkt'}
          </span>
          {(s.note || (s.source && s.include) || p?.offer) && (
            <span className="block text-[11px] text-ink-muted truncate">
              {p?.offer && s.include && <span className="text-red-700 font-semibold">{p.offer}</span>}
              {p?.offer && s.include && (s.source || s.note) ? ' · ' : ''}
              {s.include && s.source ? SOURCE_LABEL[s.source] : ''}
              {s.include && s.source && s.note ? ' · ' : ''}
              {s.note}
            </span>
          )}
        </span>
        {s.include && p && (
          <span className="text-[13px] text-ink-muted whitespace-nowrap shrink-0">
            {s.quantity} st{Number.isFinite(p.price) ? ` · ${kr(p.price * s.quantity)}` : ''}
            {other && <span className="block text-[11px] text-right text-ink-faint">{other}</span>}
          </span>
        )}
      </button>
      {open && inlineEditor && <IcaRowEditor item={item} onUpdate={onUpdate} onClose={onToggle} />}
    </AnimatedDiv>
    </div>
  )
}

/** Change the ICA product, quantity and how the item is bought. */
export function IcaRowEditor({ item, onUpdate, onClose }: {
  item: ShoppingItem
  onUpdate: (patch: Partial<ShoppingItem>) => void
  onClose: () => void
}) {
  const { settings } = useSettingsStore()
  const s = item.ica!
  const set = (patch: Partial<IcaSuggestion>) => onUpdate({ ica: { ...s, ...patch } })
  const [query, setQuery] = useState(s.query)
  const [hits, setHits] = useState<StoreProduct[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mode = buyModeOf(item)
  const fixed = findPreference(item.name, settings.productPreferences)?.fixedQuantity

  async function load(q: string) {
    // Answers are cached for days, so most searches never reach ICA.
    const cached = icaCandidates(s.store, q)
    if (cached) { setHits(cached); return }
    setBusy(true)
    setError(null)
    try {
      setHits((await searchIca(s.store, q, 12)).map(p => fromIca(s.store, p)))
    } catch (e) {
      setError(e instanceof IcaRateLimited
        ? 'ICA ber oss vänta några minuter innan nästa sökning.'
        : e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => { setQuery(s.query); if (s.query) load(s.query) }, [item.id]) // eslint-disable-line react-hooks/exhaustive-deps

  function choose(p: StoreProduct) {
    const snap = icaSnapshot(p)
    learnIcaChoice(item.name, snap, false)
    set({
      product: snap, include: true, source: 'manual', note: undefined, query,
      quantity: mode === 'stock' ? 1 : fixed ?? packsFor(item, p.packSize, s.quantity || 1),
    })
  }

  return (
    <div className="border border-line-soft rounded-2xl p-3 space-y-3 bg-white">
      <BuyModePicker item={item} />

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
          placeholder="Sök annan produkt hos ICA"
          aria-label="Sök annan produkt hos ICA"
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
        <AnimatedUl className="max-h-72 overflow-y-auto -mx-1 divide-y divide-line-soft">
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
                    <span className="block text-[11px] text-ink-muted truncate">
                      {[h.offer, h.packSize, h.unitPrice, ...h.tags].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className={`text-[13px] whitespace-nowrap ${h.onSale ? 'text-red-700 font-semibold' : 'text-ink-muted'}`}>
                    {h.price.toFixed(2)} kr
                  </span>
                </button>
              </li>
            )
          })}
        </AnimatedUl>
      )}

      <div className="flex items-center justify-end pt-1">
        <button onClick={onClose} className="h-8 px-3 rounded-full bg-ink text-white text-xs font-semibold">Klar</button>
      </div>
    </div>
  )
}
