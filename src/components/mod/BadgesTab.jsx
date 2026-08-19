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

  if (isLoading) return <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-text-secondary)] animate-pulse">Loading badges…</p>

  const valueFor = (b) => draft[b.role] ?? { emoji: b.emoji, label: b.label }

  const inputClass = 'bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] border border-[var(--color-line)] px-2 py-1.5 text-sm focus:border-[var(--color-accent-crimson)] focus:outline-none'
  const btnClass = 'border border-[var(--color-line)] px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-[var(--color-text-primary)] transition-colors hover:border-white cursor-pointer disabled:opacity-50'

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
    <div className="flex flex-col gap-3">
      {error && <p className="form-err font-mono text-xs text-[var(--color-accent-crimson)]">{error}</p>}
      <ul className="flex flex-col">
        {(badges ?? []).map((b) => {
          const v = valueFor(b)
          const set = (patch) => setDraft((d) => ({ ...d, [b.role]: { ...v, ...patch } }))
          return (
            <li key={b.role} className="mod-user-row flex items-center justify-between gap-3 border-b border-[var(--color-line)] py-3">
              <span className="font-mono text-sm text-[var(--color-text-primary)]">{b.role}</span>
              <span className="flex items-center gap-2">
                <input value={v.emoji} onChange={(e) => set({ emoji: e.target.value })} aria-label={`Emoji for ${b.role}`} className={`${inputClass} w-14 text-center`} />
                <input value={v.label} onChange={(e) => set({ label: e.target.value })} aria-label={`Label for ${b.role}`} className={inputClass} />
                <button type="button" className={btnClass} disabled={busy === b.role || !draft[b.role]} onClick={() => save(b.role)}>Save</button>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
