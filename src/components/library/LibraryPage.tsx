import { useState, useMemo } from 'react'
import { useLibraryStore } from '../../store/libraryStore'
import { useWeekStore } from '../../store/weekStore'
import { dishPopularity, dishLastCooked } from '../../utils/weekUtils'
import DishEditor from './DishEditor'
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
}
const TAG_LABELS: Record<Tag, string> = {
  snabb: 'Snabb', festlig: 'Festlig', barnvänlig: 'Barnvänlig',
  lowfodmap: 'Low FODMAP', lchf: 'LCHF', stark: 'Stark',
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

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="text"
          placeholder="Sök rätt…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
        />
        <select
          value={sort}
          onChange={e => setSort(e.target.value as SortOrder)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
        >
          <option value="alfabetisk">A–Ö</option>
          <option value="popularitet">Populärast</option>
          <option value="säsong">Säsong</option>
        </select>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`px-3 py-2 rounded-xl border text-sm font-medium transition-colors
            ${showFilters || activeFilters > 0 ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
        >
          Filter {activeFilters > 0 && `(${activeFilters})`}
        </button>
        <button
          onClick={() => setEditing('new')}
          className="bg-brand-600 hover:bg-brand-700 text-white px-3 py-2 rounded-xl text-sm font-medium"
        >
          + Ny rätt
        </button>
        <button
          onClick={exportLibrary}
          className="border border-gray-200 hover:bg-gray-50 text-gray-600 px-3 py-2 rounded-xl text-sm"
          title="Exportera bibliotek som JSON"
        >
          ↓ Exportera
        </button>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
          <FilterRow label="Protein" items={PROTEIN_LABELS} active={proteins} onToggle={p => setProteins(toggle(proteins, p as Protein))} />
          <FilterRow label="Kolhydrat" items={CARB_LABELS} active={carbs} onToggle={c => setCarbs(toggle(carbs, c as Carb))} />
          <FilterRow label="Kök" items={CUISINE_LABELS} active={cuisines} onToggle={c => setCuisines(toggle(cuisines, c as Cuisine))} />
          <FilterRow label="Typ" items={TYPE_LABELS} active={types} onToggle={t => setTypes(toggle(types, t as DishType))} />
          <FilterRow label="Taggar" items={TAG_LABELS} active={tags} onToggle={t => setTags(toggle(tags, t as Tag))} />
          {activeFilters > 0 && (
            <button
              onClick={() => { setProteins(new Set()); setCarbs(new Set()); setCuisines(new Set()); setTypes(new Set()); setTags(new Set()) }}
              className="text-xs text-red-400 hover:text-red-600"
            >
              Rensa filter
            </button>
          )}
        </div>
      )}

      {/* Count */}
      <p className="text-xs text-gray-400">{filtered.length} av {dishes.length} rätter</p>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map(dish => (
          <DishCard
            key={dish.id}
            dish={dish}
            popularity={dishPopularity(dish.id, weeks)}
            lastCooked={dishLastCooked(dish.id, weeks)}
            onClick={() => setEditing(dish)}
          />
        ))}
        {filtered.length === 0 && (
          <p className="col-span-full text-sm text-gray-400 py-8 text-center">
            Inga rätter matchar sökning/filter.
          </p>
        )}
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

function DishCard({ dish, popularity, lastCooked, onClick }: {
  dish: Dish; popularity: number; lastCooked: string | null; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="text-left bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:border-brand-200 hover:shadow-md transition-all"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-sm text-gray-800 leading-snug">{dish.name}</h3>
        {popularity > 0 && (
          <span className="text-xs text-gray-300 shrink-0 mt-0.5">×{popularity}</span>
        )}
      </div>
      <div className="flex flex-wrap gap-1 mt-2">
        {dish.protein.map(p => (
          <span key={p} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
            {PROTEIN_LABELS[p]}
          </span>
        ))}
        {dish.carb.length > 0 && (
          <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full">
            {dish.carb.map(c => CARB_LABELS[c]).join(' + ')}
          </span>
        )}
        {dish.tags.map(t => (
          <span key={t} className="text-xs bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded-full">
            {TAG_LABELS[t]}
          </span>
        ))}
      </div>
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-gray-400">{CUISINE_LABELS[dish.cuisine]}</span>
        {lastCooked && (
          <span className="text-xs text-gray-300">{lastCooked.slice(0, 7)}</span>
        )}
      </div>
      {dish.recipeUrl && (
        <span className="text-xs text-brand-500 mt-1 block">🔗 Recept</span>
      )}
    </button>
  )
}

function FilterRow<T extends string>({
  label, items, active, onToggle,
}: { label: string; items: Record<string, string>; active: Set<T>; onToggle: (v: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-gray-400 w-20 shrink-0">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {(Object.entries(items) as [T, string][]).map(([key, lbl]) => (
          <button
            key={key}
            onClick={() => onToggle(key)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors font-medium
              ${active.has(key)
                ? 'bg-brand-600 text-white border-brand-600'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
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
