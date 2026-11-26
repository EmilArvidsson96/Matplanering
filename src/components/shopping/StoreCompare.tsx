import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { ShopId, ShoppingItem } from '../../types'
import { cartHandoffUrl, claudeCartPrompt } from '../../api/mathem'
import { icaCartHandoffUrl, icaCartClaudePrompt } from '../../api/ica'
import { willysCartHandoffUrl, willysCartClaudePrompt } from '../../api/willys'
import { shortIcaName, STORE_BOOKMARKLET } from '../../api/shops'
import { useMathemJob, learnChoice } from '../../store/mathemStore'
import { useIcaJob, learnIcaChoice } from '../../store/icaJob'
import { useWillysJob, learnWillysChoice } from '../../store/willysJob'
import { useIcaPrefetch } from '../../store/icaPrefetch'

type Priced = { include: boolean; quantity: number; product: { price: number } | null }

/** Every store we compare, in the order they're shown. */
export const SHOPS: ShopId[] = ['ica', 'willys', 'mathem']

/** What a row costs in a store, or null when it isn't bought there. */
export function rowCost(s: Priced | undefined): number | null {
  if (!s?.include || !s.product || s.quantity <= 0 || !Number.isFinite(s.product.price)) return null
  return s.product.price * s.quantity
}

export function icaFor(item: ShoppingItem, store: string) {
  return item.ica?.store === store ? item.ica : undefined
}

/** A row's suggestion in one store (ICA only counts for the chosen ICA store). */
export function suggestionOf(item: ShoppingItem, shop: ShopId, icaStore: string) {
  return shop === 'ica' ? icaFor(item, icaStore) : shop === 'willys' ? item.willys : item.mathem
}

export function shopName(shop: ShopId, icaStore: { name: string }): string {
  return shop === 'ica' ? shortIcaName(icaStore.name) : shop === 'willys' ? 'Willys' : 'Mathem'
}

export const kr = (n: number) => `${Math.round(n).toLocaleString('sv-SE')} kr`

const perShop = (): Record<ShopId, number> => ({ ica: 0, willys: 0, mathem: 0 })

export interface Comparison {
  /** Rows that count: on the list, not bought, not waiting for a "har du hemma?" answer. */
  rows: ShoppingItem[]
  /** Stores compared: those with prices for at least half as many rows as the best one. */
  compared: ShopId[]
  /** Rows priced in every compared store, with each store's cost. */
  common: Array<{ item: ShoppingItem; cost: Record<ShopId, number> }>
  /** Each store's total for the common rows. */
  total: Record<ShopId, number>
  /** Each store's total for every row it has a price for. */
  own: Record<ShopId, number>
  /** Rows priced in each store. */
  priced: Record<ShopId, number>
  /** Rows each store has an answer for (product or "not found"). */
  answered: Record<ShopId, number>
  /** Compared stores, cheapest first (empty until two stores can be compared). */
  ranking: ShopId[]
  cheapest: ShopId | null
}

export function compareStores(items: ShoppingItem[], waiting: Set<string>, icaStore: string): Comparison {
  const rows = items.filter(i => !i.isPurchased && !i.isExcluded && !i.deletedAt && !waiting.has(i.id))
  const priced = perShop(), answered = perShop(), own = perShop()
  const costs = rows.map(item => {
    const cost: Partial<Record<ShopId, number>> = {}
    for (const shop of SHOPS) {
      const sug = suggestionOf(item, shop, icaStore)
      const c = rowCost(sug)
      if (sug) answered[shop]++
      if (c != null) { priced[shop]++; own[shop] += c; cost[shop] = c }
    }
    return { item, cost }
  })
  // A store that has only priced a few rows so far (ICA while it waits) would
  // shrink the common set to nothing, so it joins once it has caught up.
  const most = Math.max(...SHOPS.map(s => priced[s]))
  const compared = SHOPS.filter(s => priced[s] > 0 && priced[s] >= most / 2)
  const common = costs.filter(r => compared.every(s => r.cost[s] != null)) as Comparison['common']
  const total = perShop()
  for (const r of common) for (const s of compared) total[s] += r.cost[s]
  const ranking = compared.length >= 2 && common.length ? [...compared].sort((a, b) => total[a] - total[b]) : []
  return { rows, compared, common, total, own, priced, answered, ranking, cheapest: ranking[0] ?? null }
}

