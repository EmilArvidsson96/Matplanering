import { useEffect, useState } from 'react'

export interface NlUser {
  email: string
  user_metadata?: { full_name?: string }
  token: { access_token: string }
}

type NetlifyIdentityWidget = {
  on: (event: string, cb: (user?: NlUser) => void) => void
  off: (event: string, cb: (user?: NlUser) => void) => void
  open: (tab?: 'login' | 'signup') => void
  close: () => void
  logout: () => void
  currentUser: () => NlUser | null
  init: (opts?: { APIUrl?: string }) => void
  refresh: () => Promise<string>
}

declare global {
  interface Window {
    netlifyIdentity?: NetlifyIdentityWidget
  }
}

export function useNetlifyIdentity() {
  const [user, setUser]       = useState<NlUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const ni = window.netlifyIdentity
    if (!ni) { setLoading(false); return }

    const onInit  = (u?: NlUser) => { setUser(u ?? null); setLoading(false) }
    const onLogin = (u?: NlUser) => { setUser(u ?? null); ni.close() }
    const onLogout = ()           => { setUser(null) }

    ni.on('init',   onInit)
    ni.on('login',  onLogin)
    ni.on('logout', onLogout)
    ni.init()

    return () => {
      ni.off('init',   onInit)
      ni.off('login',  onLogin)
      ni.off('logout', onLogout)
    }
  }, [])

  const login  = () => window.netlifyIdentity?.open('login')
  const logout = () => window.netlifyIdentity?.logout()

  const getToken = async (): Promise<string | null> => {
    const ni = window.netlifyIdentity
    if (!ni || !user) return null
    try { return await ni.refresh() } catch { return null }
  }

  return { user, loading, login, logout, getToken }
}
