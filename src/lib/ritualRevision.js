import { supabase } from '../supabaseClient'

/**
 * Mentoring a Midnight Ritual entry. A moderator puts it "under revision"
 * (hidden from readers, not deleted); the author and moderators talk in a
 * private thread; the author edits and marks it ready; a moderator shows it
 * again. Every write goes through an RPC that re-checks who is asking.
 */

export function revisionErrorMessage(error) {
  if (error?.code === 'HW024') return 'A message must be between 1 and 4000 characters.'
  if (error?.code === 'HW025') return 'This entry is already under revision.'
  if (error?.code === 'P0002') return 'This entry is not under revision.'
  if (error?.code === '42501') return "You can't do that on this entry."
  return error?.message || 'Something went wrong.'
}

async function call(fn, args) {
  if (!supabase) throw new Error('Not connected.')
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(revisionErrorMessage(error))
  return data
}

export const startRevision = (postId, note) => call('ritual_start_revision', { p_post_id: postId, p_note: note })
export const postFeedback = (postId, body) => call('ritual_post_feedback', { p_post_id: postId, p_body: body })
export const markReady = (postId) => call('ritual_mark_ready', { p_post_id: postId })
export const finishRevision = (postId) => call('ritual_finish_revision', { p_post_id: postId })

/** Entries in a thread that are under revision: [{ post_id, handle, created_at }]. Public. */
export async function fetchRevisionPlaceholders(threadId) {
  if (!supabase || !threadId) return []
  const { data, error } = await supabase.rpc('ritual_revision_placeholders', { p_thread_id: threadId })
  if (error) return []
  return data || []
}

/** The open revision for an entry, or null. Only its author and moderators can read it. */
export async function fetchOpenRevision(postId) {
  if (!supabase) return null
  const { data } = await supabase
    .from('ritual_revisions')
    .select('post_id, started_at, ready_at, resolved_at')
    .eq('post_id', postId)
    .is('resolved_at', null)
    .maybeSingle()
  return data || null
}

export async function fetchFeedback(postId) {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('ritual_feedback')
    .select('id, sender_id, body, created_at, profiles:sender_id(handle)')
    .eq('post_id', postId)
    .order('created_at', { ascending: true })
  if (error) return []
  return data || []
}
