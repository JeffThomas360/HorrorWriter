import { useState } from 'react'
import { searchUsers, assignRole, revokeRole } from '../../lib/modActions'
import { useModBadges } from '../../lib/useModBadges'

const ROLES = ['sentinel', 'moderator', 'warden']
const SCOPES = ['all', 'forum', 'library']

const FIELD = 'bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] border border-[var(--color-line)] px-3 py-2 text-sm focus:border-[var(--color-accent-crimson)] focus:outline-none'
const GHOST_BTN = 'border border-[var(--color-line)] px-3 py-2 font-mono text-xs uppercase tracking-wider text-[var(--color-text-primary)] transition-colors hover:border-white cursor-pointer disabled:opacity-50'

export default function RegistryTab({ profile }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const { data: badges } = useModBadges()

  const onSearch = async (e) => {
    e.preventDefault()
    setError(null); setBusy(true)
    try { setResults(await searchUsers(q.trim())) }
    catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  const apply = async (id, role, scope) => {
    setError(null); setBusy(true)
    try {
      if (role === '') await revokeRole(id)
      else await assignRole(id, role, scope)
      setResults(await searchUsers(q.trim()))
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={onSearch} className="flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by handle…" aria-label="Search users" className={`${FIELD} flex-1`} />
        <button type="submit" className={GHOST_BTN} disabled={busy || !q.trim()}>▸ Search</button>
      </form>
      {error && <p className="form-err font-mono text-xs text-[var(--color-accent-crimson)]">{error}</p>}
      <ul className="flex flex-col">
        {results.map((u) => (
          <RegistryRow key={u.id} user={u} self={u.id === profile.id} badges={badges} onApply={apply} busy={busy} />
        ))}
      </ul>
    </div>
  )
}

function RegistryRow({ user, self, badges, onApply, busy }) {
  const [role, setRole] = useState(user.mod_role ?? '')
  const [scope, setScope] = useState(user.mod_scope ?? 'all')
  const badge = badges?.find((b) => b.role === user.mod_role)
  const scoped = role === 'sentinel' || role === 'moderator'
  return (
    <li className="mod-user-row flex items-center justify-between gap-3 border-b border-[var(--color-line)] py-3">
      <span className="font-mono text-sm text-[var(--color-text-primary)]">
        @{user.handle} {badge && <span title={badge.label}>{badge.emoji}</span>}
      </span>
      {self ? (
        <span className="font-mono text-xs uppercase tracking-wider text-[var(--color-text-secondary)]">you (Keeper)</span>
      ) : (
        <span className="flex items-center gap-2">
          <select value={role} onChange={(e) => setRole(e.target.value)} aria-label={`Role for ${user.handle}`} className={FIELD}>
            <option value="">— none —</option>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          {scoped && (
            <select value={scope} onChange={(e) => setScope(e.target.value)} aria-label={`Scope for ${user.handle}`} className={FIELD}>
              {SCOPES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          <button type="button" className={GHOST_BTN} disabled={busy} onClick={() => onApply(user.id, role, scope)}>Save</button>
        </span>
      )}
    </li>
  )
}
