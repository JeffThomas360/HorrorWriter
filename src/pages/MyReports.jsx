import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../components/AuthContext'
import { useDocumentTitle } from '../lib/useDocumentTitle'

export default function MyReports() {
  const { user } = useAuth()
  useDocumentTitle('My Reports')
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    const fetchReports = async () => {
      const { data } = await supabase
        .from('reports')
        .select('*')
        .eq('reporter_id', user.id)
        .order('created_at', { ascending: false })
      setReports(data || [])
      setLoading(false)
    }
    fetchReports()
  }, [user])

  if (loading) return <section className="surface active"><p className="dim">Loading reports...</p></section>

  return (
    <section className="surface active">
      <p className="eyebrow">▸ Transparency</p>
      <h2 className="title">My <em>reports</em></h2>
      <p className="dim" style={{ marginBottom: 24 }}>
        Track the status of content you have flagged for review.
      </p>

      {reports.length === 0 ? (
        <p className="dim" style={{ fontStyle: 'italic' }}>You have not submitted any reports.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {reports.map(r => (
            <div key={r.id} style={{ border: '1px solid rgba(255,255,255,0.1)', padding: 16, borderRadius: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <strong>{r.target_type.toUpperCase()} - {r.category}</strong>
                <span className="dim">{new Date(r.created_at).toLocaleString()}</span>
              </div>
              <p style={{ margin: '8px 0', fontSize: '14px' }}>
                <strong>Status:</strong> <span style={{ color: r.status === 'open' ? 'var(--cyan)' : (r.status === 'actioned' ? 'var(--blood)' : 'inherit') }}>{r.status.toUpperCase()}</span>
              </p>
              {r.status !== 'open' && r.resolution && (
                <div style={{ marginTop: 8, padding: 8, background: 'rgba(255,255,255,0.05)', borderRadius: 4, fontSize: 13 }}>
                  <strong>Moderator Note:</strong> {r.resolution}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
