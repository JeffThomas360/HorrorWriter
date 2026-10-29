import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { withProviders } from '../components/Providers'
import { takeReturnPath } from '../lib/returnPath'
import { setPasskeyPrompt, takeEmailLinkRequest } from '../lib/passkeyPrompt'

function AuthCallback() {
  useDocumentTitle('Summoning…')
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
      const msg = errDesc || errName || "Authentication failed."
      if (window.opener) {
        window.opener.postMessage({ type: 'AUTH_FAILURE', message: msg }, window.location.origin)
        window.close()
      } else {
        setError(msg)
      }
      return
    }

    // Check hash parameters for errors as well
    const hashParams = new URLSearchParams(window.location.hash.substring(1))
    const hashErrName = hashParams.get('error')
    const hashErrDesc = hashParams.get('error_description')
    if (hashErrName || hashErrDesc) {
      const msg = hashErrDesc || hashErrName || "Authentication failed."
      if (window.opener) {
        window.opener.postMessage({ type: 'AUTH_FAILURE', message: msg }, window.location.origin)
        window.close()
      } else {
        setError(msg)
      }
      return
    }

    // An email-link sign-in (the modal asks for /auth/callback?via=email) leaves a
    // flag so PasskeyPrompt, on the page they land on, can offer a passkey. The URL
    // alone proves nothing, so the flag is only set once a session is confirmed, just
    // before the redirect: never on an error, and never on the no-session fallback.
    // Even then the session may belong to an account somebody else requested the link
    // for, so it also needs the marker the modal leaves when THIS browser asks for a link
    // (less than an hour old). The marker is used up either way. Google and passkey
    // sign-in never carry `via=email`. The flag names the account that signed in, so
    // the prompt only ever shows to that member.
    const viaEmail = params.get('via') === 'email'
    const redirectBack = (signedIn) => {
      const askedHere = takeEmailLinkRequest()
      if (viaEmail && askedHere) setPasskeyPrompt(signedIn?.user?.id)
      window.location.replace(takeReturnPath())
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
            redirectBack(data.session)
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
          redirectBack(session)
        }
      }
    })

    // Fallback: If no event fires within 15 seconds, check session manually
    const timer = setTimeout(async () => {
      const { data } = await supabase.auth.getSession()
      if (data.session) {
        if (active) {
          if (window.opener) {
            window.opener.postMessage({ type: 'AUTH_SUCCESS' }, window.location.origin)
            window.close()
          } else {
            redirectBack(data.session)
          }
        }
      } else {
        if (active) {
          const msg = "The authentication link expired or was invalid. Please try again."
          if (window.opener) {
            window.opener.postMessage({ type: 'AUTH_FAILURE', message: msg }, window.location.origin)
            window.close()
          } else {
            setError(msg)
          }
        }
      }
    }, 15000)

    return () => {
      active = false
      subscription.unsubscribe()
      clearTimeout(timer)
    }
  }, [])

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

export default withProviders(AuthCallback)
