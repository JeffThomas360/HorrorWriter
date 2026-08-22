import { useQuery } from '@tanstack/react-query'
import { modCan } from '../../lib/moderation'
import { fetchOverviewCounts, fetchRecentModActions, contentHref } from '../../lib/modActions'

const ACTION_LABEL = {
  hide: 'hid',
  unhide: 'unhid',
  screen: 'screened',
  action_report: 'actioned a report on',
  dismiss_report: 'dismissed a report on',
  appeal_resolved: 'resolved an appeal on',
  pile_on_flag: 'flagged a pile-on pattern on',
}

function StatTile({ label, value, tone = 'default', onJump }) {
  const toneClass =
    tone === 'alert' && value > 0
      ? 'border-[var(--color-blood)] text-[var(--color-ember)]'
      : 'border-[var(--color-line-hi)] text-[var(--color-bone)]'
  return (
    <button
      type="button"
      onClick={onJump}
      disabled={!onJump}
      className={`card-surface flex flex-col items-start gap-1 p-4 text-left border ${toneClass} transition-colors ${onJump ? 'hover:border-[var(--color-bone)] cursor-pointer' : 'cursor-default'}`}
    >
      <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-ash)]">{label}</span>
      <span className="font-['Fraunces'] font-black text-3xl leading-none">{value}</span>
    </button>
  )
}

export default function OverviewTab({ profile, onNavigate }) {
  const canReadAudit = modCan(profile, 'read_audit', 'all')

  const { data: counts, isLoading: countsLoading } = useQuery({
    queryKey: ['mod', 'overview-counts'],
    queryFn: fetchOverviewCounts,
    refetchInterval: 60_000,
  })

  const { data: recent = [], isLoading: recentLoading } = useQuery({
    queryKey: ['mod', 'recent-actions'],
    queryFn: () => fetchRecentModActions(12),
    enabled: canReadAudit,
    refetchInterval: 60_000,
  })

  if (countsLoading) {
    return <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-ash)] animate-pulse">Reading the log…</p>
  }

  const c = counts ?? { openReports: 0, openAppeals: 0, openSupport: 0, pendingStorms: 0, activeSanctions: 0 }
  const nothingOpen = c.openReports === 0 && c.openAppeals === 0 && c.openSupport === 0 && c.pendingStorms === 0

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h3 className="font-mono text-xs uppercase tracking-widest text-[var(--color-ash)] mb-3">Queue status</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          <StatTile label="Open reports" value={c.openReports} tone="alert" onJump={() => onNavigate?.('reports')} />
          <StatTile label="Open appeals" value={c.openAppeals} tone="alert" onJump={() => onNavigate?.('appeals')} />
          <StatTile label="Storm alerts" value={c.pendingStorms} tone="alert" onJump={() => onNavigate?.('storms')} />
          <StatTile label="Support tickets" value={c.openSupport} tone="alert" onJump={() => onNavigate?.('support')} />
          <StatTile label="Active sanctions" value={c.activeSanctions} onJump={() => onNavigate?.('sanctions')} />
        </div>
        {nothingOpen && (
          <p className="mt-3 text-sm text-[var(--color-ash)] italic font-serif">The queue is quiet. Nothing open anywhere.</p>
        )}
      </div>

      <div>
        <h3 className="font-mono text-xs uppercase tracking-widest text-[var(--color-ash)] mb-3">Recent activity</h3>
        {!canReadAudit ? (
          <div className="card-surface p-4 text-sm text-[var(--color-ash)]">
            Requires Warden access to view the audit trail.
          </div>
        ) : recentLoading ? (
          <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-ash)] animate-pulse">Loading…</p>
        ) : recent.length === 0 ? (
          <div className="card-surface p-4 text-sm text-[var(--color-ash)] italic font-serif">No recorded actions yet.</div>
        ) : (
          <ul className="flex flex-col gap-2">
            {recent.map((a) => {
              const href = contentHref(a.target_type, a.target_id)
              return (
                <li key={a.id} className="card-surface flex flex-wrap items-baseline gap-x-2 gap-y-1 px-3 py-2 text-sm">
                  <span className="font-mono text-[var(--color-ash)]">{new Date(a.created_at).toLocaleString()}</span>
                  <span className="text-[var(--color-bone)]">
                    <span className="text-[var(--color-upside)]">@{a.profiles?.handle || 'system'}</span>{' '}
                    {ACTION_LABEL[a.action] || a.action.replace(/_/g, ' ')}{' '}
                    {a.target_type ? <span className="font-mono text-xs text-[var(--color-ash)]">{a.target_type}</span> : null}
                    {href && (
                      <a href={href} className="underline ml-1 hover:text-[var(--color-blood)]">view</a>
                    )}
                  </span>
                  {a.reason && <span className="basis-full text-xs text-[var(--color-ash)] italic">— {a.reason}</span>}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
