import { useState } from 'react'
import { useSettingsStore } from '../../store/settingsStore'

export default function SettingsPage() {
  const { settings, update, addPantryItem, removePantryItem } = useSettingsStore()
  const [newPantry, setNewPantry] = useState('')

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
