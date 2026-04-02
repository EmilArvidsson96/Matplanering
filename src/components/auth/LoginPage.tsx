interface Props {
  onLogin: () => void
}

export default function LoginPage({ onLogin }: Props) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-brand-50 px-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm text-center">
        <div className="text-5xl mb-4">🍽️</div>
        <h1 className="text-2xl font-bold text-brand-800 mb-1">Matplanering</h1>
        <p className="text-gray-500 mb-8 text-sm">Logga in för att komma åt din veckoplanering</p>
        <button
          onClick={onLogin}
          className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold py-3 rounded-xl transition-colors"
        >
          Logga in
        </button>
      </div>
    </div>
  )
}
