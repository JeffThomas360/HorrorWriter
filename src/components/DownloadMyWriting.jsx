import { useState } from 'react'
import { useAuth } from './AuthContext'
import { downloadMyWriting } from '../lib/writingExport'

const SMALL_BTN = 'font-mono text-xs uppercase tracking-wide text-[var(--color-text-primary)] border border-[var(--color-line)] hover:border-[var(--color-text-primary)] px-4 py-2 min-h-[44px] disabled:opacity-40 cursor-pointer'

const FAILED = "The download didn't finish, so nothing was saved. Please try again."

/** Everything the signed-in member has written, as one .zip of plain text files. */
export default function DownloadMyWriting() {
  const { user, profile } = useAuth()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)

  const download = async () => {
    if (busy || !user?.id) return
    setBusy(true)
    setFailed(false)
    setMessage('Gathering your writing…')
    try {
      const { count } = await downloadMyWriting({ userId: user.id, handle: profile?.handle })
      setMessage(count === 0 ? "You haven't written anything yet." : `Saved ${count} ${count === 1 ? 'piece' : 'pieces'}.`)
    } catch {
      setMessage('')
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section id="download-writing" aria-labelledby="download-writing-heading" className="mb-8 scroll-mt-24">
      <h2 id="download-writing-heading" className="font-serif font-bold text-lg mb-2">Your writing</h2>
      <p className="font-serif text-sm text-[var(--color-text-secondary)] mb-4">
        Everything you&apos;ve written here, in one .zip of plain text files.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy} onClick={download} className={SMALL_BTN}>Download my writing</button>
        <span role="status" className="font-mono text-xs text-[var(--color-text-secondary)]">{message}</span>
      </div>
      {failed && <p role="alert" className="mt-2 font-mono text-xs text-[var(--color-ember)]">{FAILED}</p>}
    </section>
  )
}
