import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'

const AuthContext = createContext({
  session: null,
  user: null,
  profile: null,
  isLoading: true,
  refreshProfile: async () => {},
})

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  const inFlightRef = useRef(null)
  const fetchProfile = useCallback(async (userId) => {
    if (!supabase) return null
    // Coalesce concurrent calls for the same user.
    if (inFlightRef.current?.userId === userId) {
      return inFlightRef.current.promise
    }
    const promise = (async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single()
        if (error) throw error
        setProfile(data)
        return data
      } catch (err) {
        console.error(`[AuthContext] fetchProfile failed for user ${userId}:`, err)
        return null
      } finally {
        setIsLoading(false)
        inFlightRef.current = null
      }
    })()
    inFlightRef.current = { userId, promise }
    return promise
  }, [])

  // Public: re-fetch the current user's profile (used after edits).
  const refreshProfile = useCallback(async () => {
    if (!user) return null
    return fetchProfile(user.id)
  }, [user, fetchProfile])

  useEffect(() => {
    if (!supabase) {
      setIsLoading(false)
      return
    }

    // Initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else setIsLoading(false)
    })

    // Subscribe to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user.id)
      } else {
        setProfile(null)
        setIsLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [fetchProfile])

  return (
    <AuthContext.Provider value={{ session, user, profile, isLoading, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
