import { useEffect, useMemo, useRef, useState } from 'react'
import Modal from '../common/Modal'
import SegmentedControl from '../common/SegmentedControl'
import { useSettingsStore } from '../../store/settingsStore'
import type { ProductPreference, ShopId, ShoppingItem } from '../../types'
import { mathemShop, icaShop, STORE_BOOKMARKLET, type Shop, type StoreProduct } from '../../api/shops'
import { DEFAULT_ICA_STORE } from '../../api/ica'
import { matchProductsWithAi } from '../../api/anthropic'
import {
  ingredientKey, searchQuery, isNotAProduct, findPreference, estimatePacks,
} from '../../utils/productMatch'

type Source = 'preference' | 'ai' | 'search'

interface Row {
  item: ShoppingItem
  status: 'loading' | 'ready' | 'error'
  candidates: StoreProduct[]
  product: StoreProduct | null
  quantity: number
  source?: Source
  include: boolean
  note?: string
  /** Extrapris swap the user hasn't answered yet. */
  saleAlt?: StoreProduct
  saleReason?: string
}

interface Summary { count: number; total: number; loading: boolean }

const AI_CHUNK = 15
const SEARCH_CONCURRENCY = 4

const SOURCE_LABEL: Record<Source, string> = {
  preference: 'Som förra gången',
  ai: 'AI-val',
  search: 'Första sökträffen',
}

async function mapLimit<T>(list: T[], limit: number, fn: (t: T) => Promise<void>) {
  let i = 0
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (i < list.length) await fn(list[i++])
  }))
}

/** A Mathem choice we couldn't find in today's search still has a usable id. */
function mathemPlaceholder(pref: ProductPreference): StoreProduct {
  return {
    id: String(pref.productId), name: pref.name, packSize: pref.packSize,
    price: NaN, unitPrice: '', onSale: false, tags: [],
    url: `https://www.mathem.se/se/products/${pref.productId}/`,
  }
}

/**
 * Review the shopping list as a store cart. Each store keeps its own matching
 * once opened, so switching tabs compares totals without starting over.
 */
