import { useEffect, useState } from 'react'
import { searchUsers, fetchActiveSanctions } from '../../lib/modActions'
import UserModProfile from './UserModProfile'

const GHOST = 'border border-[var(--color-line-hi)] px-3 py-2 font-mono text-xs uppercase tracking-wider text-[var(--color-bone)] transition-colors hover:border-[var(--color-bone)] cursor-pointer disabled:opacity-50'
const FIELD = 'bg-[var(--color-void)] border border-[var(--color-line)] px-3 py-2 text-sm text-[var(--color-bone)] focus:border-[var(--color-ember)] outline-none'

/**
 * Sanctions is a browse-and-search surface; the actual suspend/revoke
 * controls live in UserModProfile's case file (opened from either list here)
 * so there's exactly one place in the Terminal that can change a user's
 * sanction state, not two copies of the same logic drifting apart.
 */
export default function SanctionsTab() {
  const [roster, setRoster] = useState([])
  const [rosterLoading, setRosterLoading] = useState(true)
  const [q, setQ] = useState('')
  const [results, setResults] = useState(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState(null)
  const [activeUserId, setActiveUserId] = useState(null)

  const loadRoster = async () => {
    setRosterLoading(true)
    try {
      setRoster(await fetchActiveSanctions())
    } catch (err) {
      setError(err.message)
    } finally {
      setRosterLoading(false)
    }
  }

  useEffect(() => {
    loadRoster()
  }, [])

  const handleSearch = async (e) => {
    e.preventDefault()
    if (!q.trim()) return
    setSearching(true)
    setError(null)
    try {
      const cleaned = q.replace(/^@/, '').trim()
      setResults(await searchUsers(cleaned))
    } catch (err) {
      setError(err.message)
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start">
      <div className="flex flex-col gap-6 flex-[2] w-full min-w-0">
        <div>
          <h3 className="font-['Fraunces'] font-bold text-lg text-[var(--color-bone)] mb-1">Sanctions &amp; Suspensions</h3>
          <p className="text-sm text-[var(--color-ash)]">
            Search for a user to open their case file — suspensions, shadowbans and revokes all happen there.
          </p>
        </div>

        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by handle (e.g. spooky_writer)"
            className={`${FIELD} flex-1`}
            aria-label="Search users to sanction"
          />
          <button type="submit" className={GHOST} disabled={searching || !q.trim()}>{searching ? 'Searching…' : 'Search'}</button>
        </form>

        {error && <p className="text-sm text-[var(--color-blood)]">{error}</p>}

        {results && (
          <div>
            <h4 className="font-mono text-xs uppercase tracking-wider text-[var(--color-ash)] mb-2">Results ({results.length})</h4>
            {results.length === 0 ? (
              <p className="text-sm text-[var(--color-ash)] italic font-serif">No matching users.</p>
            ) : (
              <ul className="flex flex-col">
                {results.map((u) => (
                  <li key={u.id} className="mod-user-row flex items-center justify-between gap-3 border-b border-[var(--color-line)] py-3">
                    <span className="font-mono text-sm text-[var(--color-bone)]">@{u.handle}</span>
                    <button className={GHOST} onClick={() => setActiveUserId(u.id)}>Open case file</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div>
          <h4 className="font-mono text-xs uppercase tracking-wider text-[var(--color-ash)] mb-2">
            Currently sanctioned ({roster.length})
          </h4>
          {rosterLoading ? (
            <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-ash)] animate-pulse">Loading…</p>
          ) : roster.length === 0 ? (
            <p className="text-sm text-[var(--color-ash)] italic font-serif">Nobody is currently suspended.</p>
          ) : (
            <ul className="flex flex-col">
              {roster.map((u) => {
                const permanent = new Date(u.banned_until).getFullYear() >= 2099
                return (
                  <li key={u.id} className="mod-user-row flex items-center justify-between gap-3 border-b border-[var(--color-line)] py-3">
                    <span className="font-mono text-sm text-[var(--color-bone)]">@{u.handle}</span>
                    <span className="text-xs text-[var(--color-blood)]">
                      {permanent ? 'Permanent shadowban' : `Until ${new Date(u.banned_until).toLocaleString()}`}
                    </span>
                    <button className={GHOST} onClick={() => setActiveUserId(u.id)}>Open case file</button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      {activeUserId && (
        <div className="flex-1 w-full lg:sticky lg:top-6 lg:max-w-sm">
          <UserModProfile
            userId={activeUserId}
            onClose={() => {
              setActiveUserId(null)
              loadRoster()
            }}
          />
        </div>
      )}
    </div>
  )
}
