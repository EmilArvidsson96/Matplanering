import { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLibraryStore } from '../../store/libraryStore'
import { useWeekStore } from '../../store/weekStore'
import { useGameStore } from '../../store/gameStore'
import { dishPopularity, dishLastCooked } from '../../utils/weekUtils'
import { computeCompleteness } from '../../utils/recipeCompleteness'
import DishEditor from './DishEditor'
import DishImage from '../common/DishImage'
import { Search, Plus, SlidersHorizontal, ArrowUpDown, Download, Link2 } from 'lucide-react'
import type { Dish, Protein, Carb, Cuisine, DishType, Tag, SortOrder } from '../../types'

const PROTEIN_LABELS: Record<Protein, string> = {
  kyckling: 'Kyckling', nöt: 'Nöt', fläsk: 'Fläsk', fisk: 'Fisk',
  skaldjur: 'Skaldjur', lamm: 'Lamm', vilt: 'Vilt',
  vegetarisk: 'Vegetarisk', vegan: 'Vegan',
}
const CARB_LABELS: Record<Carb, string> = {
  ris: 'Ris', pasta: 'Pasta', potatis: 'Potatis', nudlar: 'Nudlar', bröd: 'Bröd', ingen: 'Lågkolhydrat',
}
const CUISINE_LABELS: Record<Cuisine, string> = {
  svensk: 'Svensk', italiensk: 'Italiensk', asiatisk: 'Asiatisk', japansk: 'Japansk',
  koreansk: 'Koreansk', indisk: 'Indisk', mellanöstern: 'Mellanöstern',
  mexikansk: 'Mexikansk', fransk: 'Fransk', nordafrikansk: 'Nordafrikansk', övrigt: 'Övrigt',
}
const TYPE_LABELS: Record<DishType, string> = {
  soppa: 'Soppa', sallad: 'Sallad', paj: 'Paj', gryta: 'Gryta', grillat: 'Grillat',
  bowl: 'Bowl', burgare: 'Burgare', taco: 'Taco', wrap: 'Wrap', pizza: 'Pizza',
  pasta: 'Pasta', curry: 'Curry', risotto: 'Risotto',
  omelett: 'Omelett', smörgås: 'Smörgås', wok: 'Wok', sushi: 'Sushi', köttbit: 'Köttbit',
}
const TAG_LABELS: Record<Tag, string> = {
  snabb: 'Snabb', festlig: 'Festlig', barnvänlig: 'Barnvänlig',
  lowfodmap: 'Low FODMAP', lchf: 'LCHF', stark: 'Stark', lågfett: 'Låg fetthalt',
}

