import { useState, useEffect } from 'react'
import { supabase } from '../../supabaseClient'
import { resolveReport } from '../../lib/modActions'
import { Link } from 'react-router-dom'

export default function ReportsTab() {
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
      .neq('target_type', 'site')
      .eq('status', 'open')
      .order('created_at', { ascending: false })

    if (error) {
      setError(error.message)
    } else {
      // Sort urgent to the top
      const sorted = [...data].sort((a, b) => {
        if (a.category === 'urgent' && b.category !== 'urgent') return -1
        if (b.category === 'urgent' && a.category !== 'urgent') return 1
        return 0
      })
      setReports(sorted)
    }
    setLoading(false)
  }

  const handleResolve = async (id, actionTaken) => {
    const note = window.prompt(`Resolution note for marking as ${actionTaken}? (Optional)`)
    if (note === null) return // cancelled
    try {
      await resolveReport(id, actionTaken, note)
      setReports(prev => prev.filter(r => r.id !== id))
    } catch (err) {
      alert(err.message)
    }
  }

  const renderTargetLink = (type, id) => {
    if (type === 'story' || type === 'critique') return <Link to={`/story/${id}`}>View Content</Link>
    if (type === 'thread' || type === 'post') return <Link to={`/thread/${id}`}>View Content</Link>
    if (type === 'user') return <Link to={`/member/${id}`}>View User</Link>
    return id
  }

  if (loading) return <p className="dim">Loading reports...</p>
  if (error) return <p className="form-err">{error}</p>

  if (reports.length === 0) return <p className="dim">The queue is quiet. No open reports.</p>

  return (
    <div className="mod-reports-list" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {reports.map(r => (
        <div key={r.id} style={{ 
          border: `1px solid ${r.category === 'urgent' ? 'var(--blood)' : '#333'}`,
          padding: 16, borderRadius: 4, background: r.category === 'urgent' ? 'rgba(255,0,0,0.05)' : 'transparent'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <strong>{r.target_type.toUpperCase()} - {r.category}</strong>
            <span className="dim">{new Date(r.created_at).toLocaleString()}</span>
          </div>
          <p style={{ margin: '8px 0', fontSize: '14px' }}>
            <strong>Reporter:</strong> {r.profiles?.handle ? `@${r.profiles.handle}` : 'Unknown'}
          </p>
          <p style={{ margin: '8px 0', fontSize: '14px' }}>
            <strong>Details:</strong> {r.details || 'None provided'}
          </p>
          <div style={{ marginTop: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
            {renderTargetLink(r.target_type, r.target_id)}
            <div style={{ flex: 1 }}></div>
            <button className="btn ghost" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => handleResolve(r.id, 'dismissed')}>Dismiss</button>
            <button className="btn blood" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => handleResolve(r.id, 'actioned')}>Action Taken</button>
          </div>
        </div>
      ))}
    </div>
  )
}
