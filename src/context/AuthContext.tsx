import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import type { ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import type { Database } from '../types/database.types'

type UserProfile = Database['public']['Tables']['user_profiles']['Row']

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: UserProfile | null
  profileLoaded: boolean
  loading: boolean
  refreshProfile: () => Promise<void>
  signIn: (email: string, password: string) => Promise<{ data: any; error: any }>
  signOut: () => Promise<{ error: any }>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  // True once a profile fetch has completed for the current session (even if it
  // returned null). Lets role gates distinguish "still loading" from "no profile".
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [loading, setLoading] = useState(true)
  // Monotonic guard: only the most recent loadProfile call may write state, so a
  // slow/stale read can't clobber a fresher one (e.g. the full_name written during
  // invite acceptance racing the USER_UPDATED reload).
  const loadSeqRef = useRef(0)

  useEffect(() => {
    // Initial session check
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        loadProfile(session.user.id)
      } else {
        setLoading(false)
      }
    })

    // Subscribe to auth state changes (login, logout, token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        loadProfile(session.user.id)
      } else {
        setProfile(null)
        setProfileLoaded(false)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function loadProfile(userId: string) {
    const seq = ++loadSeqRef.current
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', userId)
      .single()
    // A newer load started while this one was in flight — drop the stale result.
    if (seq !== loadSeqRef.current) return
    if (error) {
      // Previously swallowed — surface it so a failed profile read isn't silent.
      console.error('Failed to load user profile:', error.message)
    }
    setProfile(data)
    setProfileLoaded(true)
    setLoading(false)
  }

  // Re-fetch the current user's profile on demand — used after a server-side write
  // to user_profiles (e.g. setting full_name at invite acceptance) so the cached
  // profile reflects it without waiting for the next auth event.
  async function refreshProfile() {
    const { data: { user: currentUser } } = await supabase.auth.getUser()
    if (currentUser) await loadProfile(currentUser.id)
  }

  async function signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    return { data, error }
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut()
    return { error }
  }

  return (
    <AuthContext.Provider value={{ session, user, profile, profileLoaded, loading, refreshProfile, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
