import { useCallback, useEffect, useState } from 'react'
import { useAuth } from './AuthContext'
import { loadSealModules } from '../lib/sealLoader'
import { saveTextFile } from '../lib/writingExport'
import { reportClientError } from '../lib/errorReporter'
import { screenContent } from '../lib/screenContent'
import { supabase } from '../supabaseClient'
import { listKeptStories, restoreKeptStory, openKeptStory, keptStoryFile, deleteKeptStory } from '../lib/storyKeep'

const WRONG_CODE_ERROR = "That code doesn't open this story."
const CORRUPT_ERROR = "This kept story looks damaged. Please contact the keeper — don't delete it."
const SMALL_BTN = 'font-mono text-xs uppercase tracking-wide text-[var(--color-text-primary)] border border-[var(--color-line)] hover:border-[var(--color-text-primary)] px-4 py-2 min-h-[44px] disabled:opacity-40 cursor-pointer'
const LINK = 'font-mono text-xs uppercase tracking-wide text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] cursor-pointer'

function KeptStoryRow({ item, onGone }) {
  const [mode, setMode] = useState('idle') // idle | restore | download | delete
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [restored, setRestored] = useState(null)
  const [saved, setSaved] = useState(false)
  const codeId = `kept-story-code-${item.id}`
  const errorId = `kept-story-error-${item.id}`

  const restore = async (e) => {
    e.preventDefault()
    if (!code.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const api = await loadSealModules()
      const out = await restoreKeptStory({ vaultId: item.id, code, sealApi: api })
      // Back in public: screen it again before anyone reads it, as a new story would be.
      await screenContent(supabase, 'story', out.result?.book_id)
      setRestored(out)
    } catch (err) {
      // The typed code never reaches an error message: only these fixed strings do.
      if (err?.message === 'wrong-code') setError(WRONG_CODE_ERROR)
      else if (err?.message === 'corrupt-bundle') setError(CORRUPT_ERROR)
      else setError(err?.message || 'Nothing was restored. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  // Download only opens the bundle and saves a file. It makes no RPC, so it works while restore is refused.
  const download = async (e) => {
    e.preventDefault()
    if (!code.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const api = await loadSealModules()
      const payload = await openKeptStory({ vaultId: item.id, code, sealApi: api })
      const file = keptStoryFile(payload)
      saveTextFile(file.name, file.text)
      setCode('')
      setMode('idle')
      setSaved(true)
    } catch (err) {
      // The typed code never reaches an error message: only these fixed strings do.
      if (err?.message === 'wrong-code') setError(WRONG_CODE_ERROR)
      else if (err?.message === 'corrupt-bundle') setError(CORRUPT_ERROR)
      else {
        // Not a wrong code or a damaged bundle, so worth logging. Nothing in this path carries the typed code.
        reportClientError('promise', err)
        setError('Nothing was saved. Your kept story is safe; please try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  const openMode = (next) => {
    setError(null)
    setSaved(false)
    setMode(next)
  }

  const remove = async () => {
    setBusy(true)
    setError(null)
    try {
      await deleteKeptStory(item.id)
      onGone(item.id)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  const kept = new Date(item.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })

  if (restored) {
    const r = restored.result || {}
    const notes = []
    if (r.critiques_skipped > 0) {
      notes.push(`${r.critiques_skipped} ${r.critiques_skipped === 1 ? 'critique was' : 'critiques were'} left out because ${r.critiques_skipped === 1 ? 'its writer has' : 'their writers have'} left the site.`)
    }
    if (r.series_lost > 0) notes.push('Its series no longer exists, so it is back on its own.')
    return (
      <li role="status" className="border border-[var(--color-upside)] p-4 flex flex-col gap-2">
        <p className="font-serif text-sm text-[var(--color-text-primary)]">
          &ldquo;{restored.title || 'Your story'}&rdquo; is brought back from the dead. {notes.join(' ')}
        </p>
        <a href={`/library/read/${r.book_id}/`} className="self-start underline font-mono text-xs uppercase">Read it</a>
      </li>
    )
  }

  return (
    <li className="border border-[var(--color-line)] p-4 flex flex-col gap-3">
      <span className="font-mono text-xs text-[var(--color-text-secondary)]">A story kept {kept}</span>

      {mode === 'idle' && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => openMode('restore')} className={SMALL_BTN}>Restore</button>
          <button type="button" onClick={() => openMode('download')} className={SMALL_BTN}>Download</button>
          <button type="button" onClick={() => openMode('delete')} className={SMALL_BTN}>Delete from vault</button>
        </div>
      )}

      {saved && mode === 'idle' && (
        <p role="status" className="font-mono text-xs text-[var(--color-text-secondary)]">Saved.</p>
      )}

      {(mode === 'restore' || mode === 'download') && (
        <form onSubmit={mode === 'download' ? download : restore} className="flex flex-col gap-2">
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
              {busy ? (mode === 'download' ? 'Opening…' : 'Restoring…') : (mode === 'download' ? 'Download' : 'Restore')}
            </button>
            <button type="button" disabled={busy} onClick={() => setMode('idle')} className={LINK}>Cancel</button>
          </div>
        </form>
      )}

      {mode === 'delete' && (
        <div role="alertdialog" aria-label="Delete from vault" className="flex flex-col gap-2">
          <p className="font-serif text-sm text-[var(--color-text-primary)]">
            Delete this kept story for good? It and its critiques can&rsquo;t be brought back, with or without your code.
          </p>
          {error && <p role="alert" className="text-[var(--color-ember)] text-xs font-mono">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={remove}
              className="btn-vhs btn-vhs-danger disabled:opacity-40 cursor-pointer"
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

/** The signed-in writer's kept Library stories. Renders nothing when there are none. */
export default function KeptStories() {
  const { session } = useAuth()
  const userId = session?.user?.id
  const [items, setItems] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    if (!userId) return
    try {
      setItems(await listKeptStories())
    } catch (err) {
      setError(err.message)
    }
  }, [userId])

  useEffect(() => { load() }, [load])

  if (error) {
    return <p id="kept-stories" role="alert" className="font-mono text-xs text-[var(--color-ember)] mb-8">{error}</p>
  }
  if (!items?.length) return null

  return (
    <section id="kept-stories" aria-labelledby="kept-stories-heading" className="mb-8 scroll-mt-24">
      <h2 id="kept-stories-heading" className="font-serif font-bold text-lg mb-2">Your kept stories</h2>
      <p className="font-serif text-sm text-[var(--color-text-secondary)] mb-4">
        Locked with your recovery code; nobody else can open them, so even the title stays hidden until you do.
        Restore one and it returns to the Library with its critiques and its place in its series.
      </p>
      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <KeptStoryRow key={item.id} item={item} onGone={(id) => setItems((cur) => cur.filter((i) => i.id !== id))} />
        ))}
      </ul>
    </section>
  )
}
