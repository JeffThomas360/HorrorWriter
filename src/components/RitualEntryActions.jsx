import { lazy, Suspense, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { screenContent } from '../lib/screenContent'
import { MIN_WORDS, WORD_LIMIT, countRitualWords } from '../lib/ritualDraft'
import { editRitualEntry, deleteRitualEntry, formatEdited } from '../lib/ritualEntry'

const RitualEditor = lazy(() => import('./RitualEditor'))

const LINK = 'font-mono text-xs uppercase tracking-wide text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] cursor-pointer'

/** "Edited October 22nd, 2026 @ 1657". Client-only: the time zone is the reader's. */
export function EditedMarker({ at }) {
  const [text, setText] = useState('')
  useEffect(() => setText(formatEdited(at)), [at])
  if (!text) return null
  return <span className="font-mono text-[11px] italic text-[var(--color-text-secondary)]">{text}</span>
}

/**
 * Edit / Delete for the signed-in author of a ritual entry. The edit form sits
 * where the entry's text is; delete asks first and is permanent.
 */
export default function RitualEntryActions({ entry, critiqueCount = 0, onChanged, onThreadGone, onEditingChange }) {
  const [mode, setMode] = useState('idle') // 'idle' | 'edit' | 'delete'
  const [title, setTitle] = useState(entry.title || '')
  const [content, setContent] = useState(entry.content || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  // Lets the page hide the entry's text while its edit form is open.
  useEffect(() => {
    onEditingChange?.(mode === 'edit')
    return () => onEditingChange?.(false)
  }, [mode])

  const words = countRitualWords(content)
  const inRange = words >= MIN_WORDS && words <= WORD_LIMIT
  const canSave = !busy && title.trim().length > 0 && title.trim().length <= 200 && inRange

  const startEdit = () => {
    setTitle(entry.title || '')
    setContent(entry.content || '')
    setError(null)
    setMode('edit')
  }

  const save = async (e) => {
    e.preventDefault()
    if (!canSave) return
    setBusy(true)
    setError(null)
    try {
      await editRitualEntry({ postId: entry.id, title, content })
      await screenContent(supabase, 'post', entry.id)
      setMode('idle')
      await onChanged?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    setError(null)
    try {
      const { threadGone } = await deleteRitualEntry({ postId: entry.id, threadId: entry.thread_id })
      if (threadGone) {
        onThreadGone?.()
        return
      }
      setMode('idle')
      await onChanged?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (mode === 'edit') {
    return (
      <form onSubmit={save} className="flex flex-col gap-3 border border-[var(--color-upside)] bg-[var(--color-surface)] p-4">
        <label htmlFor={`edit-title-${entry.id}`} className="font-mono text-xs uppercase tracking-wider text-[var(--color-upside)] font-bold">
          Title
        </label>
        <input
          id={`edit-title-${entry.id}`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          className="bg-[var(--color-void)] text-[var(--color-text-primary)] border border-[var(--color-line)] px-3 py-2 text-sm focus:border-[var(--color-upside)] focus:outline-none"
        />
        <div className="flex items-center justify-between">
          <label htmlFor={`edit-body-${entry.id}`} className="font-mono text-xs uppercase tracking-wider text-[var(--color-text-secondary)]">
            Your response
          </label>
          <span className={`font-mono text-xs font-bold ${inRange ? 'text-[var(--color-upside)]' : 'text-[var(--color-ember)]'}`}>
            {words} words · {MIN_WORDS} to {WORD_LIMIT}
          </span>
        </div>
        <Suspense fallback={<div className="min-h-[14rem] border border-[var(--color-line)] bg-[var(--color-void)]" aria-busy="true" />}>
          <RitualEditor id={`edit-body-${entry.id}`} value={content} onChange={setContent} disabled={busy} />
        </Suspense>
        {error && <p role="alert" className="font-mono text-xs text-[var(--color-ember)]">{error}</p>}
        <div className="flex items-center gap-2">
          <button type="submit" disabled={!canSave} className="btn-vhs disabled:opacity-40 cursor-pointer">
            {busy ? 'Saving…' : 'Save changes'}
          </button>
          <button type="button" disabled={busy} onClick={() => setMode('idle')} className={LINK}>
            Cancel
          </button>
        </div>
      </form>
    )
  }

  if (mode === 'delete') {
    return (
      <div role="alertdialog" aria-label="Delete this entry" className="flex flex-col gap-3 border border-[var(--color-ember)] bg-[var(--color-surface)] p-4">
        <p className="font-serif text-sm text-[var(--color-text-primary)]">
          Delete this entry forever? It can&rsquo;t be brought back.
          {critiqueCount > 0 && ` Its ${critiqueCount} ${critiqueCount === 1 ? 'critique goes' : 'critiques go'} with it.`}
          {' '}If it&rsquo;s the last entry for this prompt, the thread leaves The Crypt too.
        </p>
        {error && <p role="alert" className="font-mono text-xs text-[var(--color-ember)]">{error}</p>}
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={remove}
            className="btn-vhs bg-[var(--color-accent-crimson)] text-white hover:bg-red-700 border-red-800 disabled:opacity-40 cursor-pointer"
          >
            {busy ? 'Deleting…' : 'Delete forever'}
          </button>
          <button type="button" disabled={busy} onClick={() => setMode('idle')} className={LINK}>
            Keep it
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-4">
      <button type="button" onClick={startEdit} className={LINK}>Edit</button>
      <button type="button" onClick={() => { setError(null); setMode('delete') }} className={LINK}>Delete</button>
    </div>
  )
}