export default function LibraryPage() {
  const { dishes } = useLibraryStore()
  const weeks = Object.values(useWeekStore().weeks)

  const [search, setSearch]   = useState('')
  const [proteins, setProteins] = useState<Set<Protein>>(new Set())
  const [carbs, setCarbs]     = useState<Set<Carb>>(new Set())
  const [cuisines, setCuisines] = useState<Set<Cuisine>>(new Set())
  const [types, setTypes]     = useState<Set<DishType>>(new Set())
  const [tags, setTags]       = useState<Set<Tag>>(new Set())
  const [sort, setSort]       = useState<SortOrder>('alfabetisk')
  const [editing, setEditing] = useState<Dish | 'new' | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const gameMode = useGameStore(s => s.data.gameMode)

  // Open editor from /bibliotek?edit=<dishId>
  useEffect(() => {
    const editId = searchParams.get('edit')
    if (!editId) return
    const dish = dishes.find(d => d.id === editId)
    if (dish) {
      setEditing(dish)
      searchParams.delete('edit')
      setSearchParams(searchParams, { replace: true })
    }
  }, [searchParams, dishes, setSearchParams])

  const today = new Date().toISOString().slice(0, 10)

  const filtered = useMemo(() => {
    let list = dishes.filter(d => {
      if (search && !d.name.toLowerCase().includes(search.toLowerCase())) return false
      if (proteins.size && !d.protein.some(p => proteins.has(p))) return false
      if (carbs.size    && !d.carb.some(c => carbs.has(c)))       return false
      if (cuisines.size && !cuisines.has(d.cuisine))              return false
      if (types.size    && !d.type.some(t => types.has(t)))       return false
      if (tags.size     && !d.tags.some(t => tags.has(t)))        return false
      return true
    })

    return [...list].sort((a, b) => {
      if (sort === 'alfabetisk')  return a.name.localeCompare(b.name, 'sv')
      if (sort === 'popularitet') return dishPopularity(b.id, weeks) - dishPopularity(a.id, weeks)
      // säsong
      const todayDoy = dayOfYear(today)
      const la = dishLastCooked(a.id, weeks)
      const lb = dishLastCooked(b.id, weeks)
      const pa = la ? Math.abs(dayOfYear(la) - todayDoy) : 999
      const pb = lb ? Math.abs(dayOfYear(lb) - todayDoy) : 999
      return pa - pb
    })
  }, [dishes, search, proteins, carbs, cuisines, types, tags, sort, weeks, today])

  function toggle<T>(set: Set<T>, v: T): Set<T> {
    const n = new Set(set); n.has(v) ? n.delete(v) : n.add(v); return n
  }

  function exportLibrary() {
    const data = JSON.stringify({ dishes }, null, 2)
    const url  = URL.createObjectURL(new Blob([data], { type: 'application/json' }))
    const a    = Object.assign(document.createElement('a'), { href: url, download: 'library.json' })
    a.click(); URL.revokeObjectURL(url)
  }

  const activeFilters = proteins.size + carbs.size + cuisines.size + types.size + tags.size

  const clearFilters = () => { setProteins(new Set()); setCarbs(new Set()); setCuisines(new Set()); setTypes(new Set()); setTags(new Set()) }
  const QUICK_PROTEINS: Protein[] = ['vegetarisk', 'fisk', 'kyckling', 'nöt', 'fläsk']

  return (
    <div className="space-y-4">
      {/* Search + new */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-ink-muted" />
          <input
            type="text"
            aria-label="Sök rätt"
            placeholder="Sök rätt…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="field rounded-full pl-11"
          />
        </div>
        <button onClick={() => setEditing('new')} className="h-12 px-4 rounded-full bg-ink text-white text-sm font-semibold flex items-center gap-1.5 shrink-0 hover:bg-ink-soft">
          <Plus className="w-4 h-4" strokeWidth={2.5} /> Ny rätt
        </button>
      </div>

      {/* Quick filters */}
      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap pb-0.5 [scrollbar-width:none]">
        <button
          onClick={() => setShowFilters(v => !v)}
          aria-expanded={showFilters}
          className={`chip shrink-0 font-medium ${activeFilters > 0 ? 'chip-on' : 'chip-off'}`}
        >
          <SlidersHorizontal className="w-4 h-4" /> Filter{activeFilters > 0 && ` · ${activeFilters}`}
        </button>
        <label className="chip chip-off shrink-0 font-medium pr-2 relative">
          <ArrowUpDown className="w-4 h-4" />
          <select
            aria-label="Sortering"
            value={sort}
            onChange={e => setSort(e.target.value as SortOrder)}
            className="bg-transparent appearance-none pr-1 focus:outline-none cursor-pointer"
          >
            <option value="alfabetisk">A–Ö</option>
            <option value="popularitet">Populärast</option>
            <option value="säsong">Säsong</option>
          </select>
        </label>
        <span className="w-px bg-line shrink-0 my-2" />
        {QUICK_PROTEINS.map(p => (
          <button
            key={p}
            onClick={() => setProteins(toggle(proteins, p))}
            aria-pressed={proteins.has(p)}
            className={`chip shrink-0 ${proteins.has(p) ? 'chip-on' : 'chip-off'}`}
          >
            {PROTEIN_LABELS[p]}
          </button>
        ))}
      </div>

      {/* Filters: expand inline under the chips (no popup) */}
      {showFilters && (
        <section aria-label="Filter" className="card p-4 md:p-5 space-y-5 motion-safe:animate-fade-up">
          <FilterRow label="Protein" items={PROTEIN_LABELS} active={proteins} onToggle={p => setProteins(toggle(proteins, p as Protein))} />
          <FilterRow label="Kolhydrat" items={CARB_LABELS} active={carbs} onToggle={c => setCarbs(toggle(carbs, c as Carb))} />
          <FilterRow label="Kök" items={CUISINE_LABELS} active={cuisines} onToggle={c => setCuisines(toggle(cuisines, c as Cuisine))} />
          <FilterRow label="Typ" items={TYPE_LABELS} active={types} onToggle={t => setTypes(toggle(types, t as DishType))} />
          <FilterRow label="Taggar" items={TAG_LABELS} active={tags} onToggle={t => setTags(toggle(tags, t as Tag))} />
          <div className="flex gap-2.5 pt-1">
            <button onClick={clearFilters} disabled={activeFilters === 0} className="btn-secondary flex-1 sm:flex-none">Rensa</button>
            <button onClick={() => setShowFilters(false)} className="btn-primary flex-[2] sm:flex-none">Dölj filter</button>
          </div>
        </section>
      )}

      {/* Count */}
      <p className="text-[13px] text-ink-muted px-1">
        {filtered.length === dishes.length ? `${dishes.length} ${dishes.length === 1 ? 'rätt' : 'rätter'}` : `${filtered.length} av ${dishes.length} rätter`}
      </p>

      {/* Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {filtered.map(dish => (
          <DishCard
            key={dish.id}
            dish={dish}
            popularity={dishPopularity(dish.id, weeks)}
            lastCooked={dishLastCooked(dish.id, weeks)}
            showCompleteness={gameMode}
            onClick={() => setEditing(dish)}
          />
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full card px-6 py-10 text-center">
            <p className="text-[15px] font-semibold">Inga rätter hittades</p>
            <p className="text-sm text-ink-muted mt-1">
              {dishes.length === 0 ? 'Lägg till din första rätt med "Ny rätt".' : 'Prova en annan sökning eller rensa filtren.'}
            </p>
          </div>
        )}
      </div>

      <div className="flex justify-center pt-2">
        <button
          onClick={exportLibrary}
          className="h-10 px-4 rounded-full text-[13px] font-medium text-ink-muted hover:text-ink hover:bg-white flex items-center gap-1.5"
          title="Exportera bibliotek som JSON"
        >
          <Download className="w-4 h-4" /> Exportera bibliotek
        </button>
      </div>

      {editing && (
        <DishEditor
          dish={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

/** Soft tile colour per main protein (background, foreground). */
const TILE_COLORS: Partial<Record<Protein, [string, string]>> = {
  vegetarisk: ['#DDF3E4', '#0F4A2E'],
  vegan:      ['#E2EDD3', '#2F4A12'],
  fisk:       ['#DCE8F5', '#173A63'],
  skaldjur:   ['#D9EEF0', '#114B52'],
  kyckling:   ['#F6E0C8', '#6B3A0B'],
  nöt:        ['#FCE3D6', '#7A2E12'],
  fläsk:      ['#FBE1E4', '#7A1F2B'],
  lamm:       ['#EEE3F5', '#4B2463'],
  vilt:       ['#EAE4D8', '#4A3B1E'],
}

function DishCard({ dish, popularity, lastCooked, onClick, showCompleteness }: {
  dish: Dish; popularity: number; lastCooked: string | null; onClick: () => void; showCompleteness: boolean
}) {
  const c = showCompleteness ? computeCompleteness(dish) : null
  const [bg, fg] = TILE_COLORS[dish.protein[0]] ?? ['#EEEDE7', '#3D4046']
  const meta = [dish.type[0] ? TYPE_LABELS[dish.type[0]] : CUISINE_LABELS[dish.cuisine], lastCooked ? `lagad ${lastCooked.slice(0, 7)}` : null]
    .filter(Boolean).join(' · ')
  return (
    <button
      onClick={onClick}
      className="text-left card overflow-hidden flex flex-col hover:shadow-[0_6px_20px_rgba(21,23,26,0.08)] transition-shadow"
    >
      <div className="h-28 md:h-36 flex items-center justify-center relative overflow-hidden" style={{ background: bg, color: fg }}>
        <DishImage
          dish={dish}
          className="absolute inset-0 w-full h-full object-cover"
          fallback={<span className="font-display text-3xl font-extrabold opacity-85" aria-hidden="true">{dish.name.charAt(0).toUpperCase()}</span>}
        />
        {popularity > 0 && (
          <span className="absolute top-2 right-2 text-[11px] font-semibold bg-white/80 text-ink rounded-full px-1.5 py-0.5" title={`Lagad ${popularity} gånger`}>×{popularity}</span>
        )}
        {dish.recipeUrl && (
          <span className="absolute top-2 left-2 w-6 h-6 rounded-full bg-white/80 text-ink flex items-center justify-center">
            <Link2 className="w-3.5 h-3.5" aria-label="Har receptlänk" />
          </span>
        )}
      </div>
      <div className="p-3 pb-3.5 flex flex-col gap-1 flex-1">
        <h3 className="font-sans text-sm font-semibold leading-snug text-ink tracking-normal">{dish.name}</h3>
        {meta && <span className="text-xs text-ink-muted">{meta}</span>}
        {dish.tags.length > 0 && (
          <span className="flex flex-wrap gap-1 mt-0.5">
            {dish.tags.slice(0, 2).map(t => (
              <span key={t} className="text-[11px] bg-canvas text-ink-soft px-1.5 py-0.5 rounded-full">{TAG_LABELS[t]}</span>
            ))}
          </span>
        )}
        {c && (
          <div className="mt-1">
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="flex">
                {Array.from({length:5}).map((_, i) => (
                  <span key={i} style={{ color: i < c.stars ? '#facc15' : '#e5e7eb' }}>★</span>
                ))}
              </span>
              {c.pct < 100 ? (
                <span className="text-pink-700 font-semibold">+{c.totalWorth} p</span>
              ) : (
                <span className="text-brand-700 font-semibold">✓ Komplett</span>
              )}
            </div>
            <div className="h-1 w-full bg-line-soft rounded-full overflow-hidden mt-1">
              <div className="h-full bg-gradient-to-r from-pink-400 to-purple-500 transition-all" style={{ width: `${c.pct}%` }} />
            </div>
          </div>
        )}
      </div>
    </button>
  )
}

function FilterRow<T extends string>({
  label, items, active, onToggle,
}: { label: string; items: Record<string, string>; active: Set<T>; onToggle: (v: string) => void }) {
  return (
    <div>
      <p className="field-label">{label}</p>
      <div className="flex flex-wrap gap-2">
        {(Object.entries(items) as [T, string][]).map(([key, lbl]) => (
          <button
            key={key}
            onClick={() => onToggle(key)}
            aria-pressed={active.has(key)}
            className={`chip ${active.has(key) ? 'chip-on' : 'chip-off'}`}
          >
            {lbl}
          </button>
        ))}
      </div>
    </div>
  )
}

function dayOfYear(dateStr: string): number {
  const d = new Date(dateStr)
  const start = new Date(d.getFullYear(), 0, 0)
  return Math.floor((d.getTime() - start.getTime()) / 86400000)
}
