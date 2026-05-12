import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

export default function SignInModal({ isOpen, onClose }) {
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)

  // Close on Escape key
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onClose])

  if (!isOpen) return null

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
          
          <button type="submit" className="btn primary full-width" disabled={isSubmitting}>
            {isSubmitting ? 'Channeling...' : 'Send Magic Link'}
          </button>
        </form>

        <div className="modal-divider">
          <span>OR</span>
        </div>

        <button className="btn ghost full-width passkey-btn" disabled aria-disabled="true">
          <span className="icon">⚿</span> Sign in with Passkey&nbsp;·&nbsp;<small style={{ opacity: 0.6 }}>soon</small>
        </button>

        <p className="modal-footer">
          By entering, you agree to the <a href="#rules">House Rules</a>. No algorithms, no ads.
        </p>
      </div>
    </div>
  )
}
