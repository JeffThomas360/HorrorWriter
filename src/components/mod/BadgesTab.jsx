import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useModBadges } from '../../lib/useModBadges'
import { setRoleBadge } from '../../lib/modActions'

export default function BadgesTab() {
  const { data: badges, isLoading } = useModBadges()
  const qc = useQueryClient()
  const [draft, setDraft] = useState({})       // role -> {emoji,label}
  const [busy, setBusy] = useState(null)        // role currently saving
  const [error, setError] = useState(null)

  if (isLoading) return <p className="status-panel-body">Loading badges…</p>

  const valueFor = (b) => draft[b.role] ?? { emoji: b.emoji, label: b.label }

  const save = async (role) => {
    const v = draft[role]; if (!v) return
    setError(null); setBusy(role)
    try {
      await setRoleBadge(role, v.emoji, v.label)
      await qc.invalidateQueries({ queryKey: ['mod_role_badges'] })
      setDraft((d) => { const n = { ...d }; delete n[role]; return n })
    } catch (err) { setError(err.message) }
    finally { setBusy(null) }
  }

  return (
    <div className="mod-badges">
      {error && <p className="form-err">{error}</p>}
      <ul className="mod-user-list">
        {(badges ?? []).map((b) => {
          const v = valueFor(b)
          const set = (patch) => setDraft((d) => ({ ...d, [b.role]: { ...v, ...patch } }))
          return (
            <li key={b.role} className="mod-user-row">
              <span className="mod-user-handle">{b.role}</span>
              <span className="mod-user-controls">
                <input value={v.emoji} onChange={(e) => set({ emoji: e.target.value })} aria-label={`Emoji for ${b.role}`} style={{ width: 56, textAlign: 'center' }} />
                <input value={v.label} onChange={(e) => set({ label: e.target.value })} aria-label={`Label for ${b.role}`} />
                <button type="button" className="btn ghost" disabled={busy === b.role || !draft[b.role]} onClick={() => save(b.role)}>Save</button>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
