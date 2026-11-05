import { useQuery } from '@tanstack/react-query'
import { fetchPulse } from '../../lib/pulse'

const TILES = [
  { key: 'newMembers', label: 'New members' },
  { key: 'firstTimePosters', label: 'First-time posters' },
  { key: 'ritualEntries', label: 'Ritual entries' },
  { key: 'critiques', label: 'Replies & critiques' },
]

function daysAgo(t) {
  const d = Math.floor((Date.now() - new Date(t).getTime()) / (24 * 60 * 60 * 1000))
  return d <= 0 ? 'today' : d === 1 ? '1 day ago' : `${d} days ago`
}

function Trend({ now, before }) {
  if (now === before) return <span className="text-[var(--color-ash)]">same as last week</span>
  const up = now > before
  return (
    <span className={up ? 'text-[var(--color-upside)]' : 'text-[var(--color-ash)]'}>
      {up ? '▲' : '▼'} {Math.abs(now - before)} vs last week ({before})
    </span>
  )
}

function Section({ title, hint, children }) {
  return (
    <div className="card-surface border border-[var(--color-line-hi)] p-4 flex flex-col gap-2">
      <span className="font-mono text-xs uppercase tracking-widest text-[var(--color-bone)]">{title}</span>
      {hint && <p className="text-xs text-[var(--color-ash)] font-serif">{hint}</p>}
      {children}
    </div>
  )
}

/**
 * This week at a glance, for the Keeper. Counts and two short "could use a
 * welcome" lists — nothing about what any one member reads or how long they
 * stay. See src/lib/pulse.js.
 */
export default function PulsePanel() {
  const { data: pulse, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'pulse'],
    queryFn: () => fetchPulse(),
    refetchInterval: 5 * 60_000,
  })

  return (
    <div>
      <h3 className="font-mono text-xs uppercase tracking-widest text-[var(--color-ash)] mb-3">Pulse · last 7 days</h3>
      {isLoading ? (
        <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-ash)] animate-pulse">Taking the pulse…</p>
      ) : error ? (
        <div role="alert" className="flex flex-col items-start gap-2">
          <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-ember)]">Couldn't read the pulse: {error.message}</p>
          <button type="button" onClick={() => refetch()} className="font-mono text-xs uppercase underline text-[var(--color-ash)] hover:text-[var(--color-bone)] cursor-pointer">Try again</button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {TILES.map((t) => (
              <div key={t.key} data-testid={`pulse-${t.key}`} className="card-surface flex flex-col items-start gap-1 p-4 border border-[var(--color-line-hi)]">
                <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-ash)]">{t.label}</span>
                <span className="font-['Fraunces'] font-black text-3xl leading-none text-[var(--color-bone)]">{pulse[t.key].this}</span>
                <span className="font-mono text-[10px]"><Trend now={pulse[t.key].this} before={pulse[t.key].last} /></span>
              </div>
            ))}
          </div>

          {pulse.firstTimersThisWeek.length > 0 && (
            <p className="text-sm font-serif text-[var(--color-bone)]">
              Posted for the first time this week:{' '}
              {pulse.firstTimersThisWeek.map((h, i) => (
                <span key={h}>{i > 0 && ', '}<a className="underline" href={`/u/${encodeURIComponent(h)}/`}>@{h}</a></span>
              ))}
            </p>
          )}

          <div className="grid sm:grid-cols-2 gap-3">
            <Section title={`Waiting for a reply (${pulse.waiting.length})`} hint="Posted 2–30 days ago and nobody has answered yet. Longest wait first.">
              {pulse.waiting.length === 0 ? (
                <p className="text-sm font-serif text-[var(--color-ash)]">Everyone has heard back.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {pulse.waiting.slice(0, 10).map((w) => (
                    <li key={w.href} className="text-sm font-serif">
                      <a href={w.href} className="underline text-[var(--color-bone)]">{w.title}</a>
                      <span className="text-xs text-[var(--color-ash)]"> · {w.kind}{w.handle ? ` by @${w.handle}` : ''} · {daysAgo(w.created_at)}</span>
                    </li>
                  ))}
                  {pulse.waiting.length > 10 && <li className="text-xs text-[var(--color-ash)]">and {pulse.waiting.length - 10} more</li>}
                </ul>
              )}
            </Section>

            <Section title={`New and not yet posted (${pulse.quietNewcomers.length})`} hint="Joined in the last two weeks. A hello can help; no need to chase.">
              {pulse.quietNewcomers.length === 0 ? (
                <p className="text-sm font-serif text-[var(--color-ash)]">No one waiting in the wings.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {pulse.quietNewcomers.slice(0, 10).map((m) => (
                    <li key={m.handle} className="text-sm font-serif">
                      <a href={m.href} className="underline text-[var(--color-bone)]">@{m.handle}</a>
                      <span className="text-xs text-[var(--color-ash)]"> · joined {daysAgo(m.created_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>
        </div>
      )}
    </div>
  )
}
