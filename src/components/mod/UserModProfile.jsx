import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../AuthContext'
import { modCan, isPermanentBan } from '../../lib/moderation'
import { fetchUserCaseFile, contentHref, applyUserSanction, revokeUserSanction } from '../../lib/modActions'
import { authorLabel } from '../../lib/storyHelpers'
import ConfirmDialog from './ConfirmDialog'
import CaseFileTabs from './CaseFileTabs'
import UserSubmissions from './UserSubmissions'

const CASE_FILE_TABS = [
  { id: 'admin', label: 'Administrative' },
  { id: 'submissions', label: 'Submissions' },
]

const GHOST_BTN = 'border border-[var(--color-line-hi)] px-3 py-2 font-mono text-xs uppercase tracking-wider text-[var(--color-bone)] transition-colors hover:border-[var(--color-bone)] cursor-pointer disabled:opacity-50'

const SANCTION_OPTIONS = [
  { key: '1d', label: '1 Day', days: 1 },
  { key: '7d', label: '7 Days', days: 7 },
  { key: '30d', label: '30 Days', days: 30 },
  { key: 'perm', label: 'Permanent Ban', days: null },
]

/** How long a logged sanction was for, from the metadata mod_apply_sanction wrote. */
function sanctionDuration(a) {
  if (a.action === 'ban') return 'permanent'
  if (a.action !== 'suspend' || !a.metadata?.days) return null
  return a.metadata.days === 1 ? '1 day' : `${a.metadata.days} days`
}

/**
 * The moderation "case file" for one user. The Administrative tab has identity,
 * current sanction status with quick sanction actions, reports filed against them,
 * reports they've filed themselves (for spotting bad-faith reporters), the audit
 * trail of actions taken against them (Warden+ only), and free-form mod notes. The
 * Submissions tab lists what they've put on the site.
 *
 * Used as a slide-in drawer from Reports/Sanctions ("View User Context") and
 * can be dropped in anywhere a userId is known.
 */
