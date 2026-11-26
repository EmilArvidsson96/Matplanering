import { useEffect, useMemo, useRef, useState } from 'react'
import Modal from '../common/Modal'
import { useSettingsStore } from '../../store/settingsStore'
import type { ShoppingItem } from '../../types'
import { icaListHandoffUrl, icaListClaudePrompt } from '../../api/ica'
import { STORE_BOOKMARKLET } from '../../api/shops'
import { categoryKey, CATEGORY_ORDER } from '../../data/categories'
import { isNotAProduct } from '../../utils/productMatch'

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
 * Send the shopping list to the ICA app as free-text rows. ICA sorts them into
 * departments itself. A list with the same name gets the missing rows added.
 */
export default function IcaListModal({ items, defaultName, onClose }: {
  items: ShoppingItem[]
  defaultName: string
  onClose: () => void
}) {
  const { settings } = useSettingsStore()
  const pantry = useMemo(() => new Set(settings.pantryItems.map(p => p.toLowerCase())), [settings.pantryItems])
  const rows = useMemo(() => [...items]
    .sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category))
    .map(item => ({
      item,
      text: icaRowText(item),
      skip: isNotAProduct(item.name, item.amount, item.unit) || pantry.has(item.name.toLowerCase()),
    })), [items, pantry])
  const [included, setIncluded] = useState<Set<string>>(() => new Set(rows.filter(r => !r.skip).map(r => r.item.id)))
  const [name, setName] = useState(defaultName)
  const [sent, setSent] = useState(false)
  const [copied, setCopied] = useState(false)
  const bmRef = useRef<HTMLAnchorElement>(null)
  useEffect(() => { bmRef.current?.setAttribute('href', STORE_BOOKMARKLET) }, [])

  const texts = rows.filter(r => included.has(r.item.id)).map(r => r.text)
  const toggle = (id: string) => setIncluded(s => {
    const next = new Set(s)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  return (
    <Modal
      title="Till ICA-listan"
      onClose={onClose}
      wide
      footer={
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-ink-soft mr-auto font-semibold">{texts.length} varor</span>
            <button
              onClick={async () => { await navigator.clipboard.writeText(icaListClaudePrompt(name.trim(), texts)); setCopied(true); setSent(true) }}
              disabled={texts.length === 0 || !name.trim()}
              className="border border-violet-200 text-violet-600 hover:bg-violet-50 disabled:opacity-50 px-3 py-2 rounded-full text-sm font-medium"
            >
              {copied ? '✓ Kopierat' : 'Kopiera till Claude'}
            </button>
            <button
              onClick={() => { window.open(icaListHandoffUrl(name.trim(), texts), '_blank'); setSent(true) }}
              disabled={texts.length === 0 || !name.trim()}
              className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-4 py-2 rounded-full text-sm font-medium"
            >
              Öppna ica.se och fyll listan
            </button>
          </div>
          <div className={`text-xs rounded-xl px-3 py-2 ${sent ? 'bg-brand-50 text-brand-800' : 'bg-canvas text-ink-muted'}`}>
            {sent && <p className="font-medium mb-1">ica.se öppnades i en ny flik. Klicka där på bokmärket nedan så hamnar varorna i listan.</p>}
            <p>
              Första gången: dra{' '}
              <a
                ref={bmRef}
                onClick={e => e.preventDefault()}
                className="inline-block bg-white border border-brand-300 text-brand-700 font-medium rounded-lg px-2 py-0.5 mx-0.5 cursor-move"
                title="Dra till bokmärkesfältet"
              >
                Matplanering: fyll
              </a>{' '}
              till bokmärkesfältet. Du behöver vara inloggad på ica.se.
            </p>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="ica-list-name" className="field-label">Listans namn</label>
          <input id="ica-list-name" value={name} onChange={e => setName(e.target.value)} className="field" />
          <p className="text-xs text-ink-faint">Finns en lista med samma namn läggs bara de varor till som saknas där.</p>
        </div>
        <div className="divide-y divide-line-soft border border-line-soft rounded-xl">
          {rows.map(({ item, text, skip }) => (
            <label key={item.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer">
              <input
                type="checkbox"
                checked={included.has(item.id)}
                onChange={() => toggle(item.id)}
                className="accent-brand-600"
              />
              <span className={`flex-1 text-sm ${included.has(item.id) ? 'text-ink' : 'text-ink-faint'}`}>{text}</span>
              {skip && <span className="text-[11px] text-ink-faint">{pantry.has(item.name.toLowerCase()) ? 'har hemma' : 'inte en vara'}</span>}
            </label>
          ))}
        </div>
      </div>
    </Modal>
  )
}
