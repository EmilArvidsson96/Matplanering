import { useMemo, useRef, useState } from 'react'
import { useSettingsStore } from '../../store/settingsStore'
import { LEX_BY_NAME } from '../../data/ingredientLexicon'
import { calibrateFromReceipts } from '../../api/anthropic'
import type { CalibrationProposal, ReceiptImage } from '../../api/anthropic'
import { fileToReceiptImage } from '../../utils/receiptImage'
import type { AiModel } from '../../types'

export default function ReceiptCalibration() {
  const { settings, update, applyCostOverrides, removeCostOverride, clearCostOverrides } = useSettingsStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [images, setImages] = useState<ReceiptImage[]>([])
  const [fileNames, setFileNames] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [proposals, setProposals] = useState<CalibrationProposal[] | null>(null)
  const [selected, setSelected] = useState<Record<string, boolean>>({})

  const overrides = settings.costOverrides ?? {}
  const overrideEntries = useMemo(
    () => Object.entries(overrides).sort((a, b) => a[0].localeCompare(b[0], 'sv')),
    [overrides],
  )

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setError(null)
    try {
      const arr = Array.from(files)
      const converted = await Promise.all(arr.map(fileToReceiptImage))
      setImages(converted)
      setFileNames(arr.map(f => f.name))
      setProposals(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function analyze() {
    setLoading(true)
    setError(null)
    setProposals(null)
    try {
      const result = await calibrateFromReceipts(images, settings)
      setProposals(result)
      setSelected(Object.fromEntries(result.map(p => [p.name, true])))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  function applySelected() {
    if (!proposals) return
    const patch: Record<string, number> = {}
    for (const p of proposals) {
      if (selected[p.name]) patch[p.name] = p.newCostPerKg
    }
    if (Object.keys(patch).length > 0) applyCostOverrides(patch)
    setProposals(null)
    setImages([])
    setFileNames([])
    if (fileRef.current) fileRef.current.value = ''
  }

  const selectedCount = proposals ? proposals.filter(p => selected[p.name]).length : 0

  return (
    <section className="bg-white rounded-2xl p-5 shadow-sm">
      <h2 className="font-semibold text-gray-700 mb-1">Priskalibrering med kvitto</h2>
      <p className="text-xs text-gray-400 mb-4">
        Ladda upp foton på matkvitton så läser AI:n av priserna och justerar kostnadsuppskattningarna.
        Närliggande ingredienser kalibreras relativt (t.ex. oxbuljong följer kycklingbuljong, flankstek följer entrecôte).
      </p>

      <div className="space-y-3">
        {/* Model selector */}
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-600 flex-1">Modell för kalibrering</label>
          <select
            value={settings.calibrationModel ?? 'sonnet'}
            onChange={e => update({ calibrationModel: e.target.value as AiModel })}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-300"
          >
            <option value="haiku">Haiku (snabb, billig)</option>
            <option value="sonnet">Sonnet (rekommenderas)</option>
            <option value="opus">Opus (mest kapabel)</option>
          </select>
        </div>
        <p className="text-[11px] text-gray-400 -mt-1">
          Sonnet rekommenderas: bra på att läsa kvitton och resonera om relaterade priser, billigare än Opus.
        </p>

        {/* Upload */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            onChange={e => onFiles(e.target.files)}
            className="text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-medium file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
          />
          <button
            onClick={analyze}
            disabled={loading || images.length === 0}
            className="bg-brand-600 hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded-xl text-sm font-medium"
          >
            {loading ? 'Analyserar…' : 'Analysera kvitto'}
          </button>
        </div>
        {fileNames.length > 0 && (
          <p className="text-xs text-gray-400">{fileNames.length} bild(er): {fileNames.join(', ')}</p>
        )}

        {error && (
          <p className="text-sm text-red-500 bg-red-50 rounded-xl px-3 py-2">{error}</p>
        )}

        {/* Proposals */}
        {proposals && proposals.length === 0 && (
          <p className="text-sm text-gray-400 italic">Inga prisändringar föreslogs från kvittot.</p>
        )}
        {proposals && proposals.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-gray-500">Förslag — bocka av det du inte vill använda:</p>
            <div className="space-y-1 max-h-80 overflow-y-auto">
              {proposals.map(p => (
                <label
                  key={p.name}
                  className="flex items-start gap-2 bg-gray-50 rounded-xl px-3 py-2 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selected[p.name] ?? false}
                    onChange={e => setSelected(s => ({ ...s, [p.name]: e.target.checked }))}
                    className="mt-1"
                  />
                  <span className="flex-1 text-sm">
                    <span className="font-medium text-gray-800">{p.name}</span>
                    <span
                      className={`ml-2 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full ${
                        p.kind === 'direct'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {p.kind === 'direct' ? 'kvitto' : 'relaterad'}
                    </span>
                    <span className="block text-gray-600">
                      {Math.round(p.oldCostPerKg)} → <span className="font-semibold">{p.newCostPerKg}</span> kr/kg
                    </span>
                    {p.reason && <span className="block text-[11px] text-gray-400">{p.reason}</span>}
                  </span>
                </label>
              ))}
            </div>
            <button
              onClick={applySelected}
              disabled={selectedCount === 0}
              className="bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white px-4 py-2 rounded-xl text-sm font-medium"
            >
              Använd {selectedCount} prisändring(ar)
            </button>
          </div>
        )}

        {/* Current overrides */}
        <div className="pt-2 border-t border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-600">Kalibrerade priser</h3>
            {overrideEntries.length > 0 && (
              <button
                onClick={clearCostOverrides}
                className="text-xs text-gray-400 hover:text-red-400 underline"
              >
                Återställ alla
              </button>
            )}
          </div>
          {overrideEntries.length === 0 ? (
            <p className="text-xs text-gray-300 italic">Inga kalibrerade priser än — standardvärden används.</p>
          ) : (
            <div className="space-y-1">
              {overrideEntries.map(([name, cost]) => {
                const base = LEX_BY_NAME.get(name)?.costPerKg
                return (
                  <div key={name} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2">
                    <span className="text-sm text-gray-700">
                      {name}: <span className="font-semibold">{Math.round(cost)} kr/kg</span>
                      {base != null && base !== Math.round(cost) && (
                        <span className="text-gray-400"> (standard {base})</span>
                      )}
                    </span>
                    <button
                      onClick={() => removeCostOverride(name)}
                      className="text-gray-300 hover:text-red-400 text-xs ml-2"
                    >✕</button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
