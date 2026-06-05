import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useDocumentTitle } from '../lib/useDocumentTitle'

export default function AuthCallback() {
  useDocumentTitle('Summoning…')
  const navigate = useNavigate()
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!supabase) {
      setError("Authentication is not configured.")
      return
    }

    // Check URL search parameters for explicit errors from Supabase/Google
    const params = new URLSearchParams(window.location.search)
    const errName = params.get('error')
    const errDesc = params.get('error_description')
    if (errName || errDesc) {
      setError(errDesc || errName || "Authentication failed.")
      return
    }

    // Check hash parameters for errors as well
    const hashParams = new URLSearchParams(window.location.hash.substring(1))
    const hashErrName = hashParams.get('error')
    const hashErrDesc = hashParams.get('error_description')
    if (hashErrName || hashErrDesc) {
      setError(hashErrDesc || hashErrName || "Authentication failed.")
      return
    }

    let active = true

    // Check session immediately on mount
    const checkImmediateSession = async () => {
      try {
        const { data, error: sessionErr } = await supabase.auth.getSession()
        if (sessionErr) throw sessionErr
        if (data.session && active) {
          if (window.opener) {
            window.opener.postMessage({ type: 'AUTH_SUCCESS' }, window.location.origin)
            window.close()
          } else {
            navigate('/profile', { replace: true })
          }
        }
      } catch (err) {
        console.error("Immediate session check failed:", err)
      }
    }
    checkImmediateSession()

    // Supabase automatically parses the URL hash into a session.
    // We just need to wait for it to emit the SIGNED_IN event.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session && active) {
        if (window.opener) {
          window.opener.postMessage({ type: 'AUTH_SUCCESS' }, window.location.origin)
          window.close()
        } else {
          navigate('/profile', { replace: true })
        }
      }
    })

    // Fallback: If no event fires within 5 seconds, check session manually
    const timer = setTimeout(async () => {
      const { data } = await supabase.auth.getSession()
      if (data.session) {
        if (active) {
          if (window.opener) {
            window.opener.postMessage({ type: 'AUTH_SUCCESS' }, window.location.origin)
            window.close()
          } else {
            navigate('/profile', { replace: true })
          }
        }
      } else {
        if (active) setError("The authentication link expired or was invalid. Please try again.")
      }
    }, 5000)

    return () => {
      active = false
      subscription.unsubscribe()
      clearTimeout(timer)
    }
  }, [navigate])

  return (
    <section className="surface active" style={{ textAlign: 'center', paddingTop: 120 }}>
      {error ? (
        <>
          <p className="eyebrow" style={{ color: 'var(--blood)' }}>Summoning Failed</p>
          <p style={{ color: 'var(--bone-dim)', marginTop: 12 }}>{error}</p>
        </>
      ) : (
        <p className="eyebrow">Summoning…</p>
      )}
    </section>
  )
}
