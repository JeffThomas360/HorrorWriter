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

    // Supabase automatically parses the URL hash into a session.
    // We just need to wait for it to emit the SIGNED_IN event.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN') {
        navigate('/profile', { replace: true })
      }
    })

    // Fallback: If no event fires within 3 seconds, check session manually
    const timer = setTimeout(async () => {
      const { data } = await supabase.auth.getSession()
      if (data.session) {
        navigate('/profile', { replace: true })
      } else {
        setError("The magic link expired or was invalid. Please try again.")
      }
    }, 5000)

    return () => {
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
