import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'

const AuthContext = createContext({
  session: null,
  user: null,
  profile: null,
  isLoading: true,
  refreshProfile: async () => {},
})

// Module-scoped globals to share cache and in-flight fetch promises across independent AuthProvider instances (islands)
let globalInFlight = null
let globalProfileCache = {}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchProfile = useCallback(async (userId, forceRefetch = false) => {
    if (!supabase) return null

    // 1. Check memory cache first
    if (!forceRefetch && globalProfileCache[userId]) {
      setProfile(globalProfileCache[userId])
      setIsLoading(false)
      return globalProfileCache[userId]
    }

    // 2. Coalesce concurrent calls for the same user.
    // NOTE: must clear isLoading here too. Multiple AuthProvider instances
    // (e.g. the nav's UserMenu island + a page island) share globalInFlight,
    // so the instance that *coalesces* onto an in-flight fetch must still
    // resolve its own loading state — otherwise whichever island loses the
    // race to start the fetch stays stuck on its loading placeholder forever.
    if (globalInFlight?.userId === userId) {
      try {
        const cachedData = await globalInFlight.promise
        if (cachedData) setProfile(cachedData)
        return cachedData
      } finally {
        setIsLoading(false)
      }
    }

    const promise = (async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single()
        if (error) throw error
        globalProfileCache[userId] = data
        setProfile(data)
        return data
      } catch (err) {
        console.error(`[AuthContext] fetchProfile failed for user ${userId}:`, err)
        return null
      } finally {
        setIsLoading(false)
        globalInFlight = null
      }
    })()
    globalInFlight = { userId, promise }
    return promise
  }, [])

  // Public: re-fetch the current user's profile (used after edits).
  const refreshProfile = useCallback(async () => {
    if (!user) return null
    return fetchProfile(user.id, true)
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
