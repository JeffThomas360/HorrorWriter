import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../components/AuthContext'
import { withProviders } from '../components/Providers'
import LoadError from '../components/LoadError'
import { fetchWaiting } from '../lib/firstReader'

function waitedFor(days) {
  if (days <= 0) return 'posted today'
  if (days === 1) return 'waiting 1 day'
  return `waiting ${days} days`
}

/**
 * Public work nobody has answered yet. The server renders the list (so it
 * works without JS and is never stale); once the visitor's session is known
 * the list is re-read *as them*, so RLS drops anyone they've blocked, and
 * their own posts are left out — this page is for reading other people.
 */
function FirstReader({ initialItems = null }) {
  const { user, isLoading: authLoading } = useAuth()
  const userId = user?.id ?? null

  const { data: items, isLoading, error, refetch } = useQuery({
    queryKey: ['first-reader', userId],
    queryFn: () => fetchWaiting({ excludeAuthor: userId }),
    enabled: !authLoading,
    // The server's list stands in until the visitor's own read arrives.
    initialData: !userId && initialItems ? initialItems : undefined,
    placeholderData: (prev) => prev ?? initialItems ?? undefined,
  })

  const list = items ?? initialItems

  if (!list && (isLoading || authLoading)) {
    return <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-text-secondary)] animate-pulse">Finding the unread…</p>
  }
  if (!list && error) {
    return (
      <LoadError
        title="The list didn't load"
        message="We couldn't find what's waiting just now. Check your connection, then try again."
        error={error}
        onRetry={() => refetch()}
      />
    )
  }

  if (list.length === 0) {
    return (
      <div className="vintage-card text-center py-12">
        <p className="font-serif text-lg text-[var(--color-text-primary)] mb-2">Everyone has a reader tonight.</p>
        <p className="font-serif italic text-sm text-[var(--color-text-secondary)] mb-6">Nothing posted in the last 30 days is waiting for a reply.</p>
        <a href="/forum/" className="border border-[var(--color-line)] hover:border-white font-mono text-xs uppercase px-4 py-2 transition-colors">Browse the Crypt</a>
      </div>
    )
  }

  return (
    <ul className="flex flex-col gap-4" aria-label="Work waiting for a first reader">
      {list.map((w) => (
        <li key={w.href}>
          <a href={w.href} className="vintage-card block hover:border-white transition-all">
            <span className="block font-mono text-xs tracking-wider text-[var(--color-text-secondary)] mb-2 font-bold uppercase">
              ▸ {w.kind} · {waitedFor(w.days)}
            </span>
            <span className="block text-lg font-serif font-bold leading-snug mb-1">{w.title}</span>
            <span className="block text-sm font-serif text-[var(--color-text-secondary)]">
              {w.handle ? `by @${w.handle}` : 'by a member'} · be the first to read it →
            </span>
          </a>
        </li>
      ))}
    </ul>
  )
}

export default withProviders(FirstReader)
