import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchAllUsers } from '../../lib/siteSettings'
import UserModProfile from '../mod/UserModProfile'

/**
 * The user directory — the one thing Registry never offered: a way to *browse*
 * the userbase rather than search it by exact handle.
 *
 * Sorting and filtering are client-side. That is the right call up to a few
 * thousand rows; this site is sized for dozens. Swap fetchAllUsers to a
 * .range() query if that ever changes.
 *
 * Clicking a row opens the existing moderation case file rather than a second
 * user-detail view.
 */

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'staff', label: 'Staff' },
  { id: 'sanctioned', label: 'Sanctioned' },
  { id: 'screened', label: 'Screened' },
]

const SORTS = [
  { id: 'newest', label: 'Newest' },
  { id: 'oldest', label: 'Oldest' },
  { id: 'handle', label: 'Handle A–Z' },
]

function sanctionState(u) {
  if (u.banned_until && new Date(u.banned_until) > new Date()) {
    const until = new Date(u.banned_until)
    // The UI writes year 9999 for a permanent ban.
    return until.getFullYear() > 9000 ? 'Banned' : `Suspended → ${until.toLocaleDateString()}`
  }
  if (u.is_shadowbanned) return 'Shadowbanned'
  return null
}

export default function UsersTab() {
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('newest')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(null)

  const { data: users = [], isLoading, error } = useQuery({
    queryKey: ['admin', 'all-users'],
    queryFn: fetchAllUsers,
  })

  const rows = useMemo(() => {
    let out = users

    if (filter === 'staff') out = out.filter((u) => u.mod_role)
    else if (filter === 'sanctioned') out = out.filter((u) => sanctionState(u))
    else if (filter === 'screened') out = out.filter((u) => u.requires_screening)

    const q = query.trim().toLowerCase()
    if (q) {
      out = out.filter((u) =>
        (u.handle || '').toLowerCase().includes(q) ||
        (u.display_name || '').toLowerCase().includes(q)
      )
    }

    const sorted = [...out]
    if (sort === 'newest') sorted.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    else if (sort === 'oldest') sorted.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    else sorted.sort((a, b) => (a.handle || '').localeCompare(b.handle || ''))

    return sorted
  }, [users, filter, sort, query])

  if (selected) {
    return (
      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => setSelected(null)}
          className="self-start font-mono text-xs uppercase text-[var(--color-ash)] hover:text-[var(--color-bone)] cursor-pointer"
        >
          ← Back to directory
        </button>
        <UserModProfile userId={selected} onClose={() => setSelected(null)} />
      </div>
    )
  }

  if (isLoading) {
    return <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-ash)] animate-pulse">Counting the coven…</p>
  }

  if (error) {
    return <div className="card-error p-4 text-sm">Could not load the directory: {error.message}</div>
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          aria-label="Search the user directory"
          placeholder="Search handle or name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="card-surface px-3 py-2 text-sm border border-[var(--color-line-hi)] focus:border-[var(--color-bone)] outline-none flex-1 min-w-[12rem]"
        />
        <select
          aria-label="Sort users"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="card-surface px-3 py-2 text-xs font-mono uppercase border border-[var(--color-line-hi)] cursor-pointer"
        >
          {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            className={`font-mono text-[10px] uppercase tracking-wider px-3 py-1.5 border cursor-pointer transition-colors ${filter === f.id ? 'bg-[var(--color-blood)] text-[var(--color-bone)] border-[var(--color-blood)]' : 'border-[var(--color-line-hi)] text-[var(--color-ash)] hover:text-[var(--color-bone)]'}`}
          >
            {f.label}
          </button>
        ))}
        <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-ash)] self-center ml-auto">
          {rows.length} of {users.length}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-[var(--color-ash)] italic font-serif py-6 text-center">No accounts match that.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-line)] text-left">
                <th className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-ash)] py-2 pr-3">Handle</th>
                <th className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-ash)] py-2 pr-3">Role</th>
                <th className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-ash)] py-2 pr-3">Status</th>
                <th className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-ash)] py-2">Joined</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => {
                const sanction = sanctionState(u)
                return (
                  <tr
                    key={u.id}
                    onClick={() => setSelected(u.id)}
                    className="admin-user-row border-b border-[var(--color-line)] hover:bg-[var(--color-raised)] cursor-pointer"
                  >
                    <td className="py-2 pr-3">
                      <button
                        type="button"
                        aria-label={`Open case file for ${u.handle}`}
                        className="text-[var(--color-bone)] hover:text-[var(--color-blood)] cursor-pointer"
                      >
                        @{u.handle}
                        {u.display_name && (
                          <span className="text-[var(--color-ash)] ml-2 text-xs">{u.display_name}</span>
                        )}
                      </button>
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs text-[var(--color-upside)]">
                      {u.mod_role ? u.mod_role.toUpperCase() : <span className="text-[var(--color-ash)]">—</span>}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">
                      {sanction
                        ? <span className="text-[var(--color-ember)]">{sanction}</span>
                        : u.requires_screening
                          ? <span className="text-[var(--color-ash)]">Screened</span>
                          : <span className="text-[var(--color-ash)]">—</span>}
                    </td>
                    <td className="py-2 font-mono text-xs text-[var(--color-ash)]">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
