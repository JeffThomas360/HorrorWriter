import { useEffect, useState } from 'react'
import { loadSealModules } from '../lib/sealLoader'
import { keepRitualEntry } from '../lib/ritualKeep'

const LINK = 'font-mono text-xs uppercase tracking-wide text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] cursor-pointer'
const SMALL_BTN = 'font-mono text-xs uppercase tracking-wide text-[var(--color-text-primary)] border border-[var(--color-line)] hover:border-[var(--color-text-primary)] px-4 py-2 min-h-[44px] disabled:opacity-40 cursor-pointer'
const COPY_FAILED = 'Copy failed — select the code and copy it'

/**
 * "Keep it" from the delete dialog: shows a fresh recovery code, makes the writer tick that
 * they saved it, then locks the entry (and its critiques and mentor conversation) away.
 * The code never leaves the browser.
 */
export default function KeepRitualEntry({ entry, critiqueCount = 0, code, onCode, onBack, onKept }) {
  const [api, setApi] = useState(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [copyStatus, setCopyStatus] = useState('')
  const [kept, setKept] = useState(null) // { threadGone }

  useEffect(() => {
    let cancelled = false
    loadSealModules()
      .then((mod) => {
        if (cancelled) return
        setApi(mod)
        // Same code after Back: a writer who already saved the first one must keep seeing it.
        if (!code) onCode?.(mod.generateRecoveryCode())
      })
      .catch(() => !cancelled && setError('Could not prepare a recovery code. Please try again.'))
    return () => { cancelled = true }
  }, [])

  const copyCode = () => {
    setCopyStatus('')
    const clip = navigator.clipboard?.writeText ? navigator.clipboard.writeText(code) : Promise.reject()
    clip.then(() => setCopyStatus('Copied'), () => setCopyStatus(COPY_FAILED))
  }

  const downloadCode = () => {
    const blob = new Blob([`${code}\n\nKept Midnight Ritual entry: ${entry.title || 'Untitled'}\n`], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'horrorwriter-kept-entry-code.txt'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const keep = async () => {
    if (!api || !saved || busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await keepRitualEntry({ postId: entry.id, threadId: entry.thread_id, code, sealApi: api })
      setKept(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (kept) {
    return (
      <div role="status" className="flex flex-col gap-3 border border-[var(--color-upside)] bg-[var(--color-surface)] p-4">
        <p className="font-serif text-sm text-[var(--color-text-primary)]">
          Kept. Your entry is locked away and has left the thread. Restore it any time from{' '}
          <a href="/profile/#kept-entries" className="underline">your profile</a> with your recovery code.
        </p>
        <div>
          <button type="button" onClick={() => onKept?.(kept)} className="btn-vhs cursor-pointer">Done</button>
        </div>
      </div>
    )
  }

  const what = critiqueCount > 0
    ? `This entry and its ${critiqueCount} ${critiqueCount === 1 ? 'critique leave' : 'critiques leave'}`
    : 'This entry leaves'

  return (
    <div role="alertdialog" aria-label="Keep this entry" className="flex flex-col gap-3 border border-[var(--color-upside)] bg-[var(--color-surface)] p-4">
      <p className="font-serif text-sm text-[var(--color-text-primary)]">
        {what} the thread and {critiqueCount === 0 ? 'is' : 'are'} locked with the recovery code below.
        Nobody can open them without it, including us. Restore any time and it all returns to its place.
      </p>
      <p className="font-serif text-sm font-bold text-[var(--color-ember)]">
        Lose this code and the piece is gone for good. We can&rsquo;t reset it.
      </p>
      {code ? (
        <code aria-label="Your recovery code" className="block bg-[var(--color-void)] border border-[var(--color-line)] px-3 py-2 text-sm break-all font-mono text-[var(--color-text-primary)]">
          {code}
        </code>
      ) : (
        !error && <p role="status" className="font-mono text-xs text-[var(--color-text-secondary)]">Preparing your code…</p>
      )}
      {code && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={busy} onClick={copyCode} className={SMALL_BTN}>Copy</button>
          <button type="button" disabled={busy} onClick={downloadCode} className={SMALL_BTN}>Download</button>
          {copyStatus && <span role="status" className="font-mono text-xs text-[var(--color-text-secondary)]">{copyStatus}</span>}
        </div>
      )}
      <label className="flex items-start gap-2 font-serif text-sm text-[var(--color-text-primary)] cursor-pointer">
        <input
          type="checkbox"
          checked={saved}
          disabled={!code || busy}
          onChange={(e) => setSaved(e.target.checked)}
          className="mt-1 h-4 w-4 accent-[var(--color-upside)]"
        />
        <span>I&rsquo;ve saved my recovery code. Without it, this entry can&rsquo;t be brought back.</span>
      </label>
      {error && <p role="alert" className="font-mono text-xs text-[var(--color-ember)]">{error}</p>}
      <div className="flex items-center gap-2">
        <button type="button" disabled={!api || !saved || busy} onClick={keep} className="btn-vhs disabled:opacity-40 cursor-pointer">
          {busy ? 'Locking it away…' : 'Lock it away'}
        </button>
        <button type="button" disabled={busy} onClick={onBack} className={LINK}>Back</button>
      </div>
    </div>
  )
}
