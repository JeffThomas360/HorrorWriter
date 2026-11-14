import { useState } from 'react'
import { downloadAllWriting } from '../../lib/adminWritingExport'
import { reportClientError } from '../../lib/errorReporter'

const BTN = 'font-mono text-xs uppercase tracking-wide text-[var(--color-text-primary)] border border-[var(--color-line)] hover:border-[var(--color-text-primary)] px-4 py-2 min-h-[44px] disabled:opacity-40 cursor-pointer'

const FAILED = "The download didn't finish, so nothing was saved. Please try again."

/** Keeper-only: every member's published writing as one .zip, plus where the nightly backups live. */
export default function AdminWritingExport() {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)

  const download = async () => {
    if (busy) return
    setBusy(true)
    setFailed(false)
    setMessage("Gathering everyone's writing…")
    try {
      const { memberCount, pieceCount } = await downloadAllWriting()
      setMessage(`Saved ${pieceCount} ${pieceCount === 1 ? 'piece' : 'pieces'} by ${memberCount} ${memberCount === 1 ? 'member' : 'members'}.`)
    } catch (err) {
      reportClientError('promise', err)
      setMessage('')
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="admin-backups-heading">
      <h3 id="admin-backups-heading" className="font-mono text-xs uppercase tracking-widest text-[var(--color-ash)] mb-3">Backups</h3>
      <p className="text-sm text-[var(--color-bone)] font-serif mb-3">
        Every member&apos;s published writing in one .zip of plain text files, readable anywhere, with the raw data beside it.
        Removed and under-review work is included and marked. Keep a copy somewhere safe now and then.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy} onClick={download} className={BTN}>Download all members&apos; writing</button>
        <span role="status" className="font-mono text-xs text-[var(--color-ash)]">{message}</span>
      </div>
      {failed && <p role="alert" className="mt-2 font-mono text-xs text-[var(--color-ember)]">{FAILED}</p>}
      <p className="mt-3 text-xs text-[var(--color-ash)] font-serif">
        The full database is also backed up, encrypted, every night:{' '}
        <a
          href="https://github.com/JeffThomas360/horrorwriter-backups/actions/workflows/backup.yml"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-[var(--color-bone)]"
        >
          nightly backup runs ↗
        </a>
      </p>
    </section>
  )
}
