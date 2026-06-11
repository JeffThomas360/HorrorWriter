import { useState, useEffect } from 'react'
import { supabase } from '../../supabaseClient'
import { resolveReport } from '../../lib/modActions'
import { Link } from 'react-router-dom'
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

  if (loading) return <p className="dim">Loading support tickets...</p>
  if (error) return <p className="form-err">{error}</p>

  if (reports.length === 0) return <p className="dim">No open support tickets.</p>

  return (
    <div className="mod-reports-list" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {reports.map(r => (
        <div key={r.id} style={{ border: '1px solid #333', padding: 16, borderRadius: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <strong>SITE ISSUE - {r.category}</strong>
            <span className="dim">{new Date(r.created_at).toLocaleString()}</span>
          </div>
          <p style={{ margin: '8px 0', fontSize: '14px' }}>
            <strong>Reporter:</strong> {r.profiles?.handle ? `@${r.profiles.handle}` : 'Unknown'}
          </p>
          <p style={{ margin: '8px 0', fontSize: '14px' }}>
            <strong>Details:</strong> {r.details || 'None provided'}
          </p>
          <div style={{ marginTop: 12, display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button className="btn ghost" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => handleResolve(r.id, 'dismissed')}>Dismiss</button>
            <button className="btn" style={{ fontSize: 12, padding: '4px 8px', borderColor: 'var(--cyan)', color: 'var(--cyan)' }} onClick={() => handleResolve(r.id, 'actioned')}>Resolved</button>
          </div>
        </div>
      ))}
    </div>
  )
}
