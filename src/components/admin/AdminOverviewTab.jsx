import { useQuery } from '@tanstack/react-query'
import { fetchSiteStats } from '../../lib/modActions'
import { fetchSiteSettings } from '../../lib/siteSettings'

const STAT_TILES = [
  { key: 'totalUsers', label: 'Registered users', jump: 'users' },
  { key: 'liveStories', label: 'Live stories' },
  { key: 'liveThreads', label: 'Live threads' },
  { key: 'liveCritiques', label: 'Live critiques' },
  { key: 'reportsHandled', label: 'Reports handled (all-time)' },
  { key: 'activeSanctions', label: 'Active sanctions', tone: 'alert' },
]

const EXTERNAL_LINKS = [
  { label: 'Supabase dashboard', href: 'https://supabase.com/dashboard/projects', hint: 'Database, auth, RLS, migrations' },
  { label: 'Cloudflare dashboard', href: 'https://dash.cloudflare.com/', hint: 'Workers deploys and Pages projects' },
  { label: 'GitHub', href: 'https://github.com/', hint: 'Source, commit history, Actions' },
]

function StatTile({ label, value, tone = 'default', onJump }) {
  const toneClass = tone === 'alert' && value > 0
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

export default function AdminOverviewTab({ onNavigate }) {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['admin', 'site-stats'],
    queryFn: fetchSiteStats,
    refetchInterval: 60_000,
  })

  const { data: settings } = useQuery({
    queryKey: ['site-settings'],
    queryFn: fetchSiteSettings,
  })

  const s = stats ?? { totalUsers: 0, liveStories: 0, liveThreads: 0, liveCritiques: 0, reportsHandled: 0, activeSanctions: 0 }

  return (
    <div className="flex flex-col gap-8">
      {/* Anything currently altering how the site behaves gets surfaced here so
          it can't be silently left on. */}
      {(settings?.maintenance_mode || settings?.registration_open === false || settings?.announcement_active) && (
        <div className="card-surface border border-[var(--color-ember)] p-4 flex flex-col gap-1">
          <span className="font-mono text-xs uppercase tracking-widest text-[var(--color-ember)]">▸ Active site overrides</span>
          <ul className="text-sm text-[var(--color-bone)] font-serif list-disc list-inside">
            {settings?.maintenance_mode && <li>Maintenance mode is <strong>on</strong> — visitors see a holding notice.</li>}
            {settings?.registration_open === false && <li>Registration is <strong>closed</strong> — no new signups.</li>}
            {settings?.announcement_active && <li>An announcement banner is live site-wide.</li>}
          </ul>
          <button
            type="button"
            onClick={() => onNavigate?.('site')}
            className="self-start mt-1 font-mono text-xs uppercase underline text-[var(--color-ash)] hover:text-[var(--color-bone)] cursor-pointer"
          >
            Manage in Site settings
          </button>
        </div>
      )}

      <div>
        <h3 className="font-mono text-xs uppercase tracking-widest text-[var(--color-ash)] mb-3">Site stats</h3>
        {isLoading ? (
          <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-ash)] animate-pulse">Reading the ledger…</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {STAT_TILES.map((t) => (
              <StatTile
                key={t.key}
                label={t.label}
                value={s[t.key]}
                tone={t.tone}
                onJump={t.jump ? () => onNavigate?.(t.jump) : undefined}
              />
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="font-mono text-xs uppercase tracking-widest text-[var(--color-ash)] mb-3">Infrastructure</h3>
        <div className="grid sm:grid-cols-3 gap-3">
          {EXTERNAL_LINKS.map((l) => (
            <a
              key={l.label}
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              className="card-surface p-4 flex flex-col gap-1 border border-[var(--color-line-hi)] hover:border-[var(--color-bone)] transition-colors"
            >
              <span className="font-mono text-xs uppercase tracking-wider text-[var(--color-bone)]">{l.label} ↗</span>
              <span className="text-xs text-[var(--color-ash)] font-serif">{l.hint}</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
