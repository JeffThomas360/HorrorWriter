import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useDocumentTitle } from '../lib/useDocumentTitle'

export default function TransparencyLog() {
  useDocumentTitle('Transparency Log')
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const fetchLogs = async () => {
      const { data, error } = await supabase
        .from('transparency_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)
      
      if (error) setError(error.message)
      else setLogs(data || [])
      setLoading(false)
    }
    fetchLogs()
  }, [])

  return (
    <section className="surface active">
      <p className="eyebrow">▸ Community</p>
      <h2 className="title">Transparency <em>log</em></h2>
      <p className="dim" style={{ marginBottom: 24, maxWidth: 600 }}>
        A read-only feed of recent moderator actions to ensure accountability. 
        Exact user handles and specific content payloads are redacted to prevent amplifying bad behavior.
      </p>

      {loading ? (
        <p className="dim">Loading logs...</p>
      ) : error ? (
        <p className="form-err">{error}</p>
      ) : logs.length === 0 ? (
        <p className="dim" style={{ fontStyle: 'italic' }}>No recent moderation actions.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {logs.map(log => (
            <div key={log.id} style={{ 
              padding: 12, 
              border: '1px solid rgba(255,255,255,0.05)', 
              background: 'rgba(0,0,0,0.2)',
              borderRadius: 4,
              fontSize: 14 
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: 'var(--cyan)' }}>
                  [{log.actor_role?.toUpperCase() || 'AUTOMOD'}]
                </span>
                <span className="dim" style={{ fontSize: 12 }}>
                  {new Date(log.created_at).toLocaleString()}
                </span>
              </div>
              <div>
                <strong>Action:</strong> {log.action.toUpperCase()} on {log.target_type.toUpperCase()}
              </div>
              {log.reason && (
                <div style={{ marginTop: 4, fontStyle: 'italic', color: 'var(--bone-dim)' }}>
                  Reason: {log.reason}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
