import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { ShoppingItem } from '../../types'
import { restoreItem } from '../../store/shoppingActions'
import { useWeekStore } from '../../store/weekStore'
import { batch, notify } from '../../store/undoStore'

const REASON: Record<string, string> = {
  home: 'Har hemma',
  pantry: 'Alltid hemma',
  stock: 'I förrådet',
}

function when(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000)
  if (Date.now() - d.getTime() < 10 * 60_000) return 'nyss'
  if (days === 0) return 'i dag'
  if (days === 1) return 'i går'
  return `${days} dagar sedan`
}

export function removedItems(items: ShoppingItem[]): ShoppingItem[] {
  const at = (i: ShoppingItem) => i.deletedAt ?? i.excludedAt ?? ''
  return items.filter(i => i.deletedAt || i.isExcluded).sort((a, b) => at(b).localeCompare(at(a)))
}

/** "Borttagna denna vecka": everything taken off the list, restorable. */
export default function RemovedSection({ items, defaultOpen }: { items: ShoppingItem[]; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen)
  const removed = removedItems(items)
  if (removed.length === 0) return null

  function restoreAll() {
    const store = useWeekStore.getState()
    batch(() => removed.forEach(i => store.restoreShoppingItem(i.id)))
    notify(`${removed.length} varor tillbaka på listan`)
  }

  return (
    <section aria-labelledby="borttagna-rubrik" className="card overflow-hidden">
      <div className="flex items-center gap-2 pl-4 pr-1.5 py-1.5">
        <button
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          className="flex-1 min-w-0 flex items-center gap-2 text-left h-11"
        >
          <h2 id="borttagna-rubrik" className="flex-1 text-[15px] font-bold">Borttagna denna vecka ({removed.length})</h2>
          <ChevronDown className={`w-5 h-5 text-ink-muted transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && (
          <button onClick={restoreAll} className="h-9 px-2 text-[12.5px] font-semibold text-brand-700 shrink-0">Återställ alla</button>
        )}
      </div>
      {open && (
        <ul className="divide-y divide-line-soft border-t border-line-soft">
          {removed.map(i => (
            <li key={i.id} className="flex items-center gap-2 pl-4 pr-2 py-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-ink-muted line-through truncate">{i.name}</p>
                <p className="text-[11.5px] text-ink-muted">
                  {i.deletedAt ? 'Borttagen' : REASON[i.excludedReason ?? 'home']}
                  {when(i.deletedAt ?? i.excludedAt) && ` · ${when(i.deletedAt ?? i.excludedAt)}`}
                </p>
              </div>
              <button onClick={() => restoreItem(i)} className="h-9 px-3 rounded-full bg-canvas hover:bg-line text-[12.5px] font-semibold shrink-0">
                Återställ
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
