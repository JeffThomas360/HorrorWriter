import { supabase } from '../supabaseClient'
import { MIN_WORDS, WORD_LIMIT } from './ritualDraft'

/**
 * Authors editing and deleting their own Midnight Ritual entries. Editing goes
 * through ritual_edit_entry (ownership, title and word range are re-checked in
 * the database); deleting is the author's own DELETE and is permanent.
 */

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function ordinal(n) {
  const suffixes = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0])
}

/** "Edited October 22nd, 2026 @ 1657", in the reader's own time zone. */
export function formatEdited(value) {
  const d = new Date(value)
  if (!value || Number.isNaN(d.getTime())) return ''
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `Edited ${MONTHS[d.getMonth()]} ${ordinal(d.getDate())}, ${d.getFullYear()} @ ${hh}${mm}`
}

export function ritualEditErrorMessage(error) {
  if (error?.code === 'HW013') return 'A story title must be between 1 and 200 characters.'
  if (error?.code === 'HW014') return `Your story must be between ${MIN_WORDS} and ${WORD_LIMIT} words.`
  if (error?.code === 'HW023') return `A ritual response needs at least ${MIN_WORDS} words.`
  if (error?.code === 'P0002') return 'This entry could not be found.'
  if (error?.code === '42501') return "This entry can't be edited right now."
  return error?.message || 'Something went wrong saving your edit.'
}

/** Resolves to the new edited_at timestamp. */
export async function editRitualEntry({ postId, title, content }) {
  if (!supabase) throw new Error(ritualEditErrorMessage(null))
  const { data, error } = await supabase.rpc('ritual_edit_entry', {
    p_post_id: postId,
    p_title: (title || '').trim(),
    p_content: content,
  })
  if (error) throw new Error(ritualEditErrorMessage(error))
  return data
}

/** Deletes the entry for good. Resolves to { threadGone } (the last entry takes its thread with it). */
export async function deleteRitualEntry({ postId, threadId }) {
  if (!supabase) throw new Error('Could not delete this entry.')
  const { data, error } = await supabase.from('posts').delete().eq('id', postId).select('id')
  if (error || !data?.length) throw new Error('Could not delete this entry.')
  const { data: thread } = await supabase.from('threads').select('id').eq('id', threadId).maybeSingle()
  return { threadGone: !thread }
}
