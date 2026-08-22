import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../supabaseClient'
import { resolveReport, contentHref } from '../../lib/modActions'
import UserModProfile from './UserModProfile'
import ConfirmDialog from './ConfirmDialog'
import { toast } from 'sonner'

const MOD_MACROS = ['Spam', 'House Rules Violation', 'Plagiarism', 'False Flag']
const TARGET_TYPES = ['story', 'critique', 'thread', 'post', 'user']

const GHOST = 'border border-[var(--color-line-hi)] px-2 py-1 text-xs text-[var(--color-bone)] transition-colors hover:border-[var(--color-bone)] cursor-pointer disabled:opacity-50'
const FIELD = 'bg-[var(--color-void)] border border-[var(--color-line)] px-3 py-2 text-sm text-[var(--color-bone)] focus:border-[var(--color-ember)] outline-none'

export default function ReportsTab() {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeContextUserId, setActiveContextUserId] = useState(null)
  const [customTarget, setCustomTarget] = useState(null) // report id awaiting a custom-reason confirm
  const [busy, setBusy] = useState(false)

  const [typeFilter, setTypeFilter] = useState('all')
  const [urgentOnly, setUrgentOnly] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    fetchReports()
  }, [])

  const fetchReports = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('reports')
      .select('*, profiles!reporter_id(handle)')
      .neq('target_type', 'site')
      .neq('target_type', 'appeal')
      .eq('status', 'open')
      .order('created_at', { ascending: false })

    if (error) {
      setError(error.message)
    } else {
      const sorted = [...data].sort((a, b) => {
        if (a.category === 'urgent' && b.category !== 'urgent') return -1
        if (b.category === 'urgent' && a.category !== 'urgent') return 1
        return 0
      })
      setReports(sorted)
    }
    setLoading(false)
  }

  const filtered = useMemo(() => {
    return reports.filter((r) => {
      if (typeFilter !== 'all' && r.target_type !== typeFilter) return false
      if (urgentOnly && r.category !== 'urgent') return false
      if (query.trim()) {
        const q = query.trim().toLowerCase()
        const haystack = `${r.category} ${r.details || ''} ${r.profiles?.handle || ''}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [reports, typeFilter, urgentOnly, query])

  const handleResolve = async (id, actionTaken, note = null) => {
    try {
      await resolveReport(id, actionTaken, note)
      setReports((prev) => prev.filter((r) => r.id !== id))
      toast.success(`Report ${actionTaken}`)
    } catch (err) {
      toast.error(err.message)
    }
  }

  const confirmCustomAction = async (reason) => {
    if (!customTarget) return
    setBusy(true)
    await handleResolve(customTarget, 'actioned', reason)
    setBusy(false)
    setCustomTarget(null)
  }

  const renderTargetLink = (type, id) => {
    const href = contentHref(type, id)
    if (href) return <a href={href} className="underline hover:text-[var(--color-blood)]">View Content</a>
    if (type === 'user') return <button className={GHOST} onClick={() => setActiveContextUserId(id)}>View User Context</button>
    return id
  }

  if (loading) return <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-ash)] animate-pulse">Loading reports…</p>
  if (error) return <p className="text-sm text-[var(--color-blood)]">{error}</p>

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start">
      <ConfirmDialog
        open={!!customTarget}
        title="Custom action"
        description="Records this as an actioned report and notifies the reporter."
        requireReason
        reasonLabel="What action was taken?"
        confirmLabel="Action"
        danger
        busy={busy}
        onCancel={() => setCustomTarget(null)}
        onConfirm={confirmCustomAction}
      />

      <div className="flex flex-col gap-4 flex-[2] w-full min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={FIELD} aria-label="Filter by content type">
            <option value="all">All types</option>
            {TARGET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <label className="flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-[var(--color-ash)] cursor-pointer">
            <input type="checkbox" checked={urgentOnly} onChange={(e) => setUrgentOnly(e.target.checked)} />
            Urgent only
          </label>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search reporter, category, details…"
            className={`${FIELD} flex-1 min-w-[10rem]`}
            aria-label="Search reports"
          />
          <span className="font-mono text-xs text-[var(--color-ash)]">{filtered.length} of {reports.length}</span>
        </div>

        {reports.length === 0 ? (
          <p className="text-sm text-[var(--color-ash)] italic font-serif">The queue is quiet. No open reports.</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-[var(--color-ash)] italic font-serif">No reports match these filters.</p>
        ) : (
          filtered.map((r) => (
            <div
              key={r.id}
              className={`card-surface p-4 ${r.category === 'urgent' ? 'border-[var(--color-blood)] bg-[rgba(200,16,46,0.06)]' : ''}`}
            >
              <div className="flex justify-between mb-2">
                <strong className="font-mono text-sm text-[var(--color-bone)]">{r.target_type.toUpperCase()} — {r.category}</strong>
                <span className="font-mono text-xs text-[var(--color-ash)]">{new Date(r.created_at).toLocaleString()}</span>
              </div>
              <p className="text-sm text-[var(--color-bone)] my-2">
                <strong>Reporter:</strong> {r.profiles?.handle ? `@${r.profiles.handle}` : 'Unknown'}
              </p>
              <p className="text-sm text-[var(--color-bone)] my-2">
                <strong>Details:</strong> {r.details || 'None provided'}
              </p>
              <div className="flex flex-wrap items-center gap-2 mt-3">
                {renderTargetLink(r.target_type, r.target_id)}
                <div className="flex-1" />
                <button className={GHOST} onClick={() => handleResolve(r.id, 'dismissed', 'Dismissed without action')}>Dismiss</button>
                {MOD_MACROS.map((m) => (
                  <button key={m} className={GHOST} onClick={() => handleResolve(r.id, 'actioned', m)}>{m}</button>
                ))}
                <button className="btn-vhs" onClick={() => setCustomTarget(r.id)}>Custom Action…</button>
              </div>
            </div>
          ))
        )}
      </div>

      {activeContextUserId && (
        <div className="flex-1 w-full lg:sticky lg:top-6 lg:max-w-sm">
          <UserModProfile userId={activeContextUserId} onClose={() => setActiveContextUserId(null)} />
        </div>
      )}
    </div>
  )
}
