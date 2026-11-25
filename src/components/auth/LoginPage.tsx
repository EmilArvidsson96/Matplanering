import { useState } from 'react'
import { UtensilsCrossed } from 'lucide-react'

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
    <div className="min-h-dvh flex flex-col items-center justify-center bg-canvas px-4">
      <div className={`bg-white rounded-4xl p-8 w-full max-w-sm text-center ${shake ? 'animate-shake' : ''}`}>
        <span className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-brand-600 text-white flex items-center justify-center">
          <UtensilsCrossed className="w-7 h-7" />
        </span>
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink mb-1">Matplanering</h1>
        <p className="text-ink-muted mb-8 text-[15px]">Ange PIN-kod för att logga in</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="password"
            inputMode="numeric"
            placeholder="PIN-kod"
            value={pin}
            onChange={e => { setPin(e.target.value); setError(false) }}
            aria-label="PIN-kod"
            className={`w-full h-14 border rounded-2xl px-4 text-center text-xl tracking-[0.4em] outline-none transition-colors
              ${error ? 'border-red-400 bg-red-50' : 'border-line bg-canvas focus:border-brand-400 focus:bg-white'}`}
            autoFocus
          />
          {error && <p className="text-red-700 text-sm -mt-2">Fel PIN-kod</p>}
          <button
            type="submit"
            className="btn-primary w-full h-14 text-base"
          >
            Logga in
          </button>
        </form>
      </div>
    </div>
  )
}
