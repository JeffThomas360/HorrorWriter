import { useState, useEffect } from 'react'
import { supabase } from '../../supabaseClient'
import { resolveReport } from '../../lib/modActions'
import { toast } from 'sonner'

export default function SupportTab() {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

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

  const handleResolve = async (id, actionTaken) => {
    const note = window.prompt(`Resolution note to send to the user? (Optional)`)
    if (note === null) return // cancelled
    try {
      await resolveReport(id, actionTaken, note)
      setReports(prev => prev.filter(r => r.id !== id))
      toast.success(`Support ticket ${actionTaken}`)
    } catch (err) {
      toast.error(err.message)
    }
  }

  const smallGhost = 'border border-[var(--color-line)] px-2 py-1 text-xs text-[var(--color-text-primary)] transition-colors hover:border-white cursor-pointer'

  if (loading) return <p className="text-[var(--color-text-secondary)]">Loading support tickets...</p>
  if (error) return <p className="form-err font-mono text-xs text-[var(--color-accent-crimson)]">{error}</p>

  if (reports.length === 0) return <p className="text-[var(--color-text-secondary)]">No open support tickets.</p>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {reports.map(r => (
        <div key={r.id} style={{ border: '1px solid #333', padding: 16, borderRadius: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <strong>SITE ISSUE - {r.category}</strong>
            <span className="text-[var(--color-text-secondary)]">{new Date(r.created_at).toLocaleString()}</span>
          </div>
          <p style={{ margin: '8px 0', fontSize: '14px' }}>
            <strong>Reporter:</strong> {r.profiles?.handle ? `@${r.profiles.handle}` : 'Unknown'}
          </p>
          <p style={{ margin: '8px 0', fontSize: '14px' }}>
            <strong>Details:</strong> {r.details || 'None provided'}
          </p>
          <div style={{ marginTop: 12, display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button className={smallGhost} onClick={() => handleResolve(r.id, 'dismissed')}>Dismiss</button>
            <button className={smallGhost} onClick={() => handleResolve(r.id, 'actioned')}>Resolved</button>
          </div>
        </div>
      ))}
    </div>
  )
}
