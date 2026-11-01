import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { fetchTicket, keeperReplyTicket, keeperCloseTicket } from '../../lib/tickets'
import { resolveTask } from '../../lib/keeperTaskApi'
import { typeInfo, describeTask } from '../../lib/keeperTasks'
// WorkQueueTab imports this file too. These constants are read only while
// rendering, never at module load, so the cycle is harmless; keep it that way.
import { FIELD, btn } from './WorkQueueTab'

/**
 * One member ticket in the work queue. The task only carries the subject, topic and
 * handle; the conversation is read from the ticket itself. Every action is a ticket
 * RPC that re-checks the ticket (a closed one fails `closed`), then the queue is
 * refreshed through onChanged. A successful reply, resolve or dismiss resolves the
 * ticket's task server-side, so the card leaves the queue on that refresh.
 */

const DONE = {
  reply: 'Reply sent',
  resolve: 'Ticket resolved',
  dismiss: 'Ticket dismissed',
  orphan: 'Task dismissed',
}

function Message({ message }) {
  return (
    <div className={`flex flex-col gap-1 border-l pl-3 ${message.from_keeper ? 'border-[var(--color-ash)]' : 'border-[var(--color-line-hi)]'}`}>
      <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-[var(--color-ash)]">
        <span>{message.from_keeper ? 'You' : 'Member'}</span>
        <span>{new Date(message.created_at).toLocaleString()}</span>
      </div>
      <p className="font-serif text-sm text-[var(--color-bone)] whitespace-pre-wrap break-words">{message.body}</p>
    </div>
  )
}

export default function TicketCard({ task, onChanged }) {
  const ticketId = task.target_id
  const info = typeInfo(task.type)
  const detail = info.detail(task)

  // 'dismiss' is the inline "are you sure?": a dismissal can't be undone, the member is
  // never told, and the button sits next to Reply (a phone mis-tap after a push).
  const [mode, setMode] = useState(null) // null | 'reply' | 'resolve' | 'dismiss'
  const [reply, setReply] = useState('')
  const [note, setNote] = useState('')
  const [showAll, setShowAll] = useState(false)

  const { data: ticket, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'keeper-ticket', ticketId],
    queryFn: () => fetchTicket(ticketId),
    enabled: Boolean(ticketId),
  })

  const act = useMutation({
    mutationFn: ({ kind, text }) => {
      if (kind === 'reply') return keeperReplyTicket(ticketId, text)
      if (kind === 'resolve') return keeperCloseTicket(ticketId, 'resolved', text || null)
      if (kind === 'dismiss') return keeperCloseTicket(ticketId, 'dismissed', null)
      return resolveTask(task.id, 'dismiss')
    },
    onSuccess: (_data, { kind }) => {
      toast.success(DONE[kind])
      setMode(null)
      setReply('')
      setNote('')
      onChanged()
    },
    // Whatever failed (most often `closed` from a stale card), the queue may have
    // moved on, so refresh it as WorkQueueTab does for every other task.
    onError: (e) => {
      toast.error(e.message)
      onChanged()
    },
  })

  // After a success the card is about to leave the queue: stay locked so a second
  // click cannot send twice.
  const busy = act.isPending || act.isSuccess
  const gone = !ticketId || (ticket === null && !isLoading && !error)
  const messages = ticket?.messages ?? []
  const shown = showAll ? messages : messages.slice(-1)

  return (
    <li className={`card-surface border p-4 flex flex-col gap-2 ${task.priority === 1 ? 'border-[var(--color-blood)]' : 'border-[var(--color-line-hi)]'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-ash)]">{info.label}</span>
        {task.priority === 1 && <span className="font-mono text-[10px] uppercase text-[var(--color-ember)]">High priority</span>}
        <span className="ml-auto font-mono text-[10px] text-[var(--color-ash)]">{new Date(task.created_at).toLocaleDateString()}</span>
      </div>
      <p className="font-serif text-sm text-[var(--color-bone)]">{describeTask(task)}</p>
      {detail && <p className="text-xs text-[var(--color-ash)] font-serif">{detail}</p>}

      {gone && (
        <>
          <p className="text-sm text-[var(--color-ash)] font-serif italic">This ticket no longer exists.</p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={btn} disabled={busy} onClick={() => act.mutate({ kind: 'orphan' })}>Dismiss</button>
          </div>
        </>
      )}

      {!gone && isLoading && (
        <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-ash)] animate-pulse">Reading the conversation…</p>
      )}

      {!gone && error && (
        <div className="flex flex-wrap items-center gap-2">
          <p role="alert" className="text-sm text-[var(--color-ember)]">{error.message}</p>
          <button type="button" className={btn} onClick={() => refetch()}>Try again</button>
        </div>
      )}

      {!gone && ticket && (
        <>
          <div className="flex flex-col gap-2">
            {messages.length > 1 && (
              <button type="button" className={`${btn} self-start`} aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
                {showAll ? 'Hide' : 'Show'} conversation ({messages.length})
              </button>
            )}
            {shown.map((m) => <Message key={m.id} message={m} />)}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={btn} disabled={busy} onClick={() => setMode('reply')}>Reply</button>
            <button type="button" className={btn} disabled={busy} onClick={() => setMode('resolve')}>Resolve</button>
            <button type="button" className={btn} disabled={busy} onClick={() => setMode('dismiss')}>Dismiss</button>
          </div>

          {mode === 'dismiss' && (
            <div className="flex flex-col gap-2">
              <p className="font-serif text-sm text-[var(--color-bone)]">Dismiss this ticket? The member won't be told.</p>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className={btn} disabled={busy} onClick={() => act.mutate({ kind: 'dismiss' })}>Yes, dismiss</button>
                <button type="button" className={btn} disabled={busy} onClick={() => setMode(null)}>Cancel</button>
              </div>
            </div>
          )}

          {mode === 'reply' && (
            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => { e.preventDefault(); if (reply.trim() && !busy) act.mutate({ kind: 'reply', text: reply.trim() }) }}
            >
              <textarea aria-label="Reply to the member" rows={4} maxLength={2000} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Your reply" className={FIELD} />
              <div className="flex flex-wrap items-center gap-2">
                <button type="submit" className={btn} disabled={!reply.trim() || busy}>Send reply</button>
                <button type="button" className={btn} disabled={busy} onClick={() => setMode(null)}>Cancel</button>
              </div>
            </form>
          )}

          {mode === 'resolve' && (
            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => { e.preventDefault(); if (!busy) act.mutate({ kind: 'resolve', text: note.trim() }) }}
            >
              <textarea aria-label="Closing note (optional)" rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Closing note for the member (optional)" className={FIELD} />
              <div className="flex flex-wrap items-center gap-2">
                <button type="submit" className={btn} disabled={busy}>Resolve ticket</button>
                <button type="button" className={btn} disabled={busy} onClick={() => setMode(null)}>Cancel</button>
              </div>
            </form>
          )}
        </>
      )}
    </li>
  )
}
