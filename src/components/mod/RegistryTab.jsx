import { useState } from 'react'
import { searchUsers, assignRole, revokeRole } from '../../lib/modActions'
import { useModBadges } from '../../lib/useModBadges'
import ConfirmDialog from './ConfirmDialog'

const ROLES = ['sentinel', 'moderator', 'warden']
const SCOPES = ['all', 'forum', 'library']

const FIELD = 'bg-[var(--color-void)] text-[var(--color-bone)] border border-[var(--color-line)] px-3 py-2 text-sm focus:border-[var(--color-ember)] outline-none'
const GHOST_BTN = 'border border-[var(--color-line-hi)] px-3 py-2 font-mono text-xs uppercase tracking-wider text-[var(--color-bone)] transition-colors hover:border-[var(--color-bone)] cursor-pointer disabled:opacity-50'

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
      {error && <p className="text-sm text-[var(--color-blood)]">{error}</p>}
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
  const [pendingApply, setPendingApply] = useState(false)
  const badge = badges?.find((b) => b.role === user.mod_role)
  const scoped = role === 'sentinel' || role === 'moderator'
  const isDemotion = user.mod_role && role !== user.mod_role

  const doApply = () => {
    setPendingApply(false)
    onApply(user.id, role, scope)
  }

  return (
    <li className="mod-user-row flex items-center justify-between gap-3 border-b border-[var(--color-line)] py-3">
      <ConfirmDialog
        open={pendingApply}
        title={role === '' ? `Revoke @${user.handle}'s moderation role?` : `Set @${user.handle} to ${role} (${scope})?`}
        danger={role === ''}
        confirmLabel={role === '' ? 'Revoke' : 'Save'}
        busy={busy}
        onCancel={() => setPendingApply(false)}
        onConfirm={doApply}
      />
      <span className="font-mono text-sm text-[var(--color-bone)]">
        @{user.handle} {badge && <span title={badge.label}>{badge.emoji}</span>}
      </span>
      {self ? (
        <span className="font-mono text-xs uppercase tracking-wider text-[var(--color-ash)]">you (Keeper)</span>
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
          <button
            type="button"
            className={GHOST_BTN}
            disabled={busy}
            onClick={() => (isDemotion || role === '' ? setPendingApply(true) : onApply(user.id, role, scope))}
          >
            Save
          </button>
        </span>
      )}
    </li>
  )
}
