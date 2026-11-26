import { useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShoppingCart, ListChecks, ChevronRight, Check } from 'lucide-react'
import Modal, { type ModalHandle } from '../common/Modal'
import { useSettingsStore } from '../../store/settingsStore'
import { DEFAULT_ICA_STORE } from '../../api/ica'
import type { ShopId } from '../../types'

export type ShopChoice = ShopId | 'ica-list'

/** "Var vill du handla?" — pick the store for the cart, or send the list to the ICA app. */
export default function ShopPickerModal({ onPick, onClose }: {
  onPick: (choice: ShopChoice) => void
  onClose: () => void
}) {
  const ref = useRef<ModalHandle>(null)
  const navigate = useNavigate()
  const { settings } = useSettingsStore()
  const ica = settings.icaStore ?? DEFAULT_ICA_STORE
  const preferred = settings.preferredShop ?? 'ica'
  const pick = (c: ShopChoice) => {
    if (ref.current) ref.current.close(() => onPick(c))
    else onPick(c)
  }

  const Card = ({ id, title, sub, icon }: { id: ShopChoice; title: string; sub: string; icon: React.ReactNode }) => (
    <button
      onClick={() => pick(id)}
      className={`w-full flex items-center gap-3 text-left rounded-2xl border px-4 py-3 hover:bg-canvas transition-colors ${
        id === preferred ? 'border-brand-600 ring-1 ring-brand-600' : 'border-line'}`}
    >
      <span className="w-10 h-10 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center shrink-0">{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] font-semibold text-ink">{title}</span>
        <span className="block text-xs text-ink-muted">{sub}</span>
      </span>
      {id === preferred ? <Check className="w-4 h-4 text-brand-600" /> : <ChevronRight className="w-4 h-4 text-ink-faint" />}
    </button>
  )

  return (
    <Modal ref={ref} title="Var vill du handla?" onClose={onClose}>
      <div className="space-y-5">
        <section className="space-y-2">
          <h3 className="eyebrow px-1">Fyll kundkorg</h3>
          <Card id="ica" title={ica.name} sub="ICA Handla · hemleverans eller hämta i butik" icon={<ShoppingCart className="w-5 h-5" />} />
          <Card id="mathem" title="Mathem" sub="Hemleverans" icon={<ShoppingCart className="w-5 h-5" />} />
          <button
            onClick={() => ref.current?.close(() => navigate('/inst'))}
            className="text-xs text-ink-muted hover:text-ink px-1"
          >
            Byt ICA-butik under Inställningar → Handla online
          </button>
        </section>
        <section className="space-y-2">
          <h3 className="eyebrow px-1">Inköpslista</h3>
          <Card id="ica-list" title="ICA-appen" sub="Skicka listan, sorterad efter avdelning" icon={<ListChecks className="w-5 h-5" />} />
        </section>
        <p className="text-xs text-ink-faint px-1">
          Byt butik i granskningen för att jämföra totalpris. Ordern lägger du alltid själv hos butiken.
        </p>
      </div>
    </Modal>
  )
}
