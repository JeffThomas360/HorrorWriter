import { useState, useEffect } from 'react'
import { submitReport } from '../lib/modActions'
import { toast } from 'sonner'
import { useAuth } from './AuthContext'

export default function ReportModal({ isOpen, onClose, targetType, targetId }) {
  const { profile } = useAuth()
  const [category, setCategory] = useState('')
  const [details, setDetails] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  // Reset state on open
  useEffect(() => {
    if (isOpen) {
      setCategory('')
      setDetails('')
      setError(null)
      setSuccess(false)
      setIsSubmitting(false)
    }
  }, [isOpen])

  // Close on Escape key
  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onClose])

  if (!isOpen) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!profile) {
      setError('You must be signed in to submit a report.')
      return
    }
    if (!category) {
      setError('Please select a category.')
      return
    }
    
    setIsSubmitting(true)
    setError(null)
    try {
      await submitReport({ targetType, targetId, category, details })
      toast.success('Report submitted successfully')
      onClose()
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
          <h2>Report <em>Issue</em></h2>
          <p>
            {targetType === 'site' 
              ? 'Report a bug or contact support.' 
              : 'Report content that violates our community guidelines.'}
          </p>
        </div>

        {success ? (
          <div style={{ textAlign: 'center', color: 'var(--cyan)', padding: '20px 0' }}>
            <p>Report received. A Keeper will review it shortly.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="modal-form">
            {error && <div style={{ color:'var(--blood)', fontSize:14, marginBottom:16 }}>{error}</div>}

            <div className="input-group">
              <label>Category</label>
              <select value={category} onChange={e => setCategory(e.target.value)} required>
                <option value="" disabled>Select a reason...</option>
                {targetType === 'site' ? (
                  <>
                    <option value="urgent">Urgent Security/Site Issue</option>
                    <option value="other">Bug / Other</option>
                  </>
                ) : (
                  <>
                    <option value="harassment">Harassment / Hate Speech</option>
                    <option value="spam">Spam / Bots</option>
                    <option value="urgent">Urgent / Real-world Harm</option>
                    <option value="other">Other Violation</option>
                  </>
                )}
              </select>
            </div>

            <div className="input-group">
              <label>Additional Details (Optional)</label>
              <textarea 
                value={details} 
                onChange={e => setDetails(e.target.value)} 
                placeholder="Provide any helpful context..."
                rows={4}
              />
            </div>

            <button type="submit" className="btn primary full-width" disabled={isSubmitting}>
              {isSubmitting ? 'Submitting...' : 'Submit Report'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
