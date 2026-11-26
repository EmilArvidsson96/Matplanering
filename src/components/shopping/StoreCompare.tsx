import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { ShopId, ShoppingItem } from '../../types'
import { cartHandoffUrl, claudeCartPrompt } from '../../api/mathem'
import { icaCartHandoffUrl, icaCartClaudePrompt } from '../../api/ica'
import { shortIcaName, STORE_BOOKMARKLET } from '../../api/shops'
import { useMathemJob, learnChoice } from '../../store/mathemStore'
import { useIcaJob, learnIcaChoice } from '../../store/icaJob'
import { useIcaPrefetch } from '../../store/icaPrefetch'

type Priced = { include: boolean; quantity: number; product: { price: number } | null }

/** What a row costs in a store, or null when it isn't bought there. */
export function rowCost(s: Priced | undefined): number | null {
  if (!s?.include || !s.product || s.quantity <= 0 || !Number.isFinite(s.product.price)) return null
  return s.product.price * s.quantity
}

export function icaFor(item: ShoppingItem, store: string) {
  return item.ica?.store === store ? item.ica : undefined
}

export const kr = (n: number) => `${Math.round(n).toLocaleString('sv-SE')} kr`

export interface Comparison {
  /** Rows that count: on the list, not bought, not waiting for a "har du hemma?" answer. */
  rows: ShoppingItem[]
  /** Rows priced in both stores, with each store's cost. */
  both: Array<{ item: ShoppingItem; ica: number; mathem: number }>
  total: Record<ShopId, number>
  /** Each store's total for every row it has a price for. */
  own: Record<ShopId, number>
  /** Rows priced in each store. */
  priced: Record<ShopId, number>
  /** Rows each store has an answer for (product or "not found"). */
  answered: Record<ShopId, number>
  cheapest: ShopId | null
}

export function compareStores(items: ShoppingItem[], waiting: Set<string>, icaStore: string): Comparison {
  const rows = items.filter(i => !i.isPurchased && !i.isExcluded && !i.deletedAt && !waiting.has(i.id))
  const both: Comparison['both'] = []
  const priced = { ica: 0, mathem: 0 }
  const answered = { ica: 0, mathem: 0 }
  const own = { ica: 0, mathem: 0 }
  for (const item of rows) {
    const ica = rowCost(icaFor(item, icaStore))
    const mathem = rowCost(item.mathem)
    if (icaFor(item, icaStore)) answered.ica++
    if (item.mathem) answered.mathem++
    if (ica != null) { priced.ica++; own.ica += ica }
    if (mathem != null) { priced.mathem++; own.mathem += mathem }
    if (ica != null && mathem != null) both.push({ item, ica, mathem })
  }
  const total = {
    ica: both.reduce((s, r) => s + r.ica, 0),
    mathem: both.reduce((s, r) => s + r.mathem, 0),
  }
  const cheapest = both.length ? (total.ica <= total.mathem ? 'ica' : 'mathem') : null
  return { rows, both, total, own, priced, answered, cheapest }
}

/**
 * Top of the shopping list: what the week costs at ICA and at Mathem for the
 * same products, which store to shop at, and the hand-off to that store's cart.
 */
