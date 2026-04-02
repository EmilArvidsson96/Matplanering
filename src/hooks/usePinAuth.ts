import { useState } from 'react'

const CORRECT_PIN = import.meta.env.VITE_APP_PIN as string | undefined
const STORAGE_KEY = 'matplanering_auth'

export function usePinAuth() {
  // If no PIN is configured (local dev), auto-authenticate
  const noPinRequired = !CORRECT_PIN

  const [authed, setAuthed] = useState(
    () => noPinRequired || localStorage.getItem(STORAGE_KEY) === 'true'
  )

  function login(pin: string): boolean {
    if (pin === CORRECT_PIN) {
      localStorage.setItem(STORAGE_KEY, 'true')
      setAuthed(true)
      return true
    }
    return false
  }

  function logout() {
    localStorage.removeItem(STORAGE_KEY)
    setAuthed(false)
  }

  return { authed, login, logout }
}
