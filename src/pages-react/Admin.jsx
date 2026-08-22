import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../components/AuthContext'
import { fetchSiteStats } from '../lib/modActions'
import { withProviders } from '../components/Providers'
import RequireAuth from '../components/RequireAuth'

const STAT_TILES = [
  { key: 'totalUsers', label: 'Registered users' },
  { key: 'liveStories', label: 'Live stories' },
  { key: 'liveThreads', label: 'Live threads' },
  { key: 'liveCritiques', label: 'Live critiques' },
  { key: 'reportsHandled', label: 'Reports handled (all-time)' },
  { key: 'activeSanctions', label: 'Active sanctions' },
]

// Generic dashboard homes, not deep-linked to a specific project — this repo
// has no project ref/repo URL recorded anywhere in the codebase to link to
// directly, so these just get the Keeper to the right front door in one click.
const EXTERNAL_LINKS = [
  { label: 'Supabase dashboard', href: 'https://supabase.com/dashboard/projects', hint: 'Database, auth, RLS, migrations, leaked-password protection toggle' },
  { label: 'Cloudflare dashboard', href: 'https://dash.cloudflare.com/', hint: 'Workers deploys, Pages projects (including the dormant one still pending cleanup)' },
  { label: 'GitHub', href: 'https://github.com/', hint: 'Source, commit history, Actions' },
]

function StatTile({ label, value, tone = 'default' }) {
  const toneClass = tone === 'alert' && value > 0
    ? 'border-[var(--color-blood)] text-[var(--color-ember)]'
    : 'border-[var(--color-line-hi)] text-[var(--color-bone)]'
  return (
    <div className={`card-surface flex flex-col items-start gap-1 p-4 border ${toneClass}`}>
      <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-ash)]">{label}</span>
      <span className="font-['Fraunces'] font-black text-3xl leading-none">{value}</span>
    </div>
  )
}

function Admin() {
  const { profile, isLoading } = useAuth()

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['admin', 'site-stats'],
    queryFn: fetchSiteStats,
    enabled: !isLoading && profile?.mod_role === 'keeper',
    refetchInterval: 60_000,
  })

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] mt-8">
        <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-ash)] animate-pulse">Loading…</p>
      </div>
    )
  }

  // Disguised 404 — this page exists for the Keeper only, everyone else (including
  // other mod roles) gets the same "doesn't exist" treatment as /moderation does.
  if (profile?.mod_role !== 'keeper') {
    return (
      <div className="vintage-card text-center py-16 border-red-950 mt-8 max-w-2xl mx-auto">
        <span className="block font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-ash)] mb-2">▸ 404 — page not found</span>
        <h2 className="text-xl font-serif mb-2">The page you're looking for doesn't exist.</h2>
        <p className="text-xs text-[var(--color-ash)] font-serif">Ensure you are logged in to the correct credentials.</p>
      </div>
    )
  }

  const s = stats ?? { totalUsers: 0, liveStories: 0, liveThreads: 0, liveCritiques: 0, reportsHandled: 0, activeSanctions: 0 }

  return (
    <div className="mt-8 max-w-5xl mx-auto flex flex-col gap-10">
      <div className="border-b border-[var(--color-line)] pb-6">
        <span className="block font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-ash)] mb-2">Keeper Only</span>
        <h2 className="text-3xl font-serif font-black">Site <em className="italic text-[var(--color-blood)] font-serif">Admin</em></h2>
        <p className="text-xs text-[var(--color-ash)] font-serif mt-1 font-mono">
          ▸ Site-wide stats and the tools this doesn't try to duplicate. Day-to-day moderation lives at{' '}
          <a href="/moderation" className="underline hover:text-[var(--color-blood)]">/moderation</a>.
        </p>
      </div>

      <div>
        <h3 className="font-mono text-xs uppercase tracking-widest text-[var(--color-ash)] mb-3">Site stats</h3>
        {statsLoading ? (
          <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-ash)] animate-pulse">Reading the ledger…</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {STAT_TILES.map((t) => (
              <StatTile key={t.key} label={t.label} value={s[t.key]} tone={t.key === 'activeSanctions' ? 'alert' : 'default'} />
            ))}
          </div>
        )}
      </div>

      <div className="card-surface border border-[var(--color-blood)] p-5 flex flex-col gap-2">
        <h3 className="font-mono text-xs uppercase tracking-widest text-[var(--color-ember)]">▸ Sanctions enforcement — needs a migration run</h3>
        <p className="text-sm text-[var(--color-bone)] font-serif">
          The Sanctions tab has always written a suspension or ban to <code className="text-xs font-mono">profiles.banned_until</code>,
          but nothing else in the schema ever read that column — a suspended or permanently banned user could still post normally, and
          their content stayed fully visible to everyone. A migration fixing this is sitting at{' '}
          <code className="text-xs font-mono">supabase/migrations/20260822000000_enforce_sanctions.sql</code>: it adds an{' '}
          <code className="text-xs font-mono">is_banned()</code> helper, extends <code className="text-xs font-mono">content_visible()</code> to
          hide a banned author's content, and extends every content insert policy to reject a banned author's new posts.
        </p>
        <p className="text-sm text-[var(--color-ash)] font-serif">
          I can't apply this myself — it needs to be run against the live database from your Supabase project (SQL editor, or your usual
          migration push). Until it's run, any active suspension or ban shown in Sanctions is cosmetic only.
        </p>
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
        <p className="mt-3 text-xs text-[var(--color-ash)] font-serif italic">
          These are general dashboard links, not deep links into this project specifically — nothing in the codebase records a
          project ref or repo URL to link to directly.
        </p>
      </div>
    </div>
  )
}

function AdminWithAuth(props) {
  return (
    <RequireAuth>
      <Admin {...props} />
    </RequireAuth>
  )
}

export default withProviders(AdminWithAuth)
