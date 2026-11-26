import { useEffect, useRef, useState } from 'react'
import { ShoppingCart } from 'lucide-react'
import type { ShoppingItem } from '../../types'
import { cartHandoffUrl, claudeCartPrompt, MATHEM_BOOKMARKLET } from '../../api/mathem'
import { useMathemJob, learnChoice } from '../../store/mathemStore'

/** Summary of the Mathem suggestions on the list, and the hand-off to mathem.se. */
export default function MathemCartBar({ weekId, items, waiting }: {
  weekId: string
  items: ShoppingItem[]
  /** Rows still waiting for an answer in "Har du redan hemma?" (not put in the cart). */
  waiting: Set<string>
}) {
  const job = useMathemJob()
  const [sent, setSent] = useState(false)
  const [copied, setCopied] = useState(false)
  const [help, setHelp] = useState(false)

  const open = items.filter(i => !i.isPurchased && !i.isExcluded)
  const withSuggestion = open.filter(i => i.mathem)
  const chosen = withSuggestion.filter(i => !waiting.has(i.id) && i.mathem!.include && i.mathem!.product && i.mathem!.quantity > 0)
  const missing = open.length - withSuggestion.length
  const swaps = chosen.filter(i => i.mathem!.saleAlt).length
  const packs = chosen.reduce((s, i) => s + i.mathem!.quantity, 0)
  const total = chosen.reduce((s, i) => s + (Number.isFinite(i.mathem!.product!.price) ? i.mathem!.product!.price * i.mathem!.quantity : 0), 0)
  const runningHere = job.running && job.weekId === weekId
  const done = job.total - job.pending.size

  if (withSuggestion.length === 0 && !runningHere && !job.error) return null

  function learnAll() {
    for (const i of chosen) learnChoice(i.name, i.mathem!.product!, true)
  }
  const lines = () => chosen.map(i => ({ productId: i.mathem!.product!.productId, quantity: i.mathem!.quantity, label: i.name }))

  function openMathem() {
    learnAll()
    window.open(cartHandoffUrl(lines()), '_blank')
    setSent(true)
    setHelp(true)
  }

  async function copyForClaude() {
    learnAll()
    await navigator.clipboard.writeText(claudeCartPrompt(lines()))
    setCopied(true)
    setSent(true)
  }

  return (
    <section className="card p-4 space-y-3">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center shrink-0">
          <ShoppingCart className="w-5 h-5" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-semibold">Mathem</p>
          <p className="text-[13px] text-ink-muted">
            {runningHere
              ? `Hämtar produktförslag… ${done} av ${job.total}. Du kan gå runt i appen under tiden.`
              : <>
                  {chosen.length} varor · {packs} förp. · ca {Math.round(total)} kr
                  {swaps > 0 && <span className="text-amber-700"> · {swaps} extrapris att ta ställning till</span>}
                  {waiting.size > 0 && <span> · {waiting.size} väntar på svar om de finns hemma</span>}
                </>}
          </p>
          {runningHere && (
            <div className="h-1.5 rounded-full bg-line overflow-hidden mt-2">
              <div className="h-full bg-brand-600 transition-all" style={{ width: `${job.total ? (done / job.total) * 100 : 0}%` }} />
            </div>
          )}
        </div>
      </div>

      {job.error && (
        <p className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-2xl px-3 py-2">{job.error}</p>
      )}

      {!runningHere && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={openMathem}
            disabled={chosen.length === 0}
            className="h-10 px-4 rounded-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold"
          >
            Fyll korgen på Mathem
          </button>
          <button
            onClick={copyForClaude}
            disabled={chosen.length === 0}
            className="h-10 px-4 rounded-full bg-canvas hover:bg-line disabled:opacity-50 text-sm font-medium"
          >
            {copied ? '✓ Kopierat' : 'Kopiera till Claude'}
          </button>
          {missing > 0 && (
            <button
              onClick={() => job.start(weekId, items)}
              className="h-10 px-4 rounded-full bg-canvas hover:bg-line text-sm font-medium"
            >
              Hämta för {missing} nya
            </button>
          )}
          <button
            onClick={() => job.start(weekId, items, { refresh: true })}
            className="h-10 px-3 rounded-full text-sm text-ink-muted hover:text-ink"
            title="Matcha om alla varor (behåller inlärda val)"
          >
            Hämta om alla
          </button>
        </div>
      )}

      <BookmarkletHelp open={help} sent={sent} onToggle={() => setHelp(h => !h)} />
    </section>
  )
}

function BookmarkletHelp({ open, sent, onToggle }: { open: boolean; sent: boolean; onToggle: () => void }) {
  const ref = useRef<HTMLAnchorElement>(null)
  // React warns about javascript: URLs in JSX, so set the href directly.
  useEffect(() => { ref.current?.setAttribute('href', MATHEM_BOOKMARKLET) }, [open])

  return (
    <div className={`text-xs rounded-2xl ${sent ? 'bg-brand-50 text-brand-800' : 'text-ink-muted'}`}>
      <button onClick={onToggle} className={`w-full text-left ${sent ? 'px-3 pt-2' : ''} ${open ? '' : sent ? 'pb-2' : ''}`}>
        {sent ? 'Mathem öppnades i en ny flik. Klicka där på bokmärket "Fyll Mathem-korg".' : 'Hur fungerar det?'} {open ? '▲' : '▼'}
      </button>
      {open && (
        <p className={`${sent ? 'px-3 pb-2' : ''} pt-1`}>
          Första gången: dra{' '}
          <a
            ref={ref}
            onClick={e => e.preventDefault()}
            className="inline-block bg-white border border-brand-300 text-brand-700 font-medium rounded-full px-2.5 py-0.5 mx-0.5 cursor-move"
            title="Dra till bokmärkesfältet"
          >
            Fyll Mathem-korg
          </a>{' '}
          till bokmärkesfältet. Du behöver vara inloggad på mathem.se. Med Claude: tryck "Kopiera till Claude" och klistra in i
          Claude-appen. Dina val sparas och används nästa gång.
        </p>
      )}
    </div>
  )
}
