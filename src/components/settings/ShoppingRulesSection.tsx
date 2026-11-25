import { useState } from 'react'
import { useSettingsStore } from '../../store/settingsStore'
import type { ShoppingRules } from '../../types'

const DEFAULT_RULES: ShoppingRules = {
  lactoseFree: false,
  preferSwedish: false,
  preferOffers: false,
  organicFor: '',
}

const TOGGLES: Array<{ key: 'lactoseFree' | 'preferSwedish' | 'preferOffers'; label: string; hint: string }> = [
  { key: 'lactoseFree', label: 'Allt laktosfritt', hint: 'Väljer laktosfri variant när den finns.' },
  { key: 'preferSwedish', label: 'Alltid svenskt', hint: 'Svenskt ursprung om det finns ett rimligt alternativ.' },
  { key: 'preferOffers', label: 'Prioritera extrapriser', hint: 'Föreslår byte till extrapris. Du godkänner varje byte.' },
]

/** Main rules + learned product choices for online grocery shopping. */
export default function ShoppingRulesSection() {
  const { settings, update, setProductPreferences } = useSettingsStore()
  const rules = { ...DEFAULT_RULES, ...settings.shoppingRules }
  const prefs = Object.entries(settings.productPreferences ?? {}).sort(([a], [b]) => a.localeCompare(b, 'sv'))
  const [showPrefs, setShowPrefs] = useState(false)

  const setRules = (patch: Partial<ShoppingRules>) => update({ shoppingRules: { ...rules, ...patch } })

  return (
    <section className="card p-5">
      <h2 className="font-display text-lg font-bold text-ink mb-1">Handla online (Mathem)</h2>
      <p className="text-xs text-ink-faint mb-4">
        Huvudregler som AI:n följer när den väljer produkter. De gäller före pris och tidigare val.
        Kräver API-nyckel under AI-assistent.
      </p>

      <div className="space-y-3">
        {TOGGLES.map(t => (
          <label key={t.key} className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={rules[t.key]}
              onChange={e => setRules({ [t.key]: e.target.checked })}
              className="mt-0.5 accent-brand-600"
            />
            <span>
              <span className="block text-sm text-ink-soft">{t.label}</span>
              <span className="block text-xs text-ink-faint">{t.hint}</span>
            </span>
          </label>
        ))}

        <div className="flex flex-col gap-1">
          <label className="text-sm text-ink-soft">Alltid ekologiskt för</label>
          <input
            value={rules.organicFor}
            onChange={e => setRules({ organicFor: e.target.value })}
            placeholder="t.ex. spannmål och spannmålsprodukter (pasta, mjöl, havregryn, ris, bröd)"
            className="field focus:outline-none focus:ring-2 focus:ring-brand-300"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm text-ink-soft">Övriga regler</label>
          <textarea
            value={settings.productRules ?? ''}
            onChange={e => update({ productRules: e.target.value })}
            rows={3}
            placeholder={'En regel per rad, t.ex.\nGarant hellre än dyrare märken\nSvensk kyckling, aldrig importerad'}
            className="field h-auto py-3"
          />
        </div>

        <div className="pt-2 border-t border-line-soft">
          <button onClick={() => setShowPrefs(s => !s)} className="text-sm text-ink-muted hover:text-ink">
            {showPrefs ? '▲' : '▼'} Inlärda produktval ({prefs.length})
          </button>
          {showPrefs && (
            prefs.length === 0 ? (
              <p className="text-xs text-ink-faint mt-2">
                Inga ännu. Varje gång du fyller korgen sparas vilka produkter ni valde.
              </p>
            ) : (
              <div className="mt-2 divide-y divide-line-soft max-h-80 overflow-y-auto">
                {prefs.map(([key, p]) => (
                  <div key={key} className="flex items-center gap-2 py-1.5">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-ink-soft">{key}</div>
                      <div className="text-xs text-ink-faint truncate">
                        {p.name} · {p.packSize} · vald {p.timesChosen} {p.timesChosen === 1 ? 'gång' : 'gånger'}
                      </div>
                    </div>
                    <button
                      onClick={() => setProductPreferences({ [key]: null })}
                      title="Glöm valet"
                      className="text-ink-faint hover:text-red-400 text-sm px-1"
                    >✕</button>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </section>
  )
}
