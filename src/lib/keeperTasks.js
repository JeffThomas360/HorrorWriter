/**
 * Keeper work queue registry and pure helpers.
 *
 * To add a task type: add an entry to TASK_TYPES here, add a `when` branch to
 * keeper_task_apply_action() in a new migration, and call create_keeper_task()
 * from wherever the work arises. The tab renders any task from this registry.
 * The server rejects an action a type does not define, so the two stay in step.
 */

import { topicLabel } from './tickets'

export const TASK_TYPES = {
  manual: {
    label: 'To-do',
    describe: (t) => t.payload?.title || 'Untitled task',
    detail: (t) => t.payload?.body ?? null,
    link: () => null,
    actions: [
      { id: 'done', label: 'Done' },
      { id: 'dismiss', label: 'Dismiss' },
    ],
  },
  // A member's ticket. It has no generic actions: TicketCard replies, resolves and
  // dismisses through the ticket RPCs, which keep the ticket and this task in step
  // (resolve_keeper_task refuses a ticket task whose ticket still exists).
  ticket: {
    label: 'Ticket',
    describe: (t) => t.payload?.subject,
    detail: (t) => topicLabel(t.payload?.topic) + (t.payload?.handle ? ' — @' + t.payload.handle : ''),
    link: () => null,
    actions: [],
  },
}

const UNKNOWN = {
  label: 'Unknown task',
  describe: (t) => t.type,
  detail: () => null,
  link: () => null,
  actions: [],
}

export const typeInfo = (type) => (Object.hasOwn(TASK_TYPES, type) ? TASK_TYPES[type] : UNKNOWN)
export const describeTask = (t) => typeInfo(t.type).describe(t)
export const actionsFor = (t) => typeInfo(t.type).actions

export function isSnoozed(task, now = new Date()) {
  return Boolean(task.snoozed_until) && new Date(task.snoozed_until) > now
}

export function sortTasks(tasks) {
  return [...tasks].sort(
    (a, b) => (b.priority ?? 0) - (a.priority ?? 0) || new Date(a.created_at) - new Date(b.created_at),
  )
}

// `topic` narrows ticket tasks only (by payload.topic); every other type is untouched.
export function visibleTasks(tasks, { type = 'all', topic = 'all', showSnoozed = false, now = new Date() } = {}) {
  return tasks.filter(
    (t) => t.status === 'open'
      && (type === 'all' || t.type === type)
      && (topic === 'all' || t.type !== 'ticket' || t.payload?.topic === topic)
      && (showSnoozed || !isSnoozed(t, now)),
  )
}

export const openCount = (tasks, now = new Date()) => visibleTasks(tasks, { now }).length

export function countsByType(tasks, now = new Date()) {
  const out = {}
  for (const t of visibleTasks(tasks, { now })) out[t.type] = (out[t.type] ?? 0) + 1
  return out
}