export default function UserModProfile({ userId, onClose }) {
  const { user, profile: viewerProfile } = useAuth()
  const canReadAudit = modCan(viewerProfile, 'read_audit', 'all')
  const canSanction = modCan(viewerProfile, 'ban', 'all')

  const [profile, setProfile] = useState(null)
  const [caseFile, setCaseFile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [newNote, setNewNote] = useState('')
  const [pendingSanction, setPendingSanction] = useState(null) // a SANCTION_OPTIONS entry, or { key: 'revoke', label }
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState('admin')

  const load = async () => {
    if (!userId) return
    setLoading(true)
    const [profRes, cf] = await Promise.all([
      supabase.rpc('mod_get_profile', { p_id: userId }).single(),
      fetchUserCaseFile(userId, { includeAudit: canReadAudit }),
    ])
    if (profRes.data) setProfile(profRes.data)
    setCaseFile(cf)
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const handleAddNote = async (e) => {
    e.preventDefault()
    if (!newNote.trim()) return
    const { data, error } = await supabase.from('mod_notes').insert([{
      target_user_id: userId,
      author_id: user.id,
      note: newNote.trim()
    }]).select('*, profiles!author_id(handle)').single()

    if (error) toast.error(error.message)
    else {
      setCaseFile((cf) => ({ ...cf, notes: [data, ...(cf?.notes ?? [])] }))
      setNewNote('')
    }
  }

  const isSanctioned = profile?.banned_until && new Date(profile.banned_until) > new Date()
  const isPermanent = isPermanentBan(profile?.banned_until)
  const revokeLabel = isPermanent ? 'Revoke Ban' : 'Revoke Suspension'

  const confirmSanction = async (reason) => {
    const choice = pendingSanction
    setBusy(true)
    try {
      if (choice.key === 'revoke') {
        await revokeUserSanction(userId, reason)
        toast.success(isPermanent ? 'Ban revoked' : 'Suspension revoked')
      } else {
        await applyUserSanction(userId, choice.days, reason)
        toast.success(choice.key === 'perm' ? 'User permanently banned' : `User suspended for ${choice.label}`)
      }
    } catch (err) {
      toast.error(err.message)
      return
    } finally {
      setBusy(false)
      setPendingSanction(null)
    }
    // Re-read rather than assume: this shows the saved status and the new log row.
    await load()
  }

  const dialogTitle = (handle) => {
    if (pendingSanction?.key === 'revoke') return `${revokeLabel} on @${handle}?`
    if (pendingSanction?.key === 'perm') return `Permanently ban @${handle}?`
    return `Suspend @${handle} for ${pendingSanction?.label}?`
  }

  if (loading) {
    return (
      <div className="card-raised p-6">
        <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-ash)] animate-pulse">Loading case file…</p>
      </div>
    )
  }
  if (!profile) {
    return (
      <div className="card-raised p-6">
        <p className="text-sm text-[var(--color-blood)]">User not found.</p>
        {onClose && <button onClick={onClose} className={`${GHOST_BTN} mt-3`}>Close</button>}
      </div>
    )
  }

  return (
    <div className="card-raised flex flex-col gap-6 p-5 max-h-[calc(100vh-6rem)] overflow-y-auto">
      <ConfirmDialog
        open={!!pendingSanction}
        title={dialogTitle(profile.handle)}
        description={pendingSanction?.key === 'perm' ? "They can't post, and their writing is hidden from readers, with no end date. It can be revoked here later, but treat it as a last resort." : undefined}
        danger={pendingSanction?.key === 'perm'}
        requireReason
        reasonLabel="Reason (kept in the case file, not published)"
        confirmLabel={pendingSanction?.label}
        busy={busy}
        onCancel={() => setPendingSanction(null)}
        onConfirm={confirmSanction}
      />

      <div className="flex items-center justify-between gap-3">
        <h3 className="font-['Fraunces'] font-bold text-lg text-[var(--color-bone)]">
          @{profile.handle}
        </h3>
        {onClose && <button onClick={onClose} className={GHOST_BTN} aria-label="Close case file">✕</button>}
      </div>

      <CaseFileTabs label="Case file sections" idPrefix="case-file" tabs={CASE_FILE_TABS} active={tab} onChange={setTab} />

      <div role="tabpanel" id="case-file-panel" aria-labelledby={`case-file-tab-${tab}`}>
        {tab === 'submissions' ? (
          <UserSubmissions userId={userId} bannedUntil={profile.banned_until} />
        ) : (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="block font-mono text-[10px] uppercase tracking-wider text-[var(--color-ash)]">Joined</span>
                <span className="text-[var(--color-bone)]">{new Date(profile.created_at).toLocaleDateString()}</span>
              </div>
              <div>
                <span className="block font-mono text-[10px] uppercase tracking-wider text-[var(--color-ash)]">Status</span>
                {isSanctioned ? (
                  <span className="text-[var(--color-blood)]">
                    {isPermanent ? 'Permanently banned' : `Suspended until ${new Date(profile.banned_until).toLocaleString()}`}
                  </span>
                ) : (
                  <span className="text-[var(--color-upside)]">Active</span>
                )}
              </div>
            </div>

            {canSanction ? (
              <div className="flex flex-wrap gap-2">
                {SANCTION_OPTIONS.map((opt) => (
                  <button key={opt.key} className={GHOST_BTN} onClick={() => setPendingSanction(opt)}>{opt.label}</button>
                ))}
                {isSanctioned && (
                  <button className={GHOST_BTN} disabled={busy} onClick={() => setPendingSanction({ key: 'revoke', label: revokeLabel })}>{revokeLabel}</button>
                )}
              </div>
            ) : (
              <p className="text-xs text-[var(--color-ash)]">Suspending or banning requires Warden access.</p>
            )}

            <section>
              <h4 className="font-mono text-xs uppercase tracking-wider text-[var(--color-ash)] border-b border-[var(--color-line)] pb-2 mb-2">
                Reports against this user ({caseFile?.reportsAgainst.length ?? 0})
              </h4>
              {(caseFile?.reportsAgainst.length ?? 0) === 0 ? (
                <p className="text-xs text-[var(--color-ash)] italic font-serif">None on file.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {caseFile.reportsAgainst.map((r) => (
                    <li key={r.id} className="text-xs text-[var(--color-bone)]">
                      <span className="font-mono text-[var(--color-ash)]">{new Date(r.created_at).toLocaleDateString()}</span>{' '}
                      <span className="uppercase text-[var(--color-blood)]">{r.category}</span> — {r.details || 'no details'}{' '}
                      <span className="font-mono text-[var(--color-ash)]">[{r.status}]</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h4 className="font-mono text-xs uppercase tracking-wider text-[var(--color-ash)] border-b border-[var(--color-line)] pb-2 mb-2">
                Reports filed by this user ({caseFile?.reportsFiled.length ?? 0})
              </h4>
              {(caseFile?.reportsFiled.length ?? 0) === 0 ? (
                <p className="text-xs text-[var(--color-ash)] italic font-serif">None on file.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {caseFile.reportsFiled.map((r) => {
                    const href = contentHref(r.target_type, r.target_id)
                    return (
                      <li key={r.id} className="text-xs text-[var(--color-bone)]">
                        <span className="font-mono text-[var(--color-ash)]">{new Date(r.created_at).toLocaleDateString()}</span>{' '}
                        reported a <span className="uppercase">{r.target_type}</span> for <span className="text-[var(--color-blood)]">{r.category}</span>{' '}
                        <span className="font-mono text-[var(--color-ash)]">[{r.status}]</span>
                        {href && <a href={href} className="underline ml-1 hover:text-[var(--color-blood)]">view</a>}
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            <section>
              <h4 className="font-mono text-xs uppercase tracking-wider text-[var(--color-ash)] border-b border-[var(--color-line)] pb-2 mb-2">
                Actions taken against this user
              </h4>
              {!canReadAudit ? (
                <p className="text-xs text-[var(--color-ash)]">Requires Warden access.</p>
              ) : (caseFile?.actionsAgainst.length ?? 0) === 0 ? (
                <p className="text-xs text-[var(--color-ash)] italic font-serif">None on file.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {caseFile.actionsAgainst.map((a) => (
                    <li key={a.id} className="text-xs text-[var(--color-bone)]">
                      <span className="font-mono text-[var(--color-ash)]">{new Date(a.created_at).toLocaleDateString()}</span>{' '}
                      <span className="text-[var(--color-blood)]">{a.action.replace(/_/g, ' ')}</span>
                      {sanctionDuration(a) && <span className="text-[var(--color-ash)]"> · {sanctionDuration(a)}</span>}
                      {a.reason && <span className="text-[var(--color-ash)] italic"> — {a.reason}</span>}
                      {a.profiles?.handle && <span className="font-mono text-[var(--color-ash)]"> · by @{a.profiles.handle}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h4 className="font-mono text-xs uppercase tracking-wider text-[var(--color-ash)] border-b border-[var(--color-line)] pb-2 mb-2">
                Mod notes
              </h4>
              <div className="flex flex-col gap-2 mb-3">
                {(caseFile?.notes.length ?? 0) === 0 ? (
                  <p className="text-xs text-[var(--color-ash)] italic font-serif">No internal notes on this user.</p>
                ) : caseFile.notes.map((n) => (
                  <div key={n.id} className="card-surface p-3 text-xs">
                    <div className="flex justify-between mb-1">
                      <strong className="text-[var(--color-blood)]">{authorLabel(n.profiles)}</strong>
                      <span className="text-[var(--color-ash)]">{new Date(n.created_at).toLocaleString()}</span>
                    </div>
                    <div className="text-[var(--color-bone)]">{n.note}</div>
                  </div>
                ))}
              </div>
              <form onSubmit={handleAddNote} className="flex gap-2">
                <input
                  type="text"
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Leave a behavioral note…"
                  className="flex-1 bg-[var(--color-void)] border border-[var(--color-line)] px-3 py-2 text-xs text-[var(--color-bone)] focus:border-[var(--color-ember)] outline-none"
                />
                <button type="submit" className={GHOST_BTN}>Add</button>
              </form>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