/**
 * Top of the shopping list: what the week costs at each store for the same
 * products, which store to shop at, and the hand-off to that store's cart.
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
  const willysJob = useWillysJob()
  const prefetch = useIcaPrefetch()
  const [showDiff, setShowDiff] = useState(false)
  const [sent, setSent] = useState<ShopId | null>(null)
  const [copied, setCopied] = useState(false)
  useEffect(() => { setSent(null); setCopied(false) }, [shop])

  const name = (s: ShopId) => shopName(s, icaStore)
  const n = cmp.rows.length
  if (n === 0) return null

  const mathemBusy = mathemJob.running && mathemJob.weekId === weekId
  const willysBusy = willysJob.running && willysJob.weekId === weekId
  const icaFetching = prefetch.running && prefetch.store === icaStore.id
  const icaBusy = (icaJob.running && icaJob.weekId === weekId) || icaFetching
  const busy: Record<ShopId, boolean> = { ica: icaBusy, willys: willysBusy, mathem: mathemBusy }
  const pausedAt = prefetch.pausedUntil
    ? new Date(prefetch.pausedUntil).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
    : null
  const counted = (s: ShopId) => cmp.compared.includes(s) || cmp.compared.length < 2
    ? `${cmp.priced[s]} av ${n} varor`
    : `${cmp.priced[s]} av ${n} varor, räknas inte med än`
  const status: Record<ShopId, string> = {
    ica: pausedAt
      ? `ICA bad oss vänta, fortsätter kl ${pausedAt}`
      : icaFetching ? `Hämtar priser… ${cmp.answered.ica} av ${n}`
      : icaBusy ? `Väljer produkter… ${cmp.answered.ica} av ${n}` : counted('ica'),
    willys: willysBusy ? `Hämtar priser… ${cmp.answered.willys} av ${n}` : counted('willys'),
    mathem: mathemBusy ? `Hämtar priser… ${cmp.answered.mathem} av ${n}` : counted('mathem'),
  }
  const loading = SHOPS.some(s => busy[s])
  const [first, second] = cmp.ranking
  const diff = first && second ? cmp.total[second] - cmp.total[first] : 0

  // The chosen store's cart.
  const sugOf = (i: ShoppingItem) => suggestionOf(i, shop, icaStore.id)
  const chosen = cmp.rows.filter(i => rowCost(sugOf(i)) != null)
  const cartTotal = chosen.reduce((s, i) => s + rowCost(sugOf(i))!, 0)
  const unanswered = cmp.rows.length - cmp.answered[shop]
  const lines = () => chosen.map(i => {
    const sug = sugOf(i)!
    return { productId: sug.product!.productId, quantity: sug.quantity, label: i.name }
  })

  function learnAll() {
    for (const i of chosen) {
      if (shop === 'ica') learnIcaChoice(i.name, i.ica!.product!, true)
      else if (shop === 'willys') learnWillysChoice(i.name, i.willys!.product!, true)
      else learnChoice(i.name, i.mathem!.product!, true)
    }
  }
  const l = lines()
  const storeUrl = shop === 'ica'
    ? icaCartHandoffUrl(icaStore.id, l as Array<{ productId: string; quantity: number }>)
    : shop === 'willys'
      ? willysCartHandoffUrl(l as Array<{ productId: string; quantity: number }>)
      : cartHandoffUrl(l as Array<{ productId: number; quantity: number }>)
  // A plain link (not window.open): a normal tab that popup blockers and home-screen apps leave alone.
  function onOpenStore() {
    learnAll()
    setSent(shop)
  }
  async function copyForClaude() {
    learnAll()
    const l = lines()
    await navigator.clipboard.writeText(shop === 'ica'
      ? icaCartClaudePrompt(icaStore.id, l as Array<{ productId: string; quantity: number; label: string }>)
      : shop === 'willys'
        ? willysCartClaudePrompt(l as Array<{ productId: string; quantity: number; label: string }>)
        : claudeCartPrompt(l as Array<{ productId: number; quantity: number; label: string }>))
    setCopied(true)
    setSent(shop)
  }
  function start(opts: { retry?: boolean; refresh?: boolean }) {
    if (shop === 'ica') icaJob.start(weekId, icaStore.id, items, opts)
    else if (shop === 'willys') willysJob.start(weekId, items, opts)
    else mathemJob.start(weekId, items, opts)
  }

  const topDiffs = [...cmp.common]
    .map(r => {
      const vals = cmp.compared.map(s => r.cost[s])
      return { ...r, min: Math.min(...vals), spread: Math.max(...vals) - Math.min(...vals) }
    })
    .sort((a, b) => b.spread - a.spread)
    .slice(0, 10)
  const error = shop === 'ica' ? icaJob.error ?? prefetch.error : shop === 'willys' ? willysJob.error : mathemJob.error
  const site = shop === 'ica' ? 'handlaprivatkund.ica.se' : shop === 'willys' ? 'willys.se' : 'mathem.se'

  return (
    <section aria-label="Jämför butiker" className="card p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold">
          {cmp.cheapest && !loading ? 'Billigast den här veckan' : 'Jämför butiker'}
        </h2>
        <span className="text-[12px] text-ink-muted">Tryck för att välja butik</span>
      </div>

      <div role="radiogroup" aria-label="Handla på" className="space-y-1.5">
        {SHOPS.map(id => {
          const selected = shop === id
          const best = cmp.cheapest === id
          const inCommon = cmp.compared.includes(id) && cmp.common.length > 0 && cmp.compared.length >= 2
          return (
            <button
              key={id}
              role="radio"
              aria-checked={selected}
              onClick={() => onShop(id)}
              className={`w-full flex items-center gap-3 text-left rounded-2xl px-3 py-2 transition-colors border
                ${selected ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600' : 'border-line hover:bg-canvas'}`}
            >
              <span className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${selected ? 'border-brand-600' : 'border-ink-faint/60'}`}>
                {selected && <span className="w-2 h-2 rounded-full bg-brand-600" />}
              </span>
              <span className="flex-1 min-w-0">
                <span className="flex items-center gap-1.5">
                  <span className="text-[14px] font-semibold truncate">{name(id)}</span>
                  {best && <span className="text-[10px] font-semibold uppercase tracking-wide bg-brand-600 text-white rounded-full px-1.5 py-0.5 shrink-0">Billigast</span>}
                </span>
                <span className="block text-[11.5px] text-ink-muted truncate">{status[id]}</span>
              </span>
              <span className="text-[19px] leading-tight font-bold tabular-nums whitespace-nowrap">
                {inCommon ? kr(cmp.total[id]) : cmp.priced[id] ? kr(cmp.own[id]) : '–'}
              </span>
            </button>
          )
        })}
      </div>

      <p className="text-[12.5px] text-ink-muted">
        {!first || !second
          ? 'Priserna hämtas automatiskt från alla butiker. ICA tar längre tid eftersom vi hämtar i lugn takt.'
          : <>
              {diff >= 1
                ? <><span className="font-semibold text-ink">{name(first)} är {kr(diff)} billigare</span> än {name(second)} för </>
                : `${name(first)} och ${name(second)} kostar lika mycket för `}
              samma {cmp.common.length} varor. Leveransavgift ingår inte.
            </>}
      </p>

      {cmp.common.length > 0 && cmp.compared.length >= 2 && (
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
                  {cmp.compared.map(s => (
                    <th key={s} className="font-medium py-1 pl-2 text-right whitespace-nowrap">{s === 'ica' ? 'ICA' : name(s)}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {topDiffs.map(({ item, cost, min }) => (
                  <tr key={item.id}>
                    <td className="py-1 pr-2 truncate max-w-0 w-full">{item.name}</td>
                    {cmp.compared.map(s => (
                      <td key={s} className={`py-1 pl-2 text-right whitespace-nowrap ${cost[s] === min ? 'font-semibold text-brand-700' : ''}`}>{kr(cost[s])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div className="border-t border-line-soft pt-3 space-y-2">
        <p className="text-[13px]">
          <span className="font-semibold">Korg på {name(shop)}:</span>{' '}
          {chosen.length} varor · ca {kr(cartTotal)}
          {unanswered > 0 && !busy[shop] && <span className="text-ink-muted"> · {unanswered} utan förslag</span>}
        </p>
        {error && (
          <p className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-2xl px-3 py-2">{error}</p>
        )}
        <div className="flex flex-wrap gap-2">
          {chosen.length > 0 ? (
            <a
              href={storeUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onOpenStore}
              className="h-10 px-4 rounded-full bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold inline-flex items-center"
            >
              Fyll korgen på {name(shop)}
            </a>
          ) : (
            <button disabled className="h-10 px-4 rounded-full bg-brand-600 opacity-50 text-white text-sm font-semibold">
              Fyll korgen på {name(shop)}
            </button>
          )}
          <button
            onClick={copyForClaude}
            disabled={chosen.length === 0}
            className="h-10 px-4 rounded-full bg-canvas hover:bg-line disabled:opacity-50 text-sm font-medium"
          >
            {copied ? '✓ Kopierat' : 'Kopiera till Claude'}
          </button>
          {!busy[shop] && unanswered > 0 && (
            <button onClick={() => start({ retry: true })} className="h-10 px-4 rounded-full bg-canvas hover:bg-line text-sm font-medium">
              Försök igen för {unanswered}
            </button>
          )}
          {!busy[shop] && (
            <button
              onClick={() => start({ refresh: true })}
              className="h-10 px-3 rounded-full text-sm text-ink-muted hover:text-ink"
              title="Matcha om alla varor (behåller inlärda val)"
            >
              Hämta om alla
            </button>
          )}
        </div>
        <BookmarkletHelp sent={sent} site={site} storeName={name(shop)} />
      </div>
    </section>
  )
}

/** How the hand-off works: one bookmark for Willys, Mathem, ICA Handla and the ICA list. */
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
          till bokmärkesfältet. Samma bokmärke fungerar för Willys, Mathem, ICA Handla och ICA-listan. Det visar resultatet i en rad överst på butikens sida. Har du ett äldre bokmärke som visar rutor du måste klicka bort? Ta bort det och dra in det här igen. Du behöver vara inloggad på {site}.
          Med Claude: tryck "Kopiera till Claude" och klistra in i Claude-appen. Dina val sparas och används nästa gång.
        </p>
      )}
    </div>
  )
}