export default function StoreCompare({ weekId, items, cmp, shop, onShop, icaStore }: {
  weekId: string
  items: ShoppingItem[]
  cmp: Comparison
  shop: ShopId
  onShop: (s: ShopId) => void
  icaStore: { id: string; name: string }
}) {
  const mathemJob = useMathemJob()
  const icaJob = useIcaJob()
  const prefetch = useIcaPrefetch()
  const [showDiff, setShowDiff] = useState(false)
  const [sent, setSent] = useState<ShopId | null>(null)
  const [copied, setCopied] = useState(false)
  useEffect(() => { setSent(null); setCopied(false) }, [shop])

  const names: Record<ShopId, string> = { ica: shortIcaName(icaStore.name), mathem: 'Mathem' }
  const n = cmp.rows.length
  if (n === 0) return null

  const mathemBusy = mathemJob.running && mathemJob.weekId === weekId
  const icaFetching = prefetch.running && prefetch.store === icaStore.id
  const icaBusy = (icaJob.running && icaJob.weekId === weekId) || icaFetching
  const pausedAt = prefetch.pausedUntil
    ? new Date(prefetch.pausedUntil).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
    : null
  const status: Record<ShopId, string> = {
    ica: pausedAt
      ? `ICA bad oss vänta, fortsätter kl ${pausedAt}`
      : icaFetching ? `Hämtar priser… ${cmp.answered.ica} av ${n}`
      : icaBusy ? `Väljer produkter… ${cmp.answered.ica} av ${n}` : `${cmp.priced.ica} av ${n} varor`,
    mathem: mathemBusy ? `Hämtar priser… ${cmp.answered.mathem} av ${n}` : `${cmp.priced.mathem} av ${n} varor`,
  }
  const diff = Math.abs(cmp.total.ica - cmp.total.mathem)
  const loading = mathemBusy || icaBusy

  // The chosen store's cart.
  const chosen = cmp.rows.filter(i => rowCost(shop === 'ica' ? icaFor(i, icaStore.id) : i.mathem) != null)
  const cartTotal = chosen.reduce((s, i) => s + rowCost(shop === 'ica' ? icaFor(i, icaStore.id) : i.mathem)!, 0)
  const unanswered = cmp.rows.length - cmp.answered[shop]

  function learnAll() {
    for (const i of chosen) {
      if (shop === 'ica') learnIcaChoice(i.name, i.ica!.product!, true)
      else learnChoice(i.name, i.mathem!.product!, true)
    }
  }
  function openStore() {
    learnAll()
    const url = shop === 'ica'
      ? icaCartHandoffUrl(icaStore.id, chosen.map(i => ({ productId: i.ica!.product!.productId, quantity: i.ica!.quantity })))
      : cartHandoffUrl(chosen.map(i => ({ productId: i.mathem!.product!.productId, quantity: i.mathem!.quantity })))
    window.open(url, '_blank')
    setSent(shop)
  }
  async function copyForClaude() {
    learnAll()
    await navigator.clipboard.writeText(shop === 'ica'
      ? icaCartClaudePrompt(icaStore.id, chosen.map(i => ({ productId: i.ica!.product!.productId, quantity: i.ica!.quantity, label: i.name })))
      : claudeCartPrompt(chosen.map(i => ({ productId: i.mathem!.product!.productId, quantity: i.mathem!.quantity, label: i.name }))))
    setCopied(true)
    setSent(shop)
  }
  function retry() {
    if (shop === 'ica') icaJob.start(weekId, icaStore.id, items, { retry: true })
    else mathemJob.start(weekId, items, { retry: true })
  }
  function refresh() {
    if (shop === 'ica') icaJob.start(weekId, icaStore.id, items, { refresh: true })
    else mathemJob.start(weekId, items, { refresh: true })
  }

  const topDiffs = [...cmp.both].sort((a, b) => Math.abs(b.ica - b.mathem) - Math.abs(a.ica - a.mathem)).slice(0, 10)
  const error = shop === 'ica' ? icaJob.error ?? prefetch.error : mathemJob.error

  return (
    <section aria-label="Jämför butiker" className="card p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold">
          {cmp.cheapest && !loading ? 'Billigast den här veckan' : 'Jämför butiker'}
        </h2>
        <span className="text-[12px] text-ink-muted">Tryck för att välja butik</span>
      </div>

      <div role="radiogroup" aria-label="Handla på" className="grid grid-cols-2 gap-2">
        {(['ica', 'mathem'] as ShopId[]).map(id => {
          const selected = shop === id
          const best = cmp.cheapest === id && cmp.both.length > 0
          return (
            <button
              key={id}
              role="radio"
              aria-checked={selected}
              onClick={() => onShop(id)}
              className={`text-left rounded-2xl px-3 py-2.5 transition-colors border
                ${selected ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600' : 'border-line hover:bg-canvas'}`}
            >
              <span className="block text-[13px] font-semibold truncate">{names[id]}</span>
              <span className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[22px] leading-tight font-bold tabular-nums whitespace-nowrap">
                  {cmp.both.length ? kr(cmp.total[id]) : cmp.priced[id] ? kr(cmp.own[id]) : '–'}
                </span>
                {best && <span className="text-[10px] font-semibold uppercase tracking-wide bg-brand-600 text-white rounded-full px-1.5 py-0.5">Billigast</span>}
              </span>
              <span className="block text-[11.5px] text-ink-muted truncate">{status[id]}</span>
            </button>
          )
        })}
      </div>

      <p className="text-[12.5px] text-ink-muted">
        {cmp.both.length === 0
          ? 'Priserna hämtas automatiskt från båda butikerna. ICA tar längre tid eftersom vi hämtar i lugn takt.'
          : <>
              {diff >= 1 && cmp.cheapest
                ? <><span className="font-semibold text-ink">{names[cmp.cheapest]} är {kr(diff)} billigare</span> för </>
                : 'Lika dyrt för '}
              samma {cmp.both.length} varor. Leveransavgift ingår inte.
            </>}
      </p>

      {cmp.both.length > 0 && (
        <div>
          <button
            onClick={() => setShowDiff(v => !v)}
            aria-expanded={showDiff}
            className="flex items-center gap-1 text-[12.5px] font-semibold text-brand-700"
          >
            {showDiff ? 'Dölj skillnader per vara' : 'Visa skillnader per vara'}
            <ChevronDown className={`w-4 h-4 transition-transform ${showDiff ? 'rotate-180' : ''}`} />
          </button>
          {showDiff && (
            <table className="w-full mt-2 text-[12.5px] tabular-nums">
              <thead>
                <tr className="text-ink-muted text-left">
                  <th className="font-medium py-1">Vara</th>
                  <th className="font-medium py-1 text-right whitespace-nowrap">ICA</th>
                  <th className="font-medium py-1 text-right">Mathem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {topDiffs.map(({ item, ica, mathem }) => (
                  <tr key={item.id}>
                    <td className="py-1 pr-2 truncate max-w-0 w-full">{item.name}</td>
                    <td className={`py-1 pl-2 text-right whitespace-nowrap ${ica < mathem ? 'font-semibold text-brand-700' : ''}`}>{kr(ica)}</td>
                    <td className={`py-1 pl-2 text-right whitespace-nowrap ${mathem < ica ? 'font-semibold text-brand-700' : ''}`}>{kr(mathem)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div className="border-t border-line-soft pt-3 space-y-2">
        <p className="text-[13px]">
          <span className="font-semibold">Korg på {names[shop]}:</span>{' '}
          {chosen.length} varor · ca {kr(cartTotal)}
          {unanswered > 0 && !loading && <span className="text-ink-muted"> · {unanswered} utan förslag</span>}
        </p>
        {error && (
          <p className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-2xl px-3 py-2">{error}</p>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={openStore}
            disabled={chosen.length === 0}
            className="h-10 px-4 rounded-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold"
          >
            Fyll korgen på {names[shop]}
          </button>
          <button
            onClick={copyForClaude}
            disabled={chosen.length === 0}
            className="h-10 px-4 rounded-full bg-canvas hover:bg-line disabled:opacity-50 text-sm font-medium"
          >
            {copied ? '✓ Kopierat' : 'Kopiera till Claude'}
          </button>
          {!loading && unanswered > 0 && (
            <button onClick={retry} className="h-10 px-4 rounded-full bg-canvas hover:bg-line text-sm font-medium">
              Försök igen för {unanswered}
            </button>
          )}
          {!loading && (
            <button
              onClick={refresh}
              className="h-10 px-3 rounded-full text-sm text-ink-muted hover:text-ink"
              title="Matcha om alla varor (behåller inlärda val)"
            >
              Hämta om alla
            </button>
          )}
        </div>
        <BookmarkletHelp sent={sent} site={shop === 'ica' ? 'handlaprivatkund.ica.se' : 'mathem.se'} storeName={names[shop]} />
      </div>
    </section>
  )
}

/** How the hand-off works: one bookmark for Mathem, ICA Handla and the ICA list. */
export function BookmarkletHelp({ sent, site, storeName, what = 'korgen' }: {
  sent: ShopId | 'list' | null
  site: string
  storeName: string
  what?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLAnchorElement>(null)
  // React warns about javascript: URLs in JSX, so set the href directly.
  useEffect(() => { ref.current?.setAttribute('href', STORE_BOOKMARKLET) }, [open, sent])
  const show = open || !!sent

  return (
    <div className={`text-xs rounded-2xl ${sent ? 'bg-brand-50 text-brand-800 px-3 py-2' : 'text-ink-muted'}`}>
      <button onClick={() => setOpen(o => !o)} className="w-full text-left">
        {sent ? `${storeName} öppnades i en ny flik. Klicka där på bokmärket "Matplanering: fyll" så hamnar varorna i ${what}.` : 'Hur fungerar det?'}
        {!sent && (open ? ' ▲' : ' ▼')}
      </button>
      {show && (
        <p className="pt-1">
          Första gången: dra{' '}
          <a
            ref={ref}
            onClick={e => e.preventDefault()}
            className="inline-block bg-white border border-brand-300 text-brand-700 font-medium rounded-full px-2.5 py-0.5 mx-0.5 cursor-move"
            title="Dra till bokmärkesfältet"
          >
            Matplanering: fyll
          </a>{' '}
          till bokmärkesfältet. Samma bokmärke fungerar för Mathem, ICA Handla och ICA-listan. Du behöver vara inloggad på {site}.
          Med Claude: tryck "Kopiera till Claude" och klistra in i Claude-appen. Dina val sparas och används nästa gång.
        </p>
      )}
    </div>
  )
}
