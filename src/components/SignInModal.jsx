import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { signInWithPasskey } from '../lib/passkey'

const DISPOSABLE_DOMAINS = [
  'mailinator.com', 'yopmail.com', '10minutemail.com', 'tempmail.com',
  'guerrillamail.com', 'sharklasers.com', 'dispostable.com', 'getairmail.com'
]

export default function SignInModal({ isOpen, onClose }) {
  const [email, setEmail] = useState('')
  const [honeypot, setHoneypot] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isPasskeySubmitting, setIsPasskeySubmitting] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)

  const enableGoogle = import.meta.env.VITE_ENABLE_GOOGLE_LOGIN === 'true'

  // Close on Escape key
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onClose])

  // Listen for Google Auth Success postMessage from the popup
  useEffect(() => {
    const handleMessage = async (e) => {
      if (e.origin !== window.location.origin) return
      if (e.data?.type === 'AUTH_SUCCESS') {
        if (supabase) {
          // Force parent client to sync session state
          await supabase.auth.getSession()
        }
        onClose()
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [onClose])

  // Reset state when modal is opened/closed
  useEffect(() => {
    if (!isOpen) {
      setEmail('')
      setError(null)
      setMessage(null)
    }
  }, [isOpen])

  if (!isOpen) return null

  const handlePasskey = async () => {
    setIsPasskeySubmitting(true)
    setError(null)
    setMessage(null)
    try {
      await signInWithPasskey(email)
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setIsPasskeySubmitting(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setIsSubmitting(true)
    setError(null)
    setMessage(null)
    if (!supabase) {
      setError('Supabase is not connected yet.')
      setIsSubmitting(false)
      return
    }
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          skipBrowserRedirect: true,
          redirectTo: window.location.origin + '/auth/callback',
        }
      })
      if (error) throw error

      if (data?.url) {
        // Calculate centered coordinates for popup window
        const width = 500
        const height = 650
        const left = window.screen.width / 2 - width / 2
        const top = window.screen.height / 2 - height / 2

        window.open(
          data.url,
          'google_signin',
          `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes,scrollbars=yes`
        )
      } else {
        throw new Error('OAuth URL not returned.')
      }
    } catch (err) {
      setError(err.message || 'Failed to initiate Google sign-in.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)
    setMessage(null)

    if (honeypot.trim()) {
      // Honeypot triggered: simulate success for the bot, but do not send anything
      setTimeout(() => {
        setMessage('Check your email for the magic link.')
        setIsSubmitting(false)
      }, 500)
      return
    }

    const domain = email.split('@')[1]?.toLowerCase().trim()
    if (DISPOSABLE_DOMAINS.includes(domain)) {
      setError('Temporary or disposable email addresses are not allowed.')
      setIsSubmitting(false)
      return
    }

    if (!supabase) {
      setError('Supabase is not connected yet.')
      setIsSubmitting(false)
      return
    }

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: window.location.origin + '/auth/callback',
        }
      })

      if (error) throw error
      setMessage('Check your email for the magic link.')
    } catch (err) {
      setError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close modal">×</button>

        <div className="modal-header">
          <h2>Summon <em>Yourself</em></h2>
          <p>Enter the void using your passkey or email credentials.</p>

          {error && <div style={{ color:'var(--blood)', fontSize:14, marginBottom:16 }}>{error}</div>}
          {message && <div style={{ color:'var(--cyan)', fontSize:14, marginBottom:16 }}>{message}</div>}
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          {/* Honeypot field - hidden from humans */}
          <div style={{ position: 'absolute', left: '-5000px' }} aria-hidden="true">
            <input
              type="text"
              name="website_url_hp"
              value={honeypot}
              onChange={e => setHoneypot(e.target.value)}
              tabIndex="-1"
              autoComplete="off"
            />
          </div>

          <div className="input-group" style={{ marginBottom: 20 }}>
            <label htmlFor="email">Email Address</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="writer@thedark.com"
              required
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button
              type="submit"
              className="btn primary full-width"
              disabled={isSubmitting || isPasskeySubmitting}
              style={{ padding: '12px 16px' }}
            >
              {isSubmitting ? 'Channeling...' : '✉ Send Magic Link'}
            </button>

            <button
              type="button"
              className="btn blood full-width passkey-btn"
              onClick={handlePasskey}
              disabled={isPasskeySubmitting || isSubmitting}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              <svg
                className="icon"
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ marginRight: 4 }}
              >
                <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
              </svg>
              {isPasskeySubmitting ? 'Awaiting your device...' : 'Sign in with Passkey'}
            </button>

            {enableGoogle && (
              <button
                type="button"
                className="btn ghost full-width google-btn"
                onClick={handleGoogleSignIn}
                disabled={isPasskeySubmitting || isSubmitting}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                <svg
                  className="icon"
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="currentColor"
                  style={{ marginRight: 4 }}
                >
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09zM12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23zM5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63zM12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                Continue with Google
              </button>
            )}
          </div>
        </form>

        <p className="modal-footer" style={{ marginTop:'24px' }}>
          By entering, you agree to the <Link to="/rules" onClick={onClose}>House Rules</Link>. No algorithms, no ads.
        </p>
      </div>
    </div>
  )
}
