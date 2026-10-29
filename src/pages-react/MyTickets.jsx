import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabaseClient'
import { useAuth } from '../components/AuthContext'
import { withProviders } from '../components/Providers'
import RequireAuth from '../components/RequireAuth'
import {
  TICKETS_KEY,
  closedLabel,
  fetchMyTickets,
  markTicketSeen,
  memberStatus,
  replyTicket,
  topicLabel,
} from '../lib/tickets'

/**
 * The member's own tickets, newest first, each with its whole conversation.
 *
 * An answered ticket the member has not opened yet is expanded on load and marked
 * seen once; that is what takes the reply banner away on the next page they visit.
 * /my-tickets/#<id> (the banner's link) scrolls to that ticket and expands it.
 * Message text is member and Keeper text: it is only ever rendered as text.
 */

const LABEL = 'font-mono text-xs uppercase tracking-widest text-[var(--color-ash)]'
const FIELD =
  'bg-[var(--color-void)] border border-[var(--color-line)] px-3 py-2 text-base text-[var(--color-bone)] focus:border-[var(--color-ember)] outline-none w-full'
const BUTTON =
  'inline-flex items-center self-start font-mono text-xs uppercase tracking-widest px-4 min-h-[44px] border border-[var(--color-line-hi)] text-[var(--color-bone)] hover:border-[var(--color-ember)] hover:text-[var(--color-ember)] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed'
const PILL = 'font-mono text-xs uppercase tracking-widest border px-2 py-0.5'
// Same live count as the Help page's ticket form (OpenTicket).
const COUNT = 'self-end font-mono text-xs text-[var(--color-ash)]'
const REPLY_MAX = 2000

function StatusPill({ ticket }) {
  const status = memberStatus(ticket)
  const tone =
    status === 'Answered'
      ? 'text-[var(--color-ember)] border-[var(--color-ember)]'
      : 'text-[var(--color-ash)] border-[var(--color-line-hi)]'
  return <span className={`${PILL} ${tone}`}>{status}</span>
}

function Message({ message }) {
  return (
    <div
      className={`flex flex-col gap-1 border-l pl-3 ${message.from_keeper ? 'border-[var(--color-ember)]' : 'border-[var(--color-line-hi)]'}`}
    >
      <div className="flex flex-wrap items-center gap-2 font-mono text-xs uppercase tracking-widest text-[var(--color-ash)]">
        <span>{message.from_keeper ? 'The Keeper' : 'You'}</span>
        <span>{new Date(message.created_at).toLocaleString()}</span>
      </div>
      <p className="font-serif text-base text-[var(--color-bone)] whitespace-pre-wrap break-words">{message.body}</p>
    </div>
  )
}

function ReplyBox({ ticketId }) {
  const queryClient = useQueryClient()
  const [text, setText] = useState('')
  const send = useMutation({
    mutationFn: (body) => replyTicket(ticketId, body),
    onSuccess: () => {
      setText('')
      return queryClient.invalidateQueries({ queryKey: TICKETS_KEY })
    },
  })
  const body = text.trim()
  const fieldId = `reply-${ticketId}`
  const countId = `${fieldId}-count`

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (body && !send.isPending) send.mutate(body)
      }}
    >
      <label htmlFor={fieldId} className={LABEL}>
        Reply
      </label>
      <textarea
        id={fieldId}
        rows={4}
        maxLength={REPLY_MAX}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          if (send.isError) send.reset()
        }}
        aria-describedby={countId}
        className={FIELD}
      />
      <span id={countId} className={COUNT}>{`${text.length} / ${REPLY_MAX}`}</span>
      {send.isError && (
        <p role="alert" className="font-serif text-sm text-[var(--color-ember)]">
          {send.error.message}
        </p>
      )}
      <button type="submit" className={BUTTON} disabled={!body || send.isPending}>
        Send
      </button>
    </form>
  )
}

