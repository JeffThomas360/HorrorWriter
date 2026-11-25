import { supabase } from '../supabaseClient'

/**
 * The staff "Suspected AI" tag and the evidence beside it. Every call here is a
 * staff RPC that checks mod_can('screen', area) in the database; a member who
 * called one would get nothing back.
 */

export const EVIDENCE_CAVEAT =
  "The writer's own browser reports these numbers, so they can be faked, and an honest writer who pastes from Word looks pasted. Use them as context, not proof."

async function call(name, args) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw new Error(error.message)
  return data
}

/** Everything tagged that the caller may screen, newest first. `author` narrows to one member. */
export async function fetchSuspected({ author } = {}) {
  return (await call('mod_ai_suspected_list', { p_author: author ?? null })) ?? []
}

// One list call shared by every [MOD] strip on the page: a thread with fifty posts
// asks once, not fifty times.
let taggedIds = null

export function forgetTaggedIds() {
  taggedIds = null
}

/** The ids of everything tagged. Empty when the list can't be read, so a strip still renders. */
export function fetchTaggedIds() {
  if (!taggedIds) {
    const mine = fetchSuspected()
      .then((rows) => new Set(rows.map((row) => row.target_id)))
      .catch((err) => {
        console.error('Could not read the suspected-AI tags:', err)
        if (taggedIds === mine) taggedIds = null
        return new Set()
      })
    taggedIds = mine
  }
  return taggedIds
}

/** { tag, machine, compose, history, reports } for one submission. */
export function fetchEvidence(targetType, targetId) {
  return call('mod_ai_evidence', { p_target_type: targetType, p_target_id: targetId })
}

export async function setSuspected(targetType, targetId, suspected, note) {
  await call('mod_set_ai_suspected', {
    p_target_type: targetType, p_target_id: targetId, p_suspected: suspected, p_note: note ?? null,
  })
  forgetTaggedIds()
}

/** Where a tagged row is read. */
export function suspicionHref(row) {
  switch (row.target_type) {
    case 'story': return `/library/read/${row.target_id}/`
    case 'critique': return `/library/read/${row.story_id}/`
    case 'thread': return `/forum/thread/${row.target_id}/`
    default: return `/forum/thread/${row.thread_id}/#post-${row.target_id}`
  }
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0)

/** The evidence in one line. Each part appears only when there is something to say. */
export function evidenceLine(evidence) {
  const parts = []

  const score = evidence?.machine?.score
  if (score !== null && score !== undefined && Number.isFinite(Number(score))) {
    parts.push(`Machine score ${Number(score).toFixed(2)}`)
  }

  const compose = evidence?.compose
  if (compose) {
    const pasted = num(compose.pasted)
    const imported = num(compose.imported)
    const dictated = num(compose.dictated)
    const total = num(compose.typed) + pasted + imported + dictated
    const share = (n) => `${Math.round((n / total) * 100)}%`
    const how = []
    if (pasted > 0) how.push(`${share(pasted)} pasted in ${plural(num(compose.pastes), 'paste')}`)
    if (imported > 0) how.push(`${share(imported)} imported`)
    if (dictated > 0) how.push(`${share(dictated)} dictated`)
    if (how.length === 0) how.push('none pasted')
    parts.push(`${num(compose.chars_final).toLocaleString('en-US')} chars, ${how.join(', ')}`)

    const minutes = Math.round(num(compose.active_ms) / 60000)
    parts.push(`editor in use ${minutes < 1 ? 'under 1 min' : `${minutes} min`} over ${plural(num(compose.sittings), 'sitting')}`)
  }

  const reports = num(evidence?.reports)
  if (reports > 0) parts.push(plural(reports, 'member report'))

  return parts.length ? parts.join(' · ') : 'No evidence recorded for this submission.'
}
