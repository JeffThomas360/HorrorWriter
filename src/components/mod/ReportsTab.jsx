import { useState, useEffect } from 'react'
import { supabase } from '../../supabaseClient'
import { resolveReport } from '../../lib/modActions'
import UserModProfile from './UserModProfile'
import { toast } from 'sonner'

const MOD_MACROS = ["Spam", "House Rules Violation", "Plagiarism", "False Flag"]

export default function ReportsTab() {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeContextUserId, setActiveContextUserId] = useState(null)

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

  const handleResolve = async (id, actionTaken, noteStr = null) => {
    let note = noteStr
    if (!noteStr && actionTaken !== 'dismissed') {
      note = window.prompt(`Custom resolution note for marking as ${actionTaken}? (Optional)`)
      if (note === null) return // cancelled
    }
    try {
      await resolveReport(id, actionTaken, note)
      setReports(prev => prev.filter(r => r.id !== id))
      toast.success(`Report ${actionTaken}`)
    } catch (err) {
      toast.error(err.message)
    }
  }

  const renderTargetLink = (type, id) => {
    if (type === 'story' || type === 'critique') return <a href={`/library/read/${id}`} className="underline hover:text-[var(--color-accent-crimson)]">View Content</a>
    if (type === 'thread' || type === 'post') return <a href={`/forum/thread/${id}`} className="underline hover:text-[var(--color-accent-crimson)]">View Content</a>
    if (type === 'user') return <button className="btn ghost" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => setActiveContextUserId(id)}>View User Context</button>
    return id
  }

  if (loading) return <p className="dim">Loading reports...</p>
  if (error) return <p className="form-err">{error}</p>

  if (reports.length === 0) return <p className="dim">The queue is quiet. No open reports.</p>

  return (
    <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
      <div className="mod-reports-list" style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 2 }}>
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
            <div style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              {renderTargetLink(r.target_type, r.target_id)}
              <div style={{ flex: 1 }}></div>
              <button className="btn ghost" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => handleResolve(r.id, 'dismissed', 'Dismissed without action')}>Dismiss</button>
              
              {/* Mod Macros */}
              {MOD_MACROS.map(m => (
                <button key={m} className="btn" style={{ fontSize: 12, padding: '4px 8px', borderColor: '#444' }} onClick={() => handleResolve(r.id, 'actioned', m)}>
                  {m}
                </button>
              ))}
              <button className="btn blood" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => handleResolve(r.id, 'actioned')}>Custom Action...</button>
            </div>
          </div>
        ))}
      </div>
      
      {/* Content Context Drawer */}
      {activeContextUserId && (
        <div style={{ flex: 1, position: 'sticky', top: 24, height: 'calc(100vh - 100px)' }}>
          <UserModProfile userId={activeContextUserId} onClose={() => setActiveContextUserId(null)} />
        </div>
      )}
    </div>
  )
}
