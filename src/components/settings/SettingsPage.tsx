import { useState } from 'react'
import { useSettingsStore } from '../../store/settingsStore'
import { DEFAULT_CONVERSIONS } from '../../utils/unitConversions'
import type { AiModel } from '../../types'

export default function SettingsPage() {
  const { settings, update, addPantryItem, removePantryItem, addUnitConversion, removeUnitConversion } = useSettingsStore()
  const [newPantry, setNewPantry] = useState('')
  const [newUnit, setNewUnit] = useState('')
  const [newHint, setNewHint] = useState('')
  const [newGrams, setNewGrams] = useState('')
  const [showDefaultConversions, setShowDefaultConversions] = useState(false)

  function addConversion() {
    const g = parseFloat(newGrams)
    if (!newUnit.trim() || isNaN(g) || g <= 0) return
    addUnitConversion({
      fromUnit: newUnit.trim(),
      ingredientHint: newHint.trim() || undefined,
      toGrams: g,
    })
    setNewUnit('')
    setNewHint('')
    setNewGrams('')
  }

  function addItem() {
    if (!newPantry.trim()) return
    addPantryItem(newPantry.trim())
    setNewPantry('')
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Household */}
      <section className="bg-white rounded-2xl p-5 shadow-sm">
        <h2 className="font-semibold text-gray-700 mb-4">Hushåll</h2>
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-600 flex-1">
            Standard antal portioner per måltid
          </label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => update({ defaultHouseholdSize: Math.max(1, settings.defaultHouseholdSize - 1) })}
              className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 font-bold text-lg leading-none flex items-center justify-center"
            >−</button>
            <span className="w-6 text-center font-semibold">{settings.defaultHouseholdSize}</span>
            <button
              onClick={() => update({ defaultHouseholdSize: settings.defaultHouseholdSize + 1 })}
              className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 font-bold text-lg leading-none flex items-center justify-center"
            >+</button>
          </div>
        </div>
      </section>

      {/* Budget */}
      <section className="bg-white rounded-2xl p-5 shadow-sm">
        <h2 className="font-semibold text-gray-700 mb-4">Budget</h2>
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-600 flex-1">
            Estimerad kostnad per portion (kr)
          </label>
          <input
            type="number"
            value={settings.costPerPortion}
            onChange={e => update({ costPerPortion: Number(e.target.value) })}
            className="w-20 border border-gray-200 rounded-xl px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-brand-300"
          />
        </div>
      </section>

      {/* Pantry */}
      <section className="bg-white rounded-2xl p-5 shadow-sm">
        <h2 className="font-semibold text-gray-700 mb-1">Skafferi (alltid hemma)</h2>
        <p className="text-xs text-gray-400 mb-4">
          Ingredienser som alltid finns hemma och aldrig läggs till i inköpslistan automatiskt.
        </p>
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            placeholder="T.ex. salt, olivolja…"
            value={newPantry}
            onChange={e => setNewPantry(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addItem()}
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
          />
          <button
            onClick={addItem}
            className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-xl text-sm font-medium"
          >
            Lägg till
          </button>
        </div>
        {settings.pantryItems.length === 0 ? (
          <p className="text-xs text-gray-300 italic">Inga varor i skafferiet än.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {settings.pantryItems.map(item => (
              <span
                key={item}
                className="flex items-center gap-1.5 bg-gray-100 text-gray-700 text-sm px-3 py-1 rounded-full"
              >
                {item}
                <button
                  onClick={() => removePantryItem(item)}
                  className="text-gray-400 hover:text-red-400 text-xs leading-none"
                >✕</button>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Unit conversions */}
      <section className="bg-white rounded-2xl p-5 shadow-sm">
        <h2 className="font-semibold text-gray-700 mb-1">Enhetsomvandlare</h2>
        <p className="text-xs text-gray-400 mb-4">
          Används för att slå ihop ingredienser med olika enheter i inköpslistan.
          Lägg till egna regler som gäller specifika ingredienser, t.ex. hur mycket ett dl mjöl väger.
        </p>

        {/* Custom conversions */}
        <div className="flex flex-wrap gap-2 mb-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Enhet</label>
            <input
              type="text"
              placeholder="t.ex. dl"
              value={newUnit}
              onChange={e => setNewUnit(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addConversion()}
              className="w-24 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Ingrediens (valfritt)</label>
            <input
              type="text"
              placeholder="t.ex. mjöl"
              value={newHint}
              onChange={e => setNewHint(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addConversion()}
              className="w-32 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Gram per enhet</label>
            <input
              type="number"
              placeholder="t.ex. 60"
              value={newGrams}
              onChange={e => setNewGrams(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addConversion()}
              className="w-28 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
            />
          </div>
          <button
            onClick={addConversion}
            className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-xl text-sm font-medium"
          >
            Lägg till
          </button>
        </div>

        {settings.unitConversions.length === 0 ? (
          <p className="text-xs text-gray-300 italic mb-3">Inga egna regler än.</p>
        ) : (
          <div className="space-y-1 mb-3">
            {settings.unitConversions.map(conv => (
              <div key={conv.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2">
                <span className="text-sm text-gray-700">
                  1 {conv.fromUnit}
                  {conv.ingredientHint && (
                    <span className="text-gray-400"> ({conv.ingredientHint})</span>
                  )}
                  {' '}= {conv.toGrams} g
                </span>
                <button
                  onClick={() => removeUnitConversion(conv.id)}
                  className="text-gray-300 hover:text-red-400 text-xs ml-2"
                >✕</button>
              </div>
            ))}
          </div>
        )}

        {/* Collapsible default conversions */}
        <button
          onClick={() => setShowDefaultConversions(v => !v)}
          className="text-xs text-gray-400 hover:text-gray-600 underline"
        >
          {showDefaultConversions ? 'Dölj' : 'Visa'} inbyggda omvandlingsregler
        </button>
        {showDefaultConversions && (
          <div className="mt-2 space-y-1 max-h-64 overflow-y-auto">
            {DEFAULT_CONVERSIONS.map(conv => (
              <div key={conv.id} className="text-xs text-gray-400 px-2 py-1 bg-gray-50 rounded-lg">
                1 {conv.fromUnit}
                {conv.ingredientHint && (
                  <span className="text-gray-300"> ({conv.ingredientHint})</span>
                )}
                {' '}= {conv.toGrams} g
              </div>
            ))}
          </div>
        )}
      </section>

      {/* AI assistant */}
      <section className="bg-white rounded-2xl p-5 shadow-sm">
        <h2 className="font-semibold text-gray-700 mb-1">AI-assistent</h2>
        <p className="text-xs text-gray-400 mb-4">
          Används för att städa inköpslistan: slå ihop varor, kategorisera "Övrigt" och översätta engelska namn.
        </p>
        <div className="space-y-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Anthropic API-nyckel</label>
            <input
              type="password"
              placeholder="sk-ant-…"
              value={settings.anthropicApiKey ?? ''}
              onChange={e => update({ anthropicApiKey: e.target.value })}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-600 flex-1">Modell</label>
            <select
              value={settings.aiModel ?? 'haiku'}
              onChange={e => update({ aiModel: e.target.value as AiModel })}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-300"
            >
              <option value="haiku">Haiku (snabb, billig)</option>
              <option value="sonnet">Sonnet (balanserad)</option>
              <option value="opus">Opus (mest kapabel)</option>
            </select>
          </div>
        </div>
      </section>

      {/* Info */}
      <section className="bg-white rounded-2xl p-5 shadow-sm">
        <h2 className="font-semibold text-gray-700 mb-3">Om appen</h2>
        <div className="space-y-1 text-sm text-gray-500">
          <p>Data sparas i GitHub-repot <code className="bg-gray-100 px-1 rounded">EmilArvidsson96/matplanering-data</code>.</p>
          <p>Automatisk sparning sker 5 sekunder efter senaste ändring.</p>
        </div>
      </section>
    </div>
  )
}
