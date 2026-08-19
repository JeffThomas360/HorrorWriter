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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#000]/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="modal-content vintage-border relative w-full max-w-md bg-[var(--color-bg-surface)] p-8"
        onClick={e => e.stopPropagation()}
      >
        <button
          className="absolute right-4 top-4 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] cursor-pointer"
          onClick={onClose}
          aria-label="Close modal"
        >
          ×
        </button>

        <div className="mb-6">
          <h2 className="font-serif text-xl font-black text-[var(--color-text-primary)]">
            Report <em className="italic text-[var(--color-accent-crimson)]">Issue</em>
          </h2>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            {targetType === 'site'
              ? 'Report a bug or contact support.'
              : 'Report content that violates our community guidelines.'}
          </p>
        </div>

        {success ? (
          <div className="py-5 text-center text-[var(--color-text-secondary)]">
            <p>Report received. A Keeper will review it shortly.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {error && <div className="text-sm text-[var(--color-accent-crimson)]">{error}</div>}

            <div className="flex flex-col gap-2">
              <label className="font-mono text-xs uppercase text-[var(--color-text-secondary)]">Category</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                required
                className="bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] border border-[var(--color-line)] px-3 py-2 text-sm focus:border-[var(--color-accent-crimson)] focus:outline-none"
              >
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

            <div className="flex flex-col gap-2">
              <label className="font-mono text-xs uppercase text-[var(--color-text-secondary)]">Additional Details (Optional)</label>
              <textarea
                value={details}
                onChange={e => setDetails(e.target.value)}
                placeholder="Provide any helpful context..."
                rows={4}
                className="resize-y bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] border border-[var(--color-line)] px-3 py-2 text-sm focus:border-[var(--color-accent-crimson)] focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-[var(--color-accent-crimson)] px-5 py-3 font-mono text-xs uppercase tracking-wider text-white transition-colors hover:bg-red-700 cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? 'Submitting...' : 'Submit Report'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
