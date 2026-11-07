import { supabase } from '../supabaseClient'

/**
 * What a member has put on the site, for Admin → Users and the case file.
 * Which kind a row is gets decided once, in SQL (member_submissions_index), because the
 * tables don't say: Ritual entries and Ritual critiques are both rows in `posts`.
 */
export const SUBMISSION_KINDS = [
  { id: 'story', label: 'Stories' },
  { id: 'ritual', label: 'Rituals' },
  { id: 'thread', label: 'Threads' },
  { id: 'reply', label: 'Replies' },
  { id: 'critique', label: 'Critiques' },
]

/** One member's submissions, newest first. Moderators only; the server enforces it. */
export async function fetchUserSubmissions(userId) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase.rpc('mod_user_submissions', { p_user: userId })
  if (error) throw new Error(error.message)
  return data ?? []
}

export function groupByKind(rows) {
  const groups = Object.fromEntries(SUBMISSION_KINDS.map((k) => [k.id, []]))
  for (const row of rows) groups[row.kind]?.push(row)
  return groups
}

export function summarize(rows) {
  const dates = rows.map((r) => r.created_at).sort((a, b) => new Date(a) - new Date(b))
  return {
    first: dates[0] ?? null,
    last: dates[dates.length - 1] ?? null,
    hidden: rows.filter((r) => r.mod_status === 'hidden').length,
    screening: rows.filter((r) => r.mod_status === 'screening').length,
    reports: rows.reduce((sum, r) => sum + (r.reports ?? 0), 0),
  }
}

/** Where a row opens. Critiques on stories live on the story's page; everything in a thread jumps to its post. */
export function submissionHref(row) {
  if (row.story_id) return `/library/read/${row.story_id}/`
  if (!row.thread_id) return null
  return row.kind === 'thread' ? `/forum/thread/${row.thread_id}/` : `/forum/thread/${row.thread_id}/#post-${row.id}`
}

/** "1 hidden, 2 in screening", or '' when nothing in this tally needs a second look. */
export function flagText(tally) {
  const parts = []
  if (tally?.hidden) parts.push(`${tally.hidden} hidden`)
  if (tally?.screening) parts.push(`${tally.screening} in screening`)
  return parts.join(', ')
}

export function totalSubmissions(user) {
  return Object.values(user?.submissions ?? {}).reduce((sum, tally) => sum + (tally?.total ?? 0), 0)
}

/** "1+" means at least one: that entry was edited before edits were being counted. */
export function formatEdits(row) {
  return `${row.edits ?? 0}${row.edits_is_minimum ? '+' : ''}`
}
