import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { Turnstile } from '@marsidev/react-turnstile'
import { signInWithPasskey } from '../lib/passkey'

export default function SignInModal({ isOpen, onClose }) {
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isPasskeySubmitting, setIsPasskeySubmitting] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)
  const [captchaToken, setCaptchaToken] = useState(null)

  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY

  // Close on Escape key
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onClose])

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

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)
    setMessage(null)

    if (!supabase) {
      setError('Supabase is not connected yet.')
      setIsSubmitting(false)
      return
    }

    if (siteKey && !captchaToken) {
      setError('Please complete the security check first.')
      setIsSubmitting(false)
      return
    }

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: window.location.origin + '/auth/callback',
          captchaToken,
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
          <p>Enter the void using your email or a passkey.</p>

          {error && <div style={{ color:'var(--blood)', fontSize:14, marginBottom:16 }}>{error}</div>}
          {message && <div style={{ color:'var(--cyan)', fontSize:14, marginBottom:16 }}>{message}</div>}
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="input-group">
            <label htmlFor="email">Email Address</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="writer@thedark.com"
              required
              autoFocus
            />
          </div>

          {siteKey && (
            <div style={{ marginBottom: 16 }}>
              <Turnstile
                siteKey={siteKey}
                onSuccess={(token) => setCaptchaToken(token)}
                onError={() => setError('Security check failed. Please try again.')}
                options={{ theme: 'dark' }}
              />
            </div>
          )}

          <button
            type="submit"
            className="btn primary full-width"
            disabled={isSubmitting || isPasskeySubmitting || (siteKey && !captchaToken)}
          >
            {isSubmitting ? 'Channeling...' : 'Send Magic Link'}
          </button>
        </form>

        <div style={{ display:'flex', alignItems:'center', gap:12, margin:'20px 0 8px' }}>
          <div style={{ flex:1, height:1, background:'rgba(243,236,217,.15)' }} />
          <span style={{ color:'var(--bone-dim)', fontSize:13, fontStyle:'italic' }}>or</span>
          <div style={{ flex:1, height:1, background:'rgba(243,236,217,.15)' }} />
        </div>

        <button
          type="button"
          className="btn ghost full-width"
          onClick={handlePasskey}
          disabled={isPasskeySubmitting || isSubmitting}
          style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}
        >
          <span style={{ fontSize:18 }}>🔑</span>
          {isPasskeySubmitting ? 'Awaiting your device...' : 'Sign in with Passkey'}
        </button>

        <p className="modal-footer" style={{ marginTop:'24px' }}>
          By entering, you agree to the <a href="#rules">House Rules</a>. No algorithms, no ads.
        </p>
      </div>
    </div>
  )
}
