import { useState } from 'react'
import { searchUsers, assignRole, revokeRole } from '../../lib/modActions'
import { useModBadges } from '../../lib/useModBadges'

const ROLES = ['sentinel', 'moderator', 'warden']
const SCOPES = ['all', 'forum', 'library']

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
    <div className="mod-registry">
      <form onSubmit={onSearch} className="mod-search">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by handle…" aria-label="Search users" />
        <button type="submit" className="btn ghost" disabled={busy || !q.trim()}>▸ Search</button>
      </form>
      {error && <p className="form-err">{error}</p>}
      <ul className="mod-user-list">
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
    <li className="mod-user-row">
      <span className="mod-user-handle">
        @{user.handle} {badge && <span title={badge.label}>{badge.emoji}</span>}
      </span>
      {self ? (
        <span className="mod-user-self">you (Keeper)</span>
      ) : (
        <span className="mod-user-controls">
          <select value={role} onChange={(e) => setRole(e.target.value)} aria-label={`Role for ${user.handle}`}>
            <option value="">— none —</option>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          {scoped && (
            <select value={scope} onChange={(e) => setScope(e.target.value)} aria-label={`Scope for ${user.handle}`}>
              {SCOPES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          <button type="button" className="btn ghost" disabled={busy} onClick={() => onApply(user.id, role, scope)}>Save</button>
        </span>
      )}
    </li>
  )
}
