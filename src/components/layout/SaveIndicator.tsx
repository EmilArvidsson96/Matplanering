import type { SaveStatus, SaveError } from '../../hooks/useAutoSave'

interface Props {
  status: SaveStatus
  error: SaveError
  onRetry: () => void
}

export default function SaveIndicator({ status, error, onRetry }: Props) {
  if (status === 'idle') return null

  if (status === 'error') {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-red-500 font-medium">Sparfel</span>
          <button
            onClick={onRetry}
            className="text-xs text-red-400 hover:text-red-600 underline"
          >
            Försök igen
          </button>
        </div>
        {error && (
          <span className="text-xs text-red-300 leading-tight break-words max-w-[180px]">
            {error.includes('404')
              ? 'Datarepo saknas – skapa "matplanering-data" på GitHub'
              : error.includes('401') || error.includes('403')
              ? 'Åtkomst nekad – kontrollera GitHub-token'
              : error}
          </span>
        )}
      </div>
    )
  }

  return (
    <span className="text-xs text-gray-400 select-none">
      {status === 'saving' && 'Sparar…'}
      {status === 'saved'  && 'Sparat ✓'}
    </span>
  )
}
