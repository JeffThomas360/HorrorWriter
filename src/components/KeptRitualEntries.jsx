import { useCallback, useEffect, useState } from 'react'
import { useAuth } from './AuthContext'
import { loadSealModules } from '../lib/sealLoader'
import { listKeptEntries, restoreKeptEntry, deleteKeptEntry } from '../lib/ritualKeep'

const WRONG_CODE_ERROR = "That code doesn't open this entry."
const CORRUPT_ERROR = "This kept entry looks damaged. Please contact the keeper — don't delete it."
const SMALL_BTN = 'font-mono text-xs uppercase tracking-wide text-[var(--color-text-primary)] border border-[var(--color-line)] hover:border-[var(--color-text-primary)] px-4 py-2 min-h-[44px] disabled:opacity-40 cursor-pointer'
const LINK = 'font-mono text-xs uppercase tracking-wide text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] cursor-pointer'

function excerpt(text, max = 140) {
  if (!text) return 'A Midnight Ritual prompt'
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text
}

function KeptRow({ item, onGone }) {
  const [mode, setMode] = useState('idle') // idle | restore | delete
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [restored, setRestored] = useState(null)
  const codeId = `kept-code-${item.id}`
  const errorId = `kept-error-${item.id}`

  const restore = async (e) => {
    e.preventDefault()
    if (!code.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const api = await loadSealModules()
      const result = await restoreKeptEntry({ vaultId: item.id, code, sealApi: api })
      setRestored(result)
    } catch (err) {
      // The typed code never reaches an error message: only these fixed strings do.
      if (err?.message === 'wrong-code') setError(WRONG_CODE_ERROR)
      else if (err?.message === 'corrupt-bundle') setError(CORRUPT_ERROR)
      else setError(err?.message || 'Nothing was restored. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    setError(null)
    try {
      await deleteKeptEntry(item.id)
      onGone(item.id)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  const kept = new Date(item.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })

  if (restored) {
    const skipped = restored.critiques_skipped > 0
      ? ` ${restored.critiques_skipped} ${restored.critiques_skipped === 1 ? 'critique was' : 'critiques were'} left out because ${restored.critiques_skipped === 1 ? 'its writer has' : 'their writers have'} left the site.`
      : ''
    return (
      <li role="status" className="border border-[var(--color-upside)] p-4 flex flex-col gap-2">
        <p className="font-serif text-sm text-[var(--color-text-primary)]">
          Brought back from the dead.{restored.mod_status === 'hidden' ? ' It is back under revision with your mentor.' : ''}{skipped}
        </p>
        <a href={`/forum/thread/${restored.thread_id}/#post-${restored.entry_id}`} className="self-start underline font-mono text-xs uppercase">
          Go to your entry
        </a>
      </li>
    )
  }

  return (
    <li className="border border-[var(--color-line)] p-4 flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-xs text-[var(--color-text-secondary)]">Kept {kept}</span>
        <p className="font-serif italic text-sm text-[var(--color-text-primary)]">&ldquo;{excerpt(item.prompt_body)}&rdquo;</p>
      </div>

      {mode === 'idle' && (
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => { setError(null); setMode('restore') }} className={SMALL_BTN}>Restore</button>
          <button type="button" onClick={() => { setError(null); setMode('delete') }} className={SMALL_BTN}>Delete from vault</button>
        </div>
      )}

      {mode === 'restore' && (
        <form onSubmit={restore} className="flex flex-col gap-2">
          <label htmlFor={codeId} className="font-mono text-xs uppercase">Recovery code</label>
          <input
            id={codeId}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck="false"
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={error ? errorId : undefined}
            className="bg-[var(--color-bg-primary)] border border-[var(--color-line)] px-3 py-2 text-sm w-full font-mono"
          />
          {error && <p id={errorId} role="alert" className="text-[var(--color-ember)] text-xs font-mono">{error}</p>}
          <div className="flex items-center gap-2">
            <button type="submit" disabled={!code.trim() || busy} className="btn-vhs disabled:opacity-40 cursor-pointer">
              {busy ? 'Restoring…' : 'Restore'}
            </button>
            <button type="button" disabled={busy} onClick={() => setMode('idle')} className={LINK}>Cancel</button>
          </div>
        </form>
      )}

      {mode === 'delete' && (
        <div role="alertdialog" aria-label="Delete from vault" className="flex flex-col gap-2">
          <p className="font-serif text-sm text-[var(--color-text-primary)]">
            Delete this kept entry for good? It and its critiques can&rsquo;t be brought back, with or without your code.
          </p>
          {error && <p role="alert" className="text-[var(--color-ember)] text-xs font-mono">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={remove}
              className="btn-vhs bg-[var(--color-accent-crimson)] text-white hover:bg-red-700 border-red-800 disabled:opacity-40 cursor-pointer"
            >
              {busy ? 'Deleting…' : 'Delete forever'}
            </button>
            <button type="button" disabled={busy} onClick={() => setMode('idle')} className={LINK}>Cancel</button>
          </div>
        </div>
      )}
    </li>
  )
}

/** The signed-in writer's vault of kept Midnight Ritual entries. Renders nothing when it is empty. */
export default function KeptRitualEntries() {
  const { session } = useAuth()
  const userId = session?.user?.id
  const [items, setItems] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    if (!userId) return
    try {
      setItems(await listKeptEntries())
    } catch (err) {
      setError(err.message)
    }
  }, [userId])

  useEffect(() => { load() }, [load])

  if (error) {
    return <p id="kept-entries" role="alert" className="font-mono text-xs text-[var(--color-ember)] mb-8">{error}</p>
  }
  if (!items?.length) return null

  return (
    <section id="kept-entries" aria-labelledby="kept-entries-heading" className="mb-8 scroll-mt-24">
      <h2 id="kept-entries-heading" className="font-serif font-bold text-lg mb-2">Your kept Ritual entries</h2>
      <p className="font-serif text-sm text-[var(--color-text-secondary)] mb-4">
        Locked with your recovery code; nobody else can open them. Restore one and it returns to its thread with its
        critiques, marked &ldquo;Brought back from the dead&rdquo;.
      </p>
      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <KeptRow key={item.id} item={item} onGone={(id) => setItems((cur) => cur.filter((i) => i.id !== id))} />
        ))}
      </ul>
    </section>
  )
}
