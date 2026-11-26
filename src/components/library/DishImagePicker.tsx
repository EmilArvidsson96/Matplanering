import { useState } from 'react'
import { Check, ImageOff, Link2, RefreshCw, Sparkles } from 'lucide-react'
import type { Dish } from '../../types'
import { autoImageKey, pickDishImage } from '../../utils/dishImage'

interface Props {
  /** Current form values (name/link may be unsaved). */
  form: Pick<Dish, 'name' | 'recipeUrl' | 'imageUrl'>
  /** The saved dish, for its automatic picture. */
  dish: Dish | null
  onChange: (imageUrl: string | undefined) => void
}

/** Picture section of the dish editor: automatic pick, alternatives, own link. */
export default function DishImagePicker({ form, dish, onChange }: Props) {
  const auto = dish?.autoImage
  const autoValid = !!auto?.url && auto.key === autoImageKey(form)
  const own = form.imageUrl?.trim() || ''
  const shown = own || (autoValid ? auto!.url : '')

  const [searched, setSearched] = useState<string[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  const [linkOpen, setLinkOpen] = useState(false)
  const [link, setLink] = useState('')
  const [broken, setBroken] = useState<Set<string>>(new Set())

  const options = [...new Set([
    ...(autoValid ? [auto!.url, ...(auto!.alternatives ?? [])] : []),
    ...(searched ?? []),
  ])].filter(u => !broken.has(u))

  async function search() {
    if (!form.name.trim()) return
    setSearching(true)
    setError('')
    try {
      const pick = await pickDishImage(form, 9)
      if (!pick) setError('Hittade inga bilder.')
      setSearched(pick ? [pick.url, ...pick.alternatives] : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bildsökningen misslyckades.')
    } finally {
      setSearching(false)
    }
  }

  function choose(url: string) {
    // Choosing the automatic pick = no own choice (it then follows name/link changes).
    onChange(autoValid && url === auto!.url ? undefined : url)
  }

  const caption = own
    ? 'Egen bild'
    : autoValid
      ? `Vald automatiskt ${auto!.source === 'recipe' ? 'från receptlänken' : 'via bildsökning'}`
      : auto && auto.key === autoImageKey(form) && !auto.url
        ? 'Ingen bild hittades automatiskt'
        : 'Väljs automatiskt när rätten sparats'

  const sourceHost = !own && autoValid && auto!.pageUrl ? hostOf(auto!.pageUrl) : null

  return (
    <div>
      <p className="field-label">Bild</p>
      <div className="flex gap-3.5 items-start">
        <div className="w-28 h-28 rounded-2xl bg-canvas overflow-hidden shrink-0 flex items-center justify-center text-ink-faint">
          {shown && !broken.has(shown)
            ? <img src={shown} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover"
                onError={() => setBroken(b => new Set(b).add(shown))} />
            : <ImageOff className="w-6 h-6" />}
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <p className="text-sm text-ink">{caption}</p>
          {sourceHost && (
            <a href={auto!.pageUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-ink-muted hover:text-brand-700 hover:underline block truncate">
              {sourceHost}
            </a>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={search} disabled={searching || !form.name.trim()} className="chip chip-off font-medium disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${searching ? 'animate-spin' : ''}`} /> {searching ? 'Söker…' : 'Fler bilder'}
            </button>
            <button type="button" onClick={() => setLinkOpen(v => !v)} className="chip chip-off font-medium">
              <Link2 className="w-4 h-4" /> Egen länk
            </button>
            {own && (
              <button type="button" onClick={() => onChange(undefined)} className="chip chip-off font-medium">
                <Sparkles className="w-4 h-4" /> Automatisk
              </button>
            )}
          </div>
        </div>
      </div>

      {linkOpen && (
        <form
          className="mt-3 flex gap-2"
          onSubmit={e => {
            e.preventDefault()
            const u = link.trim()
            if (/^https?:\/\//i.test(u)) { onChange(u.replace(/^http:/i, 'https:')); setLinkOpen(false); setLink('') }
          }}
        >
          <input
            type="url"
            aria-label="Bildlänk"
            value={link}
            onChange={e => setLink(e.target.value)}
            placeholder="Klistra in länk till en bild"
            className="field flex-1 min-w-0"
          />
          <button type="submit" disabled={!/^https?:\/\//i.test(link.trim())} className="btn-primary px-5 disabled:opacity-50">Använd</button>
        </form>
      )}

      {error && <p className="text-sm text-red-700 mt-2">{error}</p>}

      {options.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]" role="listbox" aria-label="Bildförslag">
          {options.map(u => {
            const selected = u === shown
            return (
              <button
                key={u}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => choose(u)}
                className={`relative w-20 h-20 rounded-xl overflow-hidden shrink-0 bg-canvas ${selected ? 'ring-2 ring-brand-600 ring-offset-2' : 'hover:opacity-90'}`}
              >
                <img src={u} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-cover"
                  onError={() => setBroken(b => new Set(b).add(u))} />
                {selected && (
                  <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-brand-600 text-white flex items-center justify-center">
                    <Check className="w-3 h-3" strokeWidth={3} />
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function hostOf(u: string): string {
  try { return new URL(u).hostname.replace(/^www\./, '') } catch { return u }
}
