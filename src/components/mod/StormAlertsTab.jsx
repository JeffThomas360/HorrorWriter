import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { supabase } from '../../supabaseClient'
import { resolveStorm } from '../../lib/modActions'

export default function StormAlertsTab() {
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [notes, setNotes] = useState({})
  const [busy, setBusy] = useState({})

  const fetchAlerts = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('storm_alerts')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
      if (error) throw error
      setAlerts(data || [])
    } catch (err) {
      toast.error(err.message || 'Failed to load storm alerts')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAlerts()
  }, [])

  const handleResolve = async (stormId, confirmed) => {
    const note = notes[stormId] || ''
    setBusy((prev) => ({ ...prev, [stormId]: true }))
    try {
      await resolveStorm(stormId, confirmed, note)
      toast.success(confirmed ? 'Storm confirmed & signals excluded' : 'Storm alert dismissed')
      setAlerts((prev) => prev.filter((a) => a.id !== stormId))
    } catch (err) {
      toast.error(err.message || 'Action failed')
    } finally {
      setBusy((prev) => ({ ...prev, [stormId]: false }))
    }
  }

  if (loading) {
    return <div className="p-4 font-mono text-xs text-[var(--color-ash)] animate-pulse">Scanning velocity alerts…</div>
  }

  if (alerts.length === 0) {
    return (
      <div className="card-surface p-8 text-center text-xs font-mono text-[var(--color-ash)]">
        No pending storm alerts detected.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {alerts.map((alert) => (
        <div key={alert.id} className="card-raised p-4 flex flex-col gap-3">
          <div className="flex justify-between items-start">
            <div>
              <span className="font-mono text-xs uppercase px-2 py-0.5 border border-[var(--color-blood)] text-[var(--color-blood)]">
                ⚠️ Storm Candidate
              </span>
              <h4 className="font-['Fraunces'] font-bold text-sm text-[var(--color-bone)] mt-2">
                Target: {alert.target_type} ({alert.target_id})
              </h4>
              <p className="font-mono text-xs text-[var(--color-ash)] mt-1">
                {alert.report_count} reports + {alert.reply_count} replies in 15-min window starting {new Date(alert.window_start).toLocaleTimeString()}
              </p>
            </div>
          </div>

          <textarea
            value={notes[alert.id] || ''}
            onChange={(e) => setNotes({ ...notes, [alert.id]: e.target.value })}
            placeholder="Add moderation note for resolution..."
            rows={2}
            className="w-full bg-[var(--color-void)] border border-[var(--color-line)] p-2 text-xs font-mono text-[var(--color-bone)] focus:border-[var(--color-ember)] outline-none"
          />

          <div className="flex gap-3 justify-end">
            <button
              onClick={() => handleResolve(alert.id, false)}
              disabled={busy[alert.id]}
              className="btn-vhs opacity-75 hover:opacity-100 disabled:opacity-50"
            >
              Dismiss — Legitimate Traffic
            </button>
            <button
              onClick={() => handleResolve(alert.id, true)}
              disabled={busy[alert.id]}
              className="btn-vhs disabled:opacity-50"
            >
              Confirm — Exclude Storm Signals
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
