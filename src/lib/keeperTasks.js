/**
 * Keeper work queue registry and pure helpers.
 *
 * To add a task type: add an entry to TASK_TYPES here, add a `when` branch to
 * keeper_task_apply_action() in a new migration, and call create_keeper_task()
 * from wherever the work arises. The tab renders any task from this registry.
 * The server rejects an action a type does not define, so the two stay in step.
 */

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
}

const UNKNOWN = {
  label: 'Unknown task',
  describe: (t) => t.type,
  detail: () => null,
  link: () => null,
  actions: [],
}

export const typeInfo = (type) => TASK_TYPES[type] ?? UNKNOWN
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

export function visibleTasks(tasks, { type = 'all', showSnoozed = false, now = new Date() } = {}) {
  return tasks.filter(
    (t) => t.status === 'open'
      && (type === 'all' || t.type === type)
      && (showSnoozed || !isSnoozed(t, now)),
  )
}

export const openCount = (tasks, now = new Date()) => visibleTasks(tasks, { now }).length

export function countsByType(tasks, now = new Date()) {
  const out = {}
  for (const t of visibleTasks(tasks, { now })) out[t.type] = (out[t.type] ?? 0) + 1
  return out
}
