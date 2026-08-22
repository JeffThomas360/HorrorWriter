import { useState, useEffect } from 'react'
import { supabase } from '../../supabaseClient'
import { resolveReport } from '../../lib/modActions'
import ConfirmDialog from './ConfirmDialog'
import { toast } from 'sonner'

const GHOST = 'border border-[var(--color-line-hi)] px-2 py-1 text-xs text-[var(--color-bone)] transition-colors hover:border-[var(--color-bone)] cursor-pointer'

export default function SupportTab() {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [pending, setPending] = useState(null) // { id, actionTaken }
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetchReports()
  }, [])

  const fetchReports = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('reports')
      .select('*, profiles!reporter_id(handle)')
      .eq('target_type', 'site')
      .eq('status', 'open')
      .order('created_at', { ascending: false })

    if (error) setError(error.message)
    else setReports(data)
    setLoading(false)
  }

  const confirmResolve = async (note) => {
    if (!pending) return
    setBusy(true)
    try {
      await resolveReport(pending.id, pending.actionTaken, note || null)
      setReports((prev) => prev.filter((r) => r.id !== pending.id))
      toast.success(`Support ticket ${pending.actionTaken}`)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
      setPending(null)
    }
  }

  if (loading) return <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-ash)] animate-pulse">Loading support tickets…</p>
  if (error) return <p className="text-sm text-[var(--color-blood)]">{error}</p>
  if (reports.length === 0) return <p className="text-sm text-[var(--color-ash)] italic font-serif">No open support tickets.</p>

  return (
    <div className="flex flex-col gap-4">
      <ConfirmDialog
        open={!!pending}
        title={pending?.actionTaken === 'dismissed' ? 'Dismiss this ticket?' : 'Mark this ticket resolved?'}
        description="An optional note is sent to the person who filed it."
        withReason
        reasonLabel="Note to the user (optional)"
        reasonPlaceholder="Leave blank to send no note…"
        confirmLabel={pending?.actionTaken === 'dismissed' ? 'Dismiss' : 'Resolve'}
        busy={busy}
        onCancel={() => setPending(null)}
        onConfirm={confirmResolve}
      />
      {reports.map((r) => (
        <div key={r.id} className="card-surface p-4">
          <div className="flex justify-between mb-2">
            <strong className="font-mono text-sm text-[var(--color-bone)]">SITE ISSUE — {r.category}</strong>
            <span className="font-mono text-xs text-[var(--color-ash)]">{new Date(r.created_at).toLocaleString()}</span>
          </div>
          <p className="text-sm text-[var(--color-bone)] my-2">
            <strong>Reporter:</strong> {r.profiles?.handle ? `@${r.profiles.handle}` : 'Unknown'}
          </p>
          <p className="text-sm text-[var(--color-bone)] my-2">
            <strong>Details:</strong> {r.details || 'None provided'}
          </p>
          <div className="flex gap-2 justify-end mt-3">
            <button className={GHOST} onClick={() => setPending({ id: r.id, actionTaken: 'dismissed' })}>Dismiss</button>
            <button className={GHOST} onClick={() => setPending({ id: r.id, actionTaken: 'actioned' })}>Resolved</button>
          </div>
        </div>
      ))}
    </div>
  )
}
