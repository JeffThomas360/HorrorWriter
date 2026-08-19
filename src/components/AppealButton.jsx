import { useState } from 'react'
import { toast } from 'sonner'
import { submitAppeal } from '../lib/modActions'

export default function AppealButton({ modActionId, targetType }) {
  const [open, setOpen] = useState(false)
  const [explanation, setExplanation] = useState('')
  const [error, setError] = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)

  if (submitted) {
    return <p className="text-xs font-mono text-[var(--color-ash)]">Appeal submitted — a moderator will review it.</p>
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-xs uppercase border border-[var(--color-line)] hover:border-[var(--color-bone)] px-2 py-0.5 text-[var(--color-ash)] cursor-pointer">
        Appeal this
      </button>
    )
  }

  const handleSubmit = async () => {
    if (!explanation.trim()) {
      setError('Explain why this should be reconsidered.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await submitAppeal({ modActionId, targetType, explanation: explanation.trim() })
      setSubmitted(true)
      toast.success('Appeal submitted')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-2 flex flex-col gap-2">
      {error && <p className="text-xs text-[var(--color-blood)]">{error}</p>}
      <textarea
        value={explanation}
        onChange={(e) => setExplanation(e.target.value)}
        placeholder="Why should this be reconsidered?"
        rows={3}
        className="bg-[var(--color-void)] text-[var(--color-bone)] border border-[var(--color-line)] px-3 py-2 text-sm focus:border-[var(--color-ember)] outline-none"
      />
      <button onClick={handleSubmit} disabled={busy} className="self-start bg-[var(--color-blood)] hover:bg-[var(--color-ember)] px-4 py-2 font-mono text-xs uppercase text-white cursor-pointer disabled:opacity-50 transition-colors">
        {busy ? 'Submitting…' : 'Submit Appeal'}
      </button>
    </div>
  )
}