export default function StoreCartModal({ items, initialShop, onClose }: {
  items: ShoppingItem[]
  initialShop: ShopId
  onClose: () => void
}) {
  const { settings, update } = useSettingsStore()
  const icaStore = settings.icaStore ?? DEFAULT_ICA_STORE
  const shops = useMemo<Record<ShopId, Shop>>(
    () => ({ ica: icaShop(icaStore), mathem: mathemShop }),
    [icaStore.id, icaStore.name], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const [active, setActive] = useState<ShopId>(initialShop)
  const [opened, setOpened] = useState<ShopId[]>([initialShop])
  const [summaries, setSummaries] = useState<Partial<Record<ShopId, Summary>>>({})

  function switchTo(id: ShopId) {
    setActive(id)
    setOpened(o => o.includes(id) ? o : [...o, id])
    if (settings.preferredShop !== id) update({ preferredShop: id })
  }

  const tabLabel = (id: ShopId) => {
    const s = summaries[id]
    return (
      <span className="truncate">
        {shops[id].label}
        {s && <span className="font-normal text-ink-muted"> · {s.loading ? '…' : `ca ${Math.round(s.total)} kr`}</span>}
      </span>
    )
  }

  return (
    <Modal
      title="Fyll kundkorg"
      onClose={onClose}
      wide
      fullHeight
      toolbar={
        <SegmentedControl
          ariaLabel="Butik"
          value={active}
          onChange={switchTo}
          options={(['ica', 'mathem'] as ShopId[]).map(id => ({ id, label: tabLabel(id) }))}
        />
      }
    >
      {opened.map(id => (
        <div key={id} className={id === active ? '' : 'hidden'}>
          <CartMatcher
            shop={shops[id]}
            items={items}
            onSummary={s => setSummaries(prev => ({ ...prev, [id]: s }))}
          />
        </div>
      ))}
    </Modal>
  )
}

function CartMatcher({ shop, items, onSummary }: {
  shop: Shop
  items: ShoppingItem[]
  onSummary: (s: Summary) => void
}) {
  const { settings, setProductPreferences, addPantryItem } = useSettingsStore()
  const learned = shop.id === 'ica' ? settings.icaProductPreferences : settings.productPreferences
  const [rows, setRows] = useState<Row[]>(() => items.map(item => {
    const skip = isNotAProduct(item.name, item.amount, item.unit)
    return {
      item, status: skip ? 'ready' : 'loading', candidates: [], product: null, quantity: 0,
      include: !skip, note: skip ? 'Inte en vara' : undefined,
    }
  }))
  const [aiError, setAiError] = useState<string | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [copied, setCopied] = useState(false)
  const started = useRef(false)

  const patchRow = (id: string, patch: Partial<Row>) =>
    setRows(rs => rs.map(r => r.item.id === id ? { ...r, ...patch } : r))

  // Match every row: search → saved preference as the starting point → AI
  // checks the household rules, picks unmatched rows and suggests offer swaps.
  useEffect(() => {
    if (started.current) return
    started.current = true
    const hasAi = !!settings.anthropicApiKey?.trim()
    const toMatch = rows.filter(r => r.status === 'loading')
    const forAi: Array<{ row: Row; candidates: StoreProduct[]; current?: StoreProduct }> = []

    const qtyFor = (row: Row, p: StoreProduct, fallback = 1) =>
      estimatePacks(row.item.amount, row.item.unit, p.packSize) ?? fallback

    ;(async () => {
      await mapLimit(toMatch, SEARCH_CONCURRENCY, async row => {
        const { item } = row
        try {
          let candidates = await shop.search(searchQuery(item.name))
          const pref = findPreference(item.name, learned, shop.id === 'mathem')
          let current: StoreProduct | undefined
          if (pref) {
            current = candidates.find(c => c.id === String(pref.productId))
              ?? await shop.findPreferred(pref).catch(() => undefined)
              ?? (shop.id === 'mathem' ? mathemPlaceholder(pref) : undefined)
            if (current && !candidates.some(c => c.id === current!.id)) candidates = [current, ...candidates]
          }
          if (candidates.length === 0) {
            patchRow(item.id, { status: 'ready', include: false, note: `Hittades inte hos ${shop.label}` })
            return
          }
          if (current && !hasAi) {
            patchRow(item.id, { status: 'ready', source: 'preference', candidates, product: current, quantity: qtyFor(row, current) })
            return
          }
          patchRow(item.id, { candidates })
          forAi.push({ row, candidates, current })
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          setSearchError(msg)
          patchRow(item.id, { status: 'error', include: false, note: msg })
        }
      })

      if (forAi.length === 0) return
      const fallback = ({ row, candidates, current }: typeof forAi[number]) => {
        const p = current ?? candidates[0]
        patchRow(row.item.id, {
          status: 'ready', source: current ? 'preference' : 'search', product: p, quantity: qtyFor(row, p),
        })
      }
      if (!hasAi) { forAi.forEach(fallback); return }

      const chunks: typeof forAi[] = []
      for (let i = 0; i < forAi.length; i += AI_CHUNK) chunks.push(forAi.slice(i, i + AI_CHUNK))
      await Promise.all(chunks.map(async chunk => {
        try {
          // The AI sees each row's candidates numbered 1…n; map its answer back to product ids.
          const matches = await matchProductsWithAi(chunk.map(({ row, candidates, current }) => ({
            itemId: row.item.id, name: row.item.name, amount: row.item.amount, unit: row.item.unit,
            current: current ? candidates.findIndex(c => c.id === current.id) + 1 : undefined,
            candidates: candidates.map((c, i) => ({
              id: i + 1, name: c.name, packSize: c.packSize, price: c.price, onSale: c.onSale, offer: c.offer, tags: c.tags,
            })),
          })), settings)
          const byId = new Map(matches.map(m => [m.itemId, m]))
          for (const entry of chunk) {
            const { row, candidates, current } = entry
            const m = byId.get(row.item.id)
            const pick = (n: number | null | undefined) => n != null ? candidates[n - 1] : undefined
            const product = pick(m?.productId)
            if (!m) { fallback(entry); continue }
            if (!product) {
              patchRow(row.item.id, {
                status: 'ready', source: 'ai', include: false, product: current ?? candidates[0],
                quantity: 1, note: m.reason || 'AI föreslår att hoppa över',
              })
              continue
            }
            const kept = current?.id === product.id
            patchRow(row.item.id, {
              status: 'ready', source: kept ? 'preference' : 'ai', product,
              quantity: qtyFor(row, product, m.quantity),
              note: kept ? undefined : current ? `Bytt från ${current.name}: ${m.reason ?? 'följer reglerna'}` : m.reason,
              saleAlt: pick(m.saleAlternativeId),
              saleReason: m.saleAlternativeId != null ? m.reason : undefined,
            })
          }
        } catch (e) {
          setAiError(e instanceof Error ? e.message : String(e))
          chunk.forEach(fallback)
        }
      }))
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loading = rows.filter(r => r.status === 'loading').length
  const pendingSwaps = rows.filter(r => r.include && r.saleAlt).length
  const chosen = rows.filter(r => r.include && r.product && r.quantity > 0)
  const total = chosen.reduce((s, r) => s + (Number.isFinite(r.product!.price) ? r.product!.price * r.quantity : 0), 0)
  const sorted = useMemo(
    () => [...rows].sort((a, b) => Number(b.include) - Number(a.include)),
    // keep order stable while the user toggles rows; only re-sort when loading finishes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loading === 0],
  ).map(r => rows.find(x => x.item.id === r.item.id)!)

  useEffect(() => {
    onSummary({ count: chosen.reduce((s, r) => s + r.quantity, 0), total, loading: loading > 0 })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, loading, chosen.length])

  function savePreferences() {
    const today = new Date().toISOString().slice(0, 10)
    const patch: Record<string, ProductPreference> = {}
    for (const r of chosen) {
      const key = ingredientKey(r.item.name)
      const prev = learned?.[key]
      const productId = shop.id === 'mathem' ? Number(r.product!.id) : r.product!.id
      patch[key] = {
        store: shop.id,
        productId,
        name: r.product!.name,
        packSize: r.product!.packSize,
        chosenAt: today,
        timesChosen: prev && String(prev.productId) === String(productId) ? prev.timesChosen + 1 : 1,
      }
    }
    setProductPreferences(patch, shop.id)
  }

  const lines = () => chosen.map(r => ({ productId: r.product!.id, quantity: r.quantity, label: r.item.name }))

  function openStore() {
    savePreferences()
    window.open(shop.handoffUrl(lines()), '_blank')
    setSent(true)
  }

  async function copyForClaude() {
    savePreferences()
    await navigator.clipboard.writeText(shop.claudePrompt(lines()))
    setCopied(true)
    setSent(true)
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-muted">
        {loading > 0
          ? `Letar produkter hos ${shop.label}… (${rows.length - loading}/${rows.length})`
          : `${chosen.length} av ${rows.length} varor valda. Ändra det som inte stämmer. Dina val sparas och används nästa gång.`}
        {pendingSwaps > 0 && <span className="text-amber-700"> {pendingSwaps} extrapris att ta ställning till.</span>}
      </p>

      {searchError && (
        <div className="bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl px-3 py-2">
          Sökningen hos {shop.label} misslyckades för vissa varor ({searchError}).
        </div>
      )}
      {aiError && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-xl px-3 py-2">
          AI-matchningen misslyckades ({aiError}). Visar tidigare val eller första sökträffen i stället.
        </div>
      )}

      <div className="divide-y divide-line-soft border border-line-soft rounded-xl">
        {sorted.map(row => (
          <CartRow
            key={row.item.id}
            row={row}
            shop={shop}
            onChange={p => patchRow(row.item.id, p)}
            onAlwaysHome={() => {
              addPantryItem(row.item.name.toLowerCase())
              patchRow(row.item.id, { include: false, note: 'Tillagd i skafferiet' })
            }}
          />
        ))}
      </div>

      <div className="sticky bottom-0 bg-white pt-3 border-t border-line-soft space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-ink-soft mr-auto">
            <span className="font-semibold">{chosen.reduce((s, r) => s + r.quantity, 0)} varor</span>
            <span className="text-ink-faint"> · ca {Math.round(total)} kr</span>
          </span>
          <button
            onClick={copyForClaude}
            disabled={loading > 0 || chosen.length === 0}
            className="border border-violet-200 text-violet-600 hover:bg-violet-50 disabled:opacity-50 px-3 py-2 rounded-full text-sm font-medium"
          >
            {copied ? '✓ Kopierat' : 'Kopiera till Claude'}
          </button>
          <button
            onClick={openStore}
            disabled={loading > 0 || chosen.length === 0}
            className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-4 py-2 rounded-full text-sm font-medium"
          >
            Öppna {shop.id === 'ica' ? 'ICA' : 'Mathem'} och fyll korgen
          </button>
        </div>
        <BookmarkletHelp highlight={sent} site={shop.site} storeName={shop.id === 'ica' ? 'ICA Handla' : 'Mathem'} />
      </div>
    </div>
  )
}

function CartRow({ row, shop, onChange, onAlwaysHome }: {
  row: Row
  shop: Shop
  onChange: (p: Partial<Row>) => void
  onAlwaysHome: () => void
}) {
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const { item, product } = row

  async function runSearch() {
    if (!query.trim()) return
    setSearching(true)
    try {
      const found = await shop.search(query, 12)
      if (found.length) onChange({
        candidates: found, product: found[0], include: true, source: undefined,
        quantity: estimatePacks(item.amount, item.unit, found[0].packSize) ?? 1,
      })
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className={`px-3 py-2.5 flex gap-3 items-start ${row.include ? '' : 'bg-canvas'}`}>
      <input
        type="checkbox"
        checked={row.include}
        disabled={!product}
        onChange={e => onChange({ include: e.target.checked, quantity: Math.max(row.quantity, 1) })}
        className="mt-1 accent-brand-600"
        title="Lägg i korgen"
      />
      <div className="flex-1 min-w-0 space-y-1">
        <div className="text-sm">
          <span className={row.include ? 'text-ink font-medium' : 'text-ink-faint'}>{item.name}</span>
          {(item.amount || item.unit) && <span className="text-xs text-ink-faint ml-2">{item.amount} {item.unit}</span>}
          {row.source && row.include && (
            <span className={`ml-2 text-[10px] rounded-full px-1.5 py-0.5 ${
              row.source === 'preference' ? 'bg-brand-50 text-brand-600' : 'bg-violet-50 text-violet-600'}`}>
              {SOURCE_LABEL[row.source]}
            </span>
          )}
        </div>

        {row.status === 'loading' && <div className="text-xs text-ink-faint">Söker…</div>}
        {row.note && <div className="text-xs text-ink-faint italic">{row.note}</div>}

        {row.saleAlt && row.include && product && (
          <SaleSwap row={row} onAccept={() => onChange({
            product: row.saleAlt, saleAlt: undefined, source: undefined,
            quantity: estimatePacks(item.amount, item.unit, row.saleAlt!.packSize) ?? row.quantity,
            note: 'Bytt till extrapris',
          })} onDecline={() => onChange({ saleAlt: undefined })} />
        )}

        {product && (
          <div className="flex items-center gap-2">
            {product.imageUrl
              ? <img src={product.imageUrl} alt="" className="w-9 h-9 object-contain rounded bg-white shrink-0" />
              : <div className="w-9 h-9 rounded bg-line-soft shrink-0" />}
            <select
              value={product.id}
              onChange={e => {
                const p = row.candidates.find(c => c.id === e.target.value)!
                onChange({
                  product: p, include: true, source: undefined,
                  quantity: estimatePacks(item.amount, item.unit, p.packSize) ?? row.quantity ?? 1,
                })
              }}
              className="flex-1 min-w-0 border border-line rounded-lg px-2 py-1 text-xs bg-white"
            >
              {row.candidates.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.packSize}{Number.isFinite(c.price) ? ` · ${c.price.toFixed(2)} kr` : ''}{c.offer ? ` · ${c.offer}` : c.onSale ? ' · extrapris' : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {row.status !== 'loading' && (
          <div className="flex gap-1">
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && runSearch()}
              placeholder="Sök annan produkt…"
              className="flex-1 min-w-0 border border-line-soft rounded-lg px-2 py-1 text-xs"
            />
            <button onClick={runSearch} disabled={searching} className="text-xs text-brand-600 px-2">
              {searching ? '…' : 'Sök'}
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-col items-end gap-1 shrink-0">
        {row.include && product && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => onChange(row.quantity <= 1 ? { include: false } : { quantity: row.quantity - 1 })}
              className="w-9 h-9 shrink-0 rounded-full bg-line-soft hover:bg-line text-sm leading-none"
            >−</button>
            <span className="w-5 text-center text-sm font-semibold">{row.quantity}</span>
            <button
              onClick={() => onChange({ quantity: row.quantity + 1 })}
              className="w-9 h-9 shrink-0 rounded-full bg-line-soft hover:bg-line text-sm leading-none"
            >+</button>
          </div>
        )}
        {row.include && product && Number.isFinite(product.price) && (
          <span className="text-xs text-ink-muted">
            {(product.price * row.quantity).toFixed(2)} kr{product.onSale && <span className="text-red-700"> %</span>}
          </span>
        )}
        <button
          onClick={onAlwaysHome}
          title="Alltid hemma: lägg i skafferiet och hoppa över"
          className="text-[11px] text-ink-faint hover:text-brand-500"
        >
          🏠 alltid hemma
        </button>
      </div>
    </div>
  )
}

function SaleSwap({ row, onAccept, onDecline }: { row: Row; onAccept: () => void; onDecline: () => void }) {
  const alt = row.saleAlt!
  const cur = row.product!
  const altQty = estimatePacks(row.item.amount, row.item.unit, alt.packSize) ?? row.quantity
  const diff = Number.isFinite(cur.price) ? cur.price * row.quantity - alt.price * altQty : NaN
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 text-xs text-amber-900 space-y-1">
      <div>
        <span className="font-medium">Extrapris:</span> {alt.name} · {alt.packSize} · {alt.price.toFixed(2)} kr
        {Number.isFinite(diff) && diff > 0 && <span> (spara ca {diff.toFixed(0)} kr)</span>}
        {Number.isFinite(diff) && diff <= 0 && <span> (inte billigare totalt)</span>}
      </div>
      {row.saleReason && <div className="text-amber-700 italic">{row.saleReason}</div>}
      <div className="flex gap-2">
        <button onClick={onAccept} className="bg-amber-600 hover:bg-amber-700 text-white px-2 py-0.5 rounded-md font-medium">Byt</button>
        <button onClick={onDecline} className="border border-amber-300 hover:bg-amber-100 px-2 py-0.5 rounded-md">Behåll</button>
      </div>
    </div>
  )
}

function BookmarkletHelp({ highlight, site, storeName }: { highlight: boolean; site: string; storeName: string }) {
  const ref = useRef<HTMLAnchorElement>(null)
  // React warns about javascript: URLs in JSX, so set the href directly.
  useEffect(() => { ref.current?.setAttribute('href', STORE_BOOKMARKLET) }, [])

  return (
    <div className={`text-xs rounded-xl px-3 py-2 ${highlight ? 'bg-brand-50 text-brand-800' : 'bg-canvas text-ink-muted'}`}>
      {highlight && <p className="font-medium mb-1">{storeName} öppnades i en ny flik. Klicka där på bokmärket nedan så läggs allt i korgen.</p>}
      <p>
        Första gången: dra{' '}
        <a
          ref={ref}
          onClick={e => e.preventDefault()}
          className="inline-block bg-white border border-brand-300 text-brand-700 font-medium rounded-lg px-2 py-0.5 mx-0.5 cursor-move"
          title="Dra till bokmärkesfältet"
        >
          Matplanering: fyll
        </a>{' '}
        till bokmärkesfältet. Samma bokmärke fungerar för Mathem, ICA Handla och ICA-listan. Du behöver vara inloggad på {site}. Med Claude: tryck "Kopiera till Claude" och klistra in i Claude-appen.
      </p>
    </div>
  )
}