function TicketItem({ ticket, open, onToggle }) {
  const panelId = `conversation-${ticket.id}`
  const closed = ticket.status === 'closed'

  return (
    <li id={ticket.id} className="card-surface border border-[var(--color-line-hi)] scroll-mt-24">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className="w-full min-h-[44px] flex flex-wrap items-center justify-between gap-x-4 gap-y-2 p-4 text-left cursor-pointer"
      >
        <span className="flex flex-col gap-1">
          <span className="font-serif font-bold text-lg text-[var(--color-bone)] break-words">{ticket.subject}</span>
          <span className="flex flex-wrap items-center gap-x-3 font-mono text-xs uppercase tracking-widest text-[var(--color-ash)]">
            <span>{topicLabel(ticket.topic)}</span>
            <span>{new Date(ticket.updated_at).toLocaleDateString()}</span>
          </span>
        </span>
        <StatusPill ticket={ticket} />
      </button>
      {open && (
        <div id={panelId} className="flex flex-col gap-4 border-t border-[var(--color-line)] p-4">
          {ticket.messages.map((m) => (
            <Message key={m.id} message={m} />
          ))}
          {closed ? (
            <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-ash)]">{closedLabel(ticket)}</p>
          ) : (
            <ReplyBox ticketId={ticket.id} />
          )}
        </div>
      )}
    </li>
  )
}

function hashTarget() {
  try {
    return decodeURIComponent(window.location.hash.slice(1))
  } catch {
    return ''
  }
}

function MyTickets() {
  const { user, session } = useAuth()
  const userId = user?.id ?? session?.user?.id
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState(() => new Set())
  // Once per ticket, however often the list refreshes.
  const marking = useRef(new Set())
  const hashHandled = useRef(false)
  const scrollTo = useRef(null)

  const {
    data: tickets,
    isLoading,
    error,
    refetch,
  } = useQuery({
    // The keeper's RLS can read every ticket, so the member's id is part of the question.
    queryKey: [...TICKETS_KEY, 'mine', userId],
    queryFn: () => fetchMyTickets(userId),
    enabled: Boolean(supabase && userId),
  })

  useEffect(() => {
    if (!tickets) return
    const unseen = tickets.filter((t) => t.status === 'answered' && !t.member_seen_at)
    const open = unseen.map((t) => t.id)

    if (!hashHandled.current) {
      hashHandled.current = true
      const target = hashTarget()
      if (target && tickets.some((t) => t.id === target)) {
        open.push(target)
        scrollTo.current = target
      }
    }

    if (open.length) {
      setExpanded((prev) => {
        if (open.every((id) => prev.has(id))) return prev
        return new Set([...prev, ...open])
      })
    }

    const fresh = unseen.filter((t) => !marking.current.has(t.id))
    if (fresh.length) {
      fresh.forEach((t) => marking.current.add(t.id))
      Promise.allSettled(
        fresh.map(async (t) => {
          try {
            await markTicketSeen(t.id)
          } catch (e) {
            // Let the next refresh try this one again.
            marking.current.delete(t.id)
            throw e
          }
        }),
      ).then((results) => {
        if (results.some((r) => r.status === 'fulfilled')) {
          queryClient.invalidateQueries({ queryKey: TICKETS_KEY })
        }
      })
    }
  }, [tickets, queryClient])

  // Scroll once the target's row has its final place: after the expanded rows above it opened.
  useEffect(() => {
    const id = scrollTo.current
    if (!id || !expanded.has(id)) return
    scrollTo.current = null
    document.getElementById(id)?.scrollIntoView?.({ block: 'start' })
  }, [expanded])

  const toggle = (id) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })

  let content
  if (error) {
    content = (
      <div className="flex flex-wrap items-center gap-3">
        <p role="alert" className="font-serif text-sm text-[var(--color-ember)]">
          {error.message}
        </p>
        <button type="button" className={BUTTON} onClick={() => refetch()}>
          Try again
        </button>
      </div>
    )
  } else if (isLoading) {
    content = (
      <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-ash)] animate-pulse">Loading…</p>
    )
  } else if (!tickets?.length) {
    content = (
      <div className="flex flex-col items-center gap-2 border border-dashed border-[var(--color-line)] py-12 text-center">
        <p className="font-serif italic text-[var(--color-ash)]">No tickets yet.</p>
        <a
          href="/help/"
          className="inline-flex items-center min-h-[44px] font-mono text-xs uppercase tracking-widest text-[var(--color-ember)] underline underline-offset-4"
        >
          Help
        </a>
      </div>
    )
  } else {
    content = (
      <ul className="flex flex-col gap-4">
        {tickets.map((t) => (
          <TicketItem key={t.id} ticket={t} open={expanded.has(t.id)} onToggle={() => toggle(t.id)} />
        ))}
      </ul>
    )
  }

  return (
    <div className="mt-8 max-w-2xl mx-auto">
      <h1 className="title text-3xl font-serif font-black mb-8">My tickets</h1>
      {content}
    </div>
  )
}

function MyTicketsWithAuth(props) {
  return (
    <RequireAuth>
      <MyTickets {...props} />
    </RequireAuth>
  )
}

export default withProviders(MyTicketsWithAuth)
