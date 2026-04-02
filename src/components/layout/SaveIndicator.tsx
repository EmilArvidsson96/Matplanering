import type { SaveStatus } from '../../hooks/useAutoSave'

export default function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === 'idle') return null
  return (
    <span className="text-xs text-gray-400 select-none">
      {status === 'saving' && 'Sparar…'}
      {status === 'saved'  && 'Sparat ✓'}
      {status === 'error'  && <span className="text-red-400">Sparfel</span>}
    </span>
  )
}
