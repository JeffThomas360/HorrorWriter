import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from './AuthContext'
import { modCan } from '../lib/moderation'
import {
  startRevision, postFeedback, markReady, finishRevision,
  fetchOpenRevision, fetchFeedback,
} from '../lib/ritualRevision'

const LINK = 'font-mono text-xs uppercase tracking-wide text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] cursor-pointer'

/** Moderator: put a live entry under revision, with a first note to its author. */
export function StartRevision({ entry }) {
  const { profile } = useAuth()
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  if (!modCan(profile, 'hide', 'forum') || entry.mod_status !== 'live') return null

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await startRevision(entry.id, note)
      window.location.reload()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} className={LINK}>Mentor: send for revision</button>
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-2 border border-[var(--color-line)] bg-[var(--color-surface)] p-3">
      <label htmlFor={`rev-note-${entry.id}`} className="font-mono text-xs uppercase tracking-wide text-[var(--color-upside)] font-bold">
        Your note to the author (private)
      </label>
      <p className="font-serif text-xs text-[var(--color-text-secondary)]">
        The response is hidden from readers, with a placeholder, until you show it again. Nothing is deleted.
      </p>
      <textarea
        id={`rev-note-${entry.id}`}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={4}
        maxLength={4000}
        className="bg-[var(--color-void)] text-[var(--color-text-primary)] border border-[var(--color-line)] p-2 text-sm font-serif focus:border-[var(--color-upside)] focus:outline-none"
      />
      {error && <p role="alert" className="font-mono text-xs text-[var(--color-ember)]">{error}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={busy || !note.trim()} className="btn-vhs disabled:opacity-40 cursor-pointer">
          {busy ? 'Sending…' : 'Hide and send note'}
        </button>
        <button type="button" disabled={busy} onClick={() => setOpen(false)} className={LINK}>Cancel</button>
      </div>
    </form>
  )
}

/**
 * The private conversation on an entry under revision. Shown only to the
 * entry's author and to moderators (the database enforces the same).
 */
export default function RitualRevisionPanel({ entry }) {
  const { session, profile } = useAuth()
  const queryClient = useQueryClient()
  const userId = session?.user?.id
  const isAuthor = !!userId && entry.author_id === userId
  const isMod = modCan(profile, 'hide', 'forum')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const { data: revision } = useQuery({
    queryKey: ['ritualRevision', entry.id],
    queryFn: () => fetchOpenRevision(entry.id),
    enabled: entry.mod_status === 'hidden' && (isAuthor || isMod),
  })
  const { data: messages = [] } = useQuery({
    queryKey: ['ritualFeedback', entry.id],
    queryFn: () => fetchFeedback(entry.id),
    enabled: !!revision,
  })

  if (!revision || (!isAuthor && !isMod)) return null

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['ritualRevision', entry.id] })
    queryClient.invalidateQueries({ queryKey: ['ritualFeedback', entry.id] })
  }
  const run = async (fn, after) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      after?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-label="Under revision with a mentor" className="flex flex-col gap-3 border border-[var(--color-upside)] bg-[var(--color-surface)] p-4">
      <h3 className="font-mono text-xs uppercase tracking-wider text-[var(--color-upside)] font-bold">
        Under revision with a mentor
      </h3>
      <p className="font-serif text-xs text-[var(--color-text-secondary)]">
        Readers see a placeholder with the author&rsquo;s name. This conversation is private to the author and the mentors.
      </p>
      <ul className="flex flex-col gap-2">
        {messages.map((m) => (
          <li key={m.id} className="border border-[var(--color-line)] bg-[var(--color-void)] px-3 py-2">
            <div className="font-mono text-[11px] text-[var(--color-text-secondary)]">
              {m.sender_id === userId ? 'You' : `@${m.profiles?.handle || 'mentor'}`} · {new Date(m.created_at).toLocaleString()}
            </div>
            <p className="font-serif text-sm whitespace-pre-wrap text-[var(--color-text-primary)]">{m.body}</p>
          </li>
        ))}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          run(() => postFeedback(entry.id, text), () => { setText(''); refresh() })
        }}
        className="flex flex-col gap-2"
      >
        <label htmlFor={`rev-reply-${entry.id}`} className="font-mono text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">
          Reply
        </label>
        <textarea
          id={`rev-reply-${entry.id}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          maxLength={4000}
          className="bg-[var(--color-void)] text-[var(--color-text-primary)] border border-[var(--color-line)] p-2 text-sm font-serif focus:border-[var(--color-upside)] focus:outline-none"
        />
        {error && <p role="alert" className="font-mono text-xs text-[var(--color-ember)]">{error}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={busy || !text.trim()} className="btn-vhs disabled:opacity-40 cursor-pointer">Send</button>
          {isAuthor && (
            <button
              type="button"
              disabled={busy || !!revision.ready_at}
              onClick={() => run(() => markReady(entry.id), refresh)}
              className={LINK}
            >
              {revision.ready_at ? 'Marked ready for review' : 'I’ve made my changes: ready for review'}
            </button>
          )}
          {isMod && (
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => finishRevision(entry.id), () => window.location.reload())}
              className={LINK}
            >
              Show this response again
            </button>
          )}
        </div>
        {isMod && revision.ready_at && (
          <p className="font-mono text-[11px] text-[var(--color-upside)]">The author has marked this ready for review.</p>
        )}
      </form>
    </section>
  )
}
