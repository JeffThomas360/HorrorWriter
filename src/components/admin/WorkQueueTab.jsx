import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { fetchOpenTasks, resolveTask, snoozeTask, addManualTask } from '../../lib/keeperTaskApi'
import {
  visibleTasks, sortTasks, countsByType, typeInfo, describeTask, actionsFor, isSnoozed, TASK_TYPES,
} from '../../lib/keeperTasks'

/**
 * Keeper work queue. Renders any task from the registry in src/lib/keeperTasks.js.
 * Every write is a keeper RPC that checks the gate and logs to mod_actions; this
 * component only decides what to offer.
 */

export const TASKS_KEY = ['admin', 'keeper-tasks']

const FIELD = 'bg-[var(--color-void)] border border-[var(--color-line)] px-3 py-2 text-sm text-[var(--color-bone)] focus:border-[var(--color-ember)] outline-none'
const btn = 'font-mono text-xs uppercase px-3 py-1 border border-[var(--color-line-hi)] text-[var(--color-bone)] hover:border-[var(--color-bone)] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed'

function TaskCard({ task, busy, onAction, onSnooze }) {
  const info = typeInfo(task.type)
  const detail = info.detail(task)
  const href = info.link(task)
  const snoozed = isSnoozed(task)
  return (
    <li className={`card-surface border p-4 flex flex-col gap-2 ${task.priority === 1 ? 'border-[var(--color-blood)]' : 'border-[var(--color-line-hi)]'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-ash)]">{info.label}</span>
        {task.priority === 1 && <span className="font-mono text-[10px] uppercase text-[var(--color-ember)]">High priority</span>}
        {snoozed && <span className="font-mono text-[10px] uppercase text-[var(--color-ash)]">Snoozed until {new Date(task.snoozed_until).toLocaleDateString()}</span>}
        <span className="ml-auto font-mono text-[10px] text-[var(--color-ash)]">{new Date(task.created_at).toLocaleDateString()}</span>
      </div>
      <p className="font-serif text-sm text-[var(--color-bone)]">{describeTask(task)}</p>
      {detail && <p className="text-xs text-[var(--color-ash)] font-serif whitespace-pre-wrap">{detail}</p>}
      {href && <a href={href} className="self-start text-xs underline text-[var(--color-ember)]">Open</a>}
      <div className="flex flex-wrap items-center gap-2">
        {actionsFor(task).map((a) => (
          <button key={a.id} type="button" className={btn} disabled={busy} onClick={() => onAction(task.id, a.id)}>{a.label}</button>
        ))}
        <span className="flex-1" />
        <button type="button" className={btn} disabled={busy} onClick={() => onSnooze(task.id, 1)}>Snooze 1 day</button>
        <button type="button" className={btn} disabled={busy} onClick={() => onSnooze(task.id, 7)}>Snooze 7 days</button>
      </div>
    </li>
  )
}

export default function WorkQueueTab() {
  const queryClient = useQueryClient()
  const { data: tasks = [], isLoading, error } = useQuery({ queryKey: TASKS_KEY, queryFn: fetchOpenTasks })
  const [type, setType] = useState('all')
  const [showSnoozed, setShowSnoozed] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin', 'keeper-tasks'] })
  const onError = (e) => { toast.error(e.message); refresh() }

  const act = useMutation({
    mutationFn: ({ id, action }) => resolveTask(id, action),
    onSuccess: () => { toast.success('Done'); refresh() },
    onError,
  })
  const snooze = useMutation({
    mutationFn: ({ id, days }) => snoozeTask(id, days),
    onSuccess: () => { toast.success('Snoozed'); refresh() },
    onError,
  })
  const add = useMutation({
    mutationFn: () => addManualTask(title.trim(), body.trim() || null),
    onSuccess: () => { toast.success('Added'); setTitle(''); setBody(''); refresh() },
    onError,
  })

  const busy = act.isPending || snooze.isPending
  const counts = countsByType(tasks)
  const types = [...new Set([...Object.keys(TASK_TYPES), ...tasks.map((t) => t.type)])]
  const shown = sortTasks(visibleTasks(tasks, { type, showSnoozed }))

  if (isLoading) return <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-ash)] animate-pulse">Reading the queue…</p>
  if (error && !tasks.length) return <p className="text-sm text-[var(--color-ember)]">{error.message}</p>

  return (
    <div className="flex flex-col gap-6">
      {error && <p role="alert" className="text-sm text-[var(--color-ember)]">{error.message}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <label className="font-mono text-xs uppercase text-[var(--color-ash)]">
          <span className="sr-only">Filter by type</span>
          <select aria-label="Filter by type" value={type} onChange={(e) => setType(e.target.value)} className={FIELD}>
            <option value="all">All types</option>
            {types.map((t) => (
              <option key={t} value={t}>{typeInfo(t).label} ({counts[t] ?? 0})</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-[var(--color-ash)] cursor-pointer">
          <input type="checkbox" checked={showSnoozed} onChange={(e) => setShowSnoozed(e.target.checked)} />
          Show snoozed
        </label>
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-[var(--color-ash)] font-serif italic">Nothing waiting. The queue is quiet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              busy={busy}
              onAction={(id, action) => act.mutate({ id, action })}
              onSnooze={(id, days) => snooze.mutate({ id, days })}
            />
          ))}
        </ul>
      )}

      <form
        className="card-surface border border-[var(--color-line-hi)] p-4 flex flex-col gap-2"
        onSubmit={(e) => { e.preventDefault(); if (title.trim()) add.mutate() }}
      >
        <span className="font-mono text-xs uppercase tracking-widest text-[var(--color-ash)]">Add a to-do</span>
        <input aria-label="To-do title" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className={FIELD} />
        <textarea aria-label="To-do details" rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Details (optional)" className={FIELD} />
        <button type="submit" className={`${btn} self-start`} disabled={!title.trim() || add.isPending}>Add to-do</button>
      </form>
    </div>
  )
}
