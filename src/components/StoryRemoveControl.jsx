import { useEffect, useState } from 'react'
import { loadSealModules } from '../lib/sealLoader'
import { keepStory, deleteStoryForever } from '../lib/storyKeep'

const LINK = 'font-mono text-xs uppercase tracking-wide text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] cursor-pointer'
const SMALL_BTN = 'font-mono text-xs uppercase tracking-wide text-[var(--color-text-primary)] border border-[var(--color-line)] hover:border-[var(--color-text-primary)] px-4 py-2 min-h-[44px] disabled:opacity-40 cursor-pointer'
const DANGER_BTN = 'btn-vhs bg-[var(--color-accent-crimson)] text-white hover:bg-red-700 border-red-800 disabled:opacity-40 cursor-pointer'
const COPY_FAILED = 'Copy failed — select the code and copy it'

/** Keep it: a fresh recovery code, a "saved it" tick, then the story is locked away. */
function KeepStory({ book, code, onCode, onBack, onKept }) {
  const [api, setApi] = useState(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [copyStatus, setCopyStatus] = useState('')

  useEffect(() => {
    let cancelled = false
    loadSealModules()
      .then((mod) => {
        if (cancelled) return
        setApi(mod)
        // Same code after Back: a writer who already saved the first one must keep seeing it.
        if (!code) onCode(mod.generateRecoveryCode())
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
    const blob = new Blob([`${code}\n\nKept story: ${book.title || 'Untitled'}\n`], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'horrorwriter-kept-story-code.txt'
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
      await keepStory({ bookId: book.id, code, sealApi: api })
      onKept()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  const n = book.comments_count || 0
  const what = n > 0 ? `“${book.title}” and its ${n} ${n === 1 ? 'critique leave' : 'critiques leave'}` : `“${book.title}” leaves`

  return (
    <div role="alertdialog" aria-label="Keep this story" className="flex flex-col gap-3 border border-[var(--color-upside)] bg-[var(--color-surface)] p-4">
      <p className="font-serif text-sm text-[var(--color-text-primary)]">
        {what} the Library and {n === 0 ? 'is' : 'are'} locked with the recovery code below.
        Nobody can open {n === 0 ? 'it' : 'them'} without it, including us. Restore any time from your profile and it all returns.
      </p>
      <p className="font-serif text-sm font-bold text-[var(--color-ember)]">
        Lose this code and the story is gone for good. We can&rsquo;t reset it.
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
        <span>I&rsquo;ve saved my recovery code. Without it, this story can&rsquo;t be brought back.</span>
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

/**
 * Opened by "Remove" on a story in My Stories. Asks first: Delete forever (permanent),
 * Keep it (locked in the author's vault), or Cancel.
 */
export default function StoryRemoveControl({ book, onRemoved, onCancel }) {
  const [mode, setMode] = useState('ask') // ask | keep | kept
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const removeForever = async () => {
    setBusy(true)
    setError(null)
    try {
      await deleteStoryForever(book.id)
      onRemoved?.('deleted')
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  if (mode === 'kept') {
    return (
      <div role="status" className="flex flex-col gap-3 border border-[var(--color-upside)] bg-[var(--color-surface)] p-4">
        <p className="font-serif text-sm text-[var(--color-text-primary)]">
          Kept. &ldquo;{book.title}&rdquo; is locked away and has left the Library. Restore it any time from{' '}
          <a href="/profile/#kept-stories" className="underline">your profile</a> with your recovery code.
        </p>
        <div>
          <button type="button" onClick={() => onRemoved?.('kept')} className="btn-vhs cursor-pointer">Done</button>
        </div>
      </div>
    )
  }

  if (mode === 'keep') {
    return <KeepStory book={book} code={code} onCode={setCode} onBack={() => setMode('ask')} onKept={() => setMode('kept')} />
  }

  const n = book.comments_count || 0
  return (
    <div role="alertdialog" aria-label={`Remove ${book.title}`} className="flex flex-col gap-3 border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
      <p className="font-serif text-sm text-[var(--color-text-primary)]">
        Remove &ldquo;{book.title}&rdquo;{n > 0 ? ` and its ${n} ${n === 1 ? 'critique' : 'critiques'}` : ''} from the Library?
      </p>
      <ul className="font-serif text-sm text-[var(--color-text-secondary)] flex flex-col gap-1 list-disc list-inside">
        <li><strong className="text-[var(--color-text-primary)]">Delete forever</strong>: gone for good. Nobody can bring it back, including us.</li>
        <li><strong className="text-[var(--color-text-primary)]">Keep it</strong>: locked away with a code only you hold. Bring it back whenever you like.</li>
      </ul>
      {error && <p role="alert" className="font-mono text-xs text-[var(--color-ember)]">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy} onClick={removeForever} className={DANGER_BTN}>
          {busy ? 'Deleting…' : 'Delete forever'}
        </button>
        <button type="button" disabled={busy} onClick={() => setMode('keep')} className="btn-vhs disabled:opacity-40 cursor-pointer">
          Keep it
        </button>
        <button type="button" disabled={busy} onClick={onCancel} className={LINK}>Cancel</button>
      </div>
    </div>
  )
}
