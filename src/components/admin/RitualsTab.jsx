import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  fetchRitualQueue, addPrompt, editPrompt, approvePrompt,
  unschedulePrompt, rejectPrompt,
} from '../../lib/ritualAdmin'
import { formatSlot, splitQueue } from '../../lib/ritualSchedule'

/**
 * Midnight Ritual prompt queue. The keeper writes every prompt; there is no
 * AI drafting on the site (Jeff, 2026-10-01). Every write is a keeper RPC that
 * checks mod_can('configure','all') and logs to mod_actions; this component
 * only decides what to offer. Released prompts are locked in the database
 * too — hiding their buttons here is courtesy, not the guard.
 */

const MIN = 10
const MAX = 400
const QUEUE_KEY = ['admin', 'ritual-queue']
const COUNT_KEY = ['admin', 'ritual-future-count']

const lenOk = (s) => { const n = s.trim().length; return n >= MIN && n <= MAX }

function Counter({ value }) {
  const n = value.trim().length
  const bad = n > MAX
  return <span className={`font-mono text-[10px] ${bad ? 'text-[var(--color-ember)]' : 'text-[var(--color-ash)]'}`}>{n} / {MAX}</span>
}

function Section({ title, children }) {
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <h3 className="font-mono text-xs uppercase tracking-widest text-[var(--color-ash)]">{title}</h3>
      {children}
    </section>
  )
}

const empty = (text) => <p className="text-sm text-[var(--color-ash)] font-serif italic">{text}</p>
const btn = 'font-mono text-xs uppercase px-3 py-1 border border-[var(--color-line-hi)] text-[var(--color-bone)] hover:border-[var(--color-bone)] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed'

function PendingRow({ row, busy, onEdit, onApprove, onReject }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(row.body)
  return (
    <li className="card-surface border border-[var(--color-line-hi)] p-3 flex flex-col gap-2">
      {editing ? (
        <>
          <textarea
            aria-label="Edit prompt"
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="card-surface p-2 text-sm border border-[var(--color-line-hi)] focus:border-[var(--color-bone)] outline-none"
          />
          <div className="flex items-center gap-2">
            <Counter value={draft} />
            <button type="button" className={btn} disabled={busy || !lenOk(draft)} onClick={() => onEdit(row.id, draft.trim(), () => setEditing(false))}>Save</button>
            <button type="button" className={btn} disabled={busy} onClick={() => { setDraft(row.body); setEditing(false) }}>Cancel</button>
          </div>
        </>
      ) : (
        <>
          <p className="font-serif text-sm text-[var(--color-bone)]">&ldquo;{row.body}&rdquo;</p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={btn} disabled={busy} onClick={() => setEditing(true)}>Edit</button>
            <button type="button" className={btn} disabled={busy} onClick={() => onApprove(row.id)}>Approve</button>
            <button type="button" className={btn} disabled={busy} onClick={() => onReject(row.id)}>Reject</button>
          </div>
        </>
      )}
    </li>
  )
}

export default function RitualsTab() {
  const queryClient = useQueryClient()
  const { data: rows = [], isLoading, error } = useQuery({ queryKey: QUEUE_KEY, queryFn: fetchRitualQueue })
  const [newBody, setNewBody] = useState('')

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: QUEUE_KEY })
    queryClient.invalidateQueries({ queryKey: COUNT_KEY })
  }

  // A ref, not mutation.isPending: a second click can land before React
  // re-renders the disabled button, and the render-time flag would be stale.
  const inFlight = useRef(false)
  const mutation = useMutation({
    mutationFn: ({ run }) => run(),
    onSuccess: (result, { success }) => success?.(result),
    onError: (e) => toast.error(e.message),
    onSettled: () => { inFlight.current = false; refresh() },
  })
  const busy = mutation.isPending
  const act = (run, success) => {
    if (inFlight.current) return
    inFlight.current = true
    mutation.mutate({ run, success })
  }

  if (isLoading) return <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-ash)] animate-pulse">Reading the queue…</p>
  if (error) return <p role="alert" className="text-sm text-[var(--color-ember)]">{error.message}</p>

  const { live, upcoming, pending } = splitQueue(rows, new Date())

  return (
    <div className="flex flex-col gap-8">
      <Section title="Live now">
        {live ? (
          <div className="card-surface border border-[var(--color-line)] p-3 flex flex-col gap-1">
            <p className="font-serif text-sm text-[var(--color-bone)]">&ldquo;{live.body}&rdquo;</p>
            <span className="font-mono text-[10px] uppercase text-[var(--color-ash)]">Live — locked · since {formatSlot(live.goes_live_at)}</span>
          </div>
        ) : empty('Nothing has gone live yet.')}
      </Section>

      <Section title="Add a prompt">
        <textarea
          aria-label="New prompt"
          rows={3}
          value={newBody}
          onChange={(e) => setNewBody(e.target.value)}
          placeholder="The lighthouse keeper logs a ship that sank in 1911."
          className="card-surface p-3 text-sm border border-[var(--color-line-hi)] focus:border-[var(--color-bone)] outline-none"
        />
        <div className="flex items-center gap-3">
          <Counter value={newBody} />
          <button
            type="button"
            className={btn}
            disabled={busy || !lenOk(newBody)}
            onClick={() => act(() => addPrompt(newBody.trim()), () => { setNewBody(''); toast.success('Added. Approve it to schedule it.') })}
          >
            Add prompt
          </button>
        </div>
      </Section>

      <Section title={`Waiting for approval (${pending.length})`}>
        {pending.length ? (
          <ul className="flex flex-col gap-3">
            {pending.map((r) => (
              <PendingRow
                key={r.id}
                row={r}
                busy={busy}
                onEdit={(id, body, done) => act(() => editPrompt(id, body), () => { done(); toast.success('Prompt updated.') })}
                onApprove={(id) => act(() => approvePrompt(id), (slot) => toast.success(`Scheduled: goes live ${formatSlot(slot)}`))}
                onReject={(id) => { if (window.confirm('Delete this prompt for good?')) act(() => rejectPrompt(id), () => toast.success('Prompt deleted.')) }}
              />
            ))}
          </ul>
        ) : empty('Nothing waiting. Add a prompt above.')}
      </Section>

      <Section title="Schedule">
        {upcoming.length ? (
          <ol className="flex flex-col gap-3">
            {upcoming.map((r) => (
              <li key={r.id} className="card-surface border border-[var(--color-line-hi)] p-3 flex flex-col gap-2">
                <p className="font-serif text-sm text-[var(--color-bone)]">&ldquo;{r.body}&rdquo;</p>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[10px] uppercase text-[var(--color-ash)]">Goes live {formatSlot(r.goes_live_at)}</span>
                  <button type="button" className={btn} disabled={busy} onClick={() => act(() => unschedulePrompt(r.id), () => toast.success('Back to pending. Later prompts moved up.'))}>Un-schedule</button>
                </div>
              </li>
            ))}
          </ol>
        ) : empty('Nothing scheduled.')}
      </Section>
    </div>
  )
}
