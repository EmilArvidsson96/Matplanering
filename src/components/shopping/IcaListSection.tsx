import { useMemo, useState } from 'react'
import { ChevronDown, ListChecks } from 'lucide-react'
import { AnimatedDiv } from '../common/Animated'
import { useSettingsStore } from '../../store/settingsStore'
import type { ShoppingItem } from '../../types'
import { icaListHandoffUrl, icaListClaudePrompt } from '../../api/ica'
import { categoryKey, CATEGORY_ORDER } from '../../data/categories'
import { isNotAProduct } from '../../utils/productMatch'
import { BookmarkletHelp } from './StoreCompare'

const MEASURE_UNITS = new Set(['g', 'kg', 'ml', 'cl', 'dl', 'l'])
const COUNT_UNITS = new Set(['st', 'förp', 'paket', 'burk', 'burkar', 'knippe', 'kruka', 'krukor', 'klyfta', 'klyftor'])

/** "fast potatis, i små tärningar" 750 g → "Fast potatis 750 g". Spoon amounts are left out. */
export function icaRowText(item: ShoppingItem): string {
  const name = item.name.replace(/\(.*?\)/g, ' ').split(',')[0].replace(/\s+/g, ' ').trim() || categoryKey(item.name)
  const n = Number(String(item.amount).replace(',', '.'))
  const unit = item.unit.trim().toLowerCase()
  let amount = ''
  if (n > 0 && (MEASURE_UNITS.has(unit) || COUNT_UNITS.has(unit))) {
    const v = COUNT_UNITS.has(unit) ? Math.ceil(n - 0.05) : Math.round(n * 10) / 10
    amount = ` ${String(v).replace('.', ',')} ${item.unit.trim()}`
  }
  return name.charAt(0).toUpperCase() + name.slice(1) + amount
}

/**
 * "Handla i butik med ICA-appen": send the list to the ICA app as free-text
 * rows, right on the page. ICA sorts them into departments itself. A list with
 * the same name gets only the missing rows.
 */
export default function IcaListSection({ items, defaultName }: { items: ShoppingItem[]; defaultName: string }) {
  const { settings } = useSettingsStore()
  const [open, setOpen] = useState(false)
  const pantry = useMemo(() => new Set(settings.pantryItems.map(p => p.toLowerCase())), [settings.pantryItems])
  const rows = useMemo(() => [...items]
    .sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category))
    .map(item => ({
      item,
      text: icaRowText(item),
      skip: isNotAProduct(item.name, item.amount, item.unit) || pantry.has(item.name.toLowerCase()),
    })), [items, pantry])
  // Rows the user unticked; everything else that's a product goes on the list.
  const [off, setOff] = useState<Set<string>>(new Set())
  const [name, setName] = useState(defaultName)
  const [sent, setSent] = useState(false)
  const [copied, setCopied] = useState(false)

  const included = (r: typeof rows[number]) => !r.skip !== off.has(r.item.id)
  const texts = rows.filter(included).map(r => r.text)
  const toggle = (id: string) => setOff(s => {
    const next = new Set(s)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  if (rows.length === 0) return null

  return (
    <section className="card overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <span className="w-9 h-9 rounded-full bg-canvas text-ink-soft flex items-center justify-center shrink-0">
          <ListChecks className="w-[18px] h-[18px]" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[15px] font-semibold">Handla i butik med ICA-appen</span>
          <span className="block text-[12.5px] text-ink-muted">Skicka {texts.length} varor till en inköpslista i ICA-appen</span>
        </span>
        <ChevronDown className={`w-5 h-5 text-ink-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatedDiv>
        {open && (
          <div className="px-4 pb-4 space-y-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="ica-list-name" className="field-label">Listans namn</label>
              <input id="ica-list-name" value={name} onChange={e => setName(e.target.value)} className="field" />
              <p className="text-xs text-ink-faint">Finns en lista med samma namn läggs bara de varor till som saknas där.</p>
            </div>
            <div className="max-h-80 overflow-y-auto divide-y divide-line-soft border border-line-soft rounded-xl">
              {rows.map(r => (
                <label key={r.item.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer">
                  <input type="checkbox" checked={included(r)} onChange={() => toggle(r.item.id)} className="accent-brand-600" />
                  <span className={`flex-1 text-sm ${included(r) ? 'text-ink' : 'text-ink-faint'}`}>{r.text}</span>
                  {r.skip && <span className="text-[11px] text-ink-faint">{pantry.has(r.item.name.toLowerCase()) ? 'har hemma' : 'inte en vara'}</span>}
                </label>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {texts.length > 0 && name.trim() ? (
                <a
                  href={icaListHandoffUrl(name.trim(), texts)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setSent(true)}
                  className="h-10 px-4 rounded-full bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold inline-flex items-center"
                >
                  Öppna ica.se och fyll listan
                </a>
              ) : (
                <button disabled className="h-10 px-4 rounded-full bg-brand-600 opacity-50 text-white text-sm font-semibold">
                  Öppna ica.se och fyll listan
                </button>
              )}
              <button
                onClick={async () => { await navigator.clipboard.writeText(icaListClaudePrompt(name.trim(), texts)); setCopied(true); setSent(true) }}
                disabled={texts.length === 0 || !name.trim()}
                className="h-10 px-4 rounded-full bg-canvas hover:bg-line disabled:opacity-50 text-sm font-medium"
              >
                {copied ? '✓ Kopierat' : 'Kopiera till Claude'}
              </button>
            </div>
            <BookmarkletHelp sent={sent ? 'list' : null} site="ica.se" storeName="ica.se" what={`listan "${name.trim()}"`} />
          </div>
        )}
      </AnimatedDiv>
    </section>
  )
}
