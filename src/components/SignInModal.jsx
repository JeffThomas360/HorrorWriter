import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { signInWithPasskey } from '../lib/passkey'

const DISPOSABLE_DOMAINS = [
  'mailinator.com', 'yopmail.com', '10minutemail.com', 'tempmail.com',
  'guerrillamail.com', 'sharklasers.com', 'dispostable.com', 'getairmail.com'
]

const getEmailCookie = () => {
  if (typeof document === 'undefined') return ''
  const match = document.cookie.match(/(?:^|; )hw_last_email=([^;]*)/)
  return match ? decodeURIComponent(match[1]) : ''
}

const saveEmailCookie = (emailToSave) => {
  if (typeof document === 'undefined') return
  document.cookie = `hw_last_email=${encodeURIComponent(emailToSave)}; max-age=${60 * 60 * 24 * 365}; path=/; SameSite=Strict`
}

export default function SignInModal({ isOpen, onClose }) {
  const [email, setEmail] = useState('')
  const [honeypot, setHoneypot] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isPasskeySubmitting, setIsPasskeySubmitting] = useState(false)
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)

  // Load email cookie only on client mount
  useEffect(() => {
    setEmail(getEmailCookie())
  }, [])

  const enableGoogle = import.meta.env.VITE_ENABLE_GOOGLE_LOGIN === 'true'

  // Close on Escape key
  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onClose])

  // Listen for Google Auth postMessages from the popup
  useEffect(() => {
    const handleMessage = (e) => {
      if (e.origin !== window.location.origin) return
      if (e.data?.type === 'AUTH_SUCCESS') {
        setIsGoogleSubmitting(false)
        onClose()
      } else if (e.data?.type === 'AUTH_FAILURE') {
        setIsGoogleSubmitting(false)
        setError(e.data.message || 'Google sign-in failed.')
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [onClose])

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setEmail(getEmailCookie())
      setError(null)
      setMessage(null)
    }
  }, [isOpen])

  if (!isOpen) return null

  const anyBusy = isSubmitting || isPasskeySubmitting || isGoogleSubmitting

  const handlePasskey = async () => {
    if (!email.trim()) {
      setError('Enter your email address first.')
      return
    }
    setIsPasskeySubmitting(true)
    setError(null)
    setMessage(null)
    saveEmailCookie(email)
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
    setIsGoogleSubmitting(true)
    setError(null)
    setMessage(null)
    if (!supabase) {
      setError('Supabase is not connected yet.')
      setIsGoogleSubmitting(false)
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
      if (!data?.url) throw new Error('OAuth URL not returned.')

      const width = 500, height = 650
      const left  = window.screen.width  / 2 - width  / 2
      const top   = window.screen.height / 2 - height / 2
      const win   = window.open(
        data.url,
        'google_signin',
        `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes,scrollbars=yes`
      )
      if (!win) {
        setError('Pop-ups are blocked — allow pop-ups for this site and try again.')
        setIsGoogleSubmitting(false)
      }
    } catch (err) {
      setError(err.message || 'Failed to initiate Google sign-in.')
      setIsGoogleSubmitting(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)
    setMessage(null)

    if (honeypot.trim()) {
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
      saveEmailCookie(email)
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin + '/auth/callback' }
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
    <div className="fixed inset-0 z-50 bg-[#000]/80 flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="modal-content w-full max-w-md bg-[var(--color-bg-surface)] border border-[#2d2d2a] p-8 relative vintage-border" onClick={e => e.stopPropagation()}>
        <button className="absolute top-4 right-4 text-2xl text-[var(--color-text-secondary)] hover:text-white cursor-pointer" onClick={onClose} aria-label="Close modal">×</button>

        <div className="mb-6 text-center">
          <h2 className="text-2xl font-serif mb-2">Summon <em className="text-[var(--color-accent-crimson)] not-italic">Yourself</em></h2>
          <p className="text-xs text-[var(--color-text-secondary)] font-serif">Enter the void using your passkey or email credentials.</p>
          {error   && <div className="text-[var(--color-accent-crimson)] text-xs mt-3 font-mono">{error}</div>}
          {message && <div className="text-[var(--color-text-primary)] text-xs mt-3 font-mono">{message}</div>}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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

          <div className="flex flex-col gap-3">
            <button
              type="button"
              className="w-full bg-[var(--color-text-primary)] text-[var(--color-bg-primary)] font-mono text-xs uppercase py-3 flex items-center justify-center gap-2 hover:bg-white cursor-pointer"
              onClick={handlePasskey}
              disabled={anyBusy}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
              </svg>
              {isPasskeySubmitting ? 'Awaiting your device...' : 'Sign in with Passkey'}
            </button>

            {enableGoogle && (
              <button
                type="button"
                className="w-full border border-[#2d2d2a] text-[var(--color-text-primary)] font-mono text-xs uppercase py-3 flex items-center justify-center gap-2 cursor-pointer hover:border-white"
                onClick={handleGoogleSignIn}
                disabled={anyBusy}
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09zM12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23zM5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63zM12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                {isGoogleSubmitting ? 'Opening...' : 'Continue with Google'}
              </button>
            )}
          </div>

          <div className="flex items-center gap-3 my-1" aria-hidden="true">
            <div className="flex-1 border-t border-[#2d2d2a]"></div>
            <span className="font-mono text-xs text-[var(--color-text-secondary)] uppercase">or</span>
            <div className="flex-1 border-t border-[#2d2d2a]"></div>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="email" className="text-xs font-mono text-[var(--color-text-secondary)]">Email Address</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="writer@thedark.com"
              required
              className="bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] border border-[#2d2d2a] px-3 py-2 text-sm focus:border-[var(--color-accent-crimson)] focus:outline-none"
            />
          </div>

          <button
            type="submit"
            className="text-center font-mono text-xs uppercase text-[var(--color-text-secondary)] underline hover:text-[var(--color-accent-crimson)] cursor-pointer py-1 bg-transparent"
            disabled={anyBusy}
          >
            {isSubmitting ? 'Channeling...' : 'Email me a magic link instead'}
          </button>
        </form>

        <p className="text-center text-xs text-[var(--color-text-secondary)] mt-6 font-serif">
          By entering, you agree to the <a href="/rules" className="underline hover:text-[var(--color-accent-crimson)]" onClick={onClose}>House Rules</a>. No algorithms, no ads.
        </p>
      </div>
    </div>
  )
}
