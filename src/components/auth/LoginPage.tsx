import { useState } from 'react'

interface Props {
  onLogin: (pin: string) => boolean
}

export default function LoginPage({ onLogin }: Props) {
  const [pin, setPin]       = useState('')
  const [error, setError]   = useState(false)
  const [shake, setShake]   = useState(false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const ok = onLogin(pin)
    if (!ok) {
      setError(true)
      setShake(true)
      setPin('')
      setTimeout(() => setShake(false), 500)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-brand-50 px-4">
      <div className={`bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm text-center ${shake ? 'animate-shake' : ''}`}>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Matplanering</h1>
        <p className="text-gray-500 mb-8 text-sm">Ange PIN-kod för att logga in</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="password"
            inputMode="numeric"
            placeholder="PIN-kod"
            value={pin}
            onChange={e => { setPin(e.target.value); setError(false) }}
            className={`w-full border rounded-xl px-4 py-3 text-center text-lg tracking-widest outline-none transition-colors
              ${error ? 'border-red-400 bg-red-50' : 'border-gray-200 focus:border-brand-400'}`}
            autoFocus
          />
          {error && <p className="text-red-500 text-sm -mt-2">Fel PIN-kod</p>}
          <button
            type="submit"
            className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            Logga in
          </button>
        </form>
      </div>
    </div>
  )
}
