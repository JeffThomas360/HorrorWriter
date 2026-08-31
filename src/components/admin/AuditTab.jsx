import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchAuditLog } from '../../lib/siteSettings'
import { contentHref } from '../../lib/modActions'

/**
 * The full audit trail. The Terminal's Overview tab shows the most recent
 * dozen; this is the searchable version, filterable by action type.
 *
 * Capped at the most recent 200 entries and filtered client-side — correct at
 * this site's action volume, and the cap is stated in the UI rather than
 * silently truncating.
 */

const ACTION_LABEL = {
  hide: 'hid',
  unhide: 'unhid',
  screen: 'screened',
  action_report: 'actioned a report on',
  dismiss_report: 'dismissed a report on',
  appeal_resolved: 'resolved an appeal on',
  pile_on_flag: 'flagged a pile-on pattern on',
  site_setting_changed: 'changed a site setting',
}

const LIMIT = 200

export default function AuditTab() {
  const [query, setQuery] = useState('')
  const [actionFilter, setActionFilter] = useState('all')

  const { data: entries = [], isLoading, error } = useQuery({
    queryKey: ['admin', 'audit-log'],
    queryFn: () => fetchAuditLog({ limit: LIMIT }),
  })

  const actionTypes = useMemo(
    () => Array.from(new Set(entries.map((e) => e.action))).sort(),
    [entries]
  )

  const rows = useMemo(() => {
    let out = entries
    if (actionFilter !== 'all') out = out.filter((e) => e.action === actionFilter)
    const q = query.trim().toLowerCase()
    if (q) {
      out = out.filter((e) =>
        (e.profiles?.handle || '').toLowerCase().includes(q) ||
        (e.reason || '').toLowerCase().includes(q) ||
        (e.target_type || '').toLowerCase().includes(q)
      )
    }
    return out
  }, [entries, actionFilter, query])

  if (isLoading) {
    return <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-ash)] animate-pulse">Reading the log…</p>
  }

  if (error) {
    return <div className="card-error p-4 text-sm">Could not load the audit log: {error.message}</div>
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          aria-label="Search the audit log"
          placeholder="Search actor, reason, target…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="card-surface px-3 py-2 text-sm border border-[var(--color-line-hi)] focus:border-[var(--color-bone)] outline-none flex-1 min-w-[12rem]"
        />
        <select
          aria-label="Filter by action type"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="card-surface px-3 py-2 text-xs font-mono uppercase border border-[var(--color-line-hi)] cursor-pointer"
        >
          <option value="all">All actions</option>
          {actionTypes.map((a) => <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>)}
        </select>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-[var(--color-ash)] italic font-serif py-6 text-center">
          {entries.length === 0 ? 'No recorded actions yet.' : 'Nothing matches that filter.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((a) => {
            const href = contentHref(a.target_type, a.target_id)
            return (
              <li key={a.id} className="card-surface flex flex-wrap items-baseline gap-x-2 gap-y-1 px-3 py-2 text-sm">
                <span className="font-mono text-xs text-[var(--color-ash)]">{new Date(a.created_at).toLocaleString()}</span>
                <span className="text-[var(--color-bone)]">
                  <span className="text-[var(--color-upside)]">@{a.profiles?.handle || 'system'}</span>{' '}
                  {ACTION_LABEL[a.action] || a.action.replace(/_/g, ' ')}{' '}
                  {a.target_type ? <span className="font-mono text-xs text-[var(--color-ash)]">{a.target_type}</span> : null}
                  {href && <a href={href} className="underline ml-1 hover:text-[var(--color-blood)]">view</a>}
                </span>
                {a.reason && <span className="basis-full text-xs text-[var(--color-ash)] italic">— {a.reason}</span>}
              </li>
            )
          })}
        </ul>
      )}

      <p className="text-xs text-[var(--color-ash)] font-mono">
        Showing {rows.length} of {entries.length} most recent{entries.length >= LIMIT ? ` (capped at ${LIMIT})` : ''}.
      </p>
    </div>
  )
}
