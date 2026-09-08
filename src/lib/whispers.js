import { supabase } from '../supabaseClient'

/**
 * Whispers in the Void.
 *
 * Displayed without attribution, stored attributed. `author_id` is written on
 * every row so sanctions, bans and blocks reach this surface like any other —
 * but it is never selected here, so it never reaches a reader's browser.
 */

export const WHISPER_MIN = 8
export const WHISPER_MAX = 280

/** Public columns. Deliberately excludes author_id. */
const PUBLIC_COLUMNS = 'id, text, category, created_at'

export function validateWhisper(text) {
  const trimmed = (text ?? '').trim()
  if (trimmed.length < WHISPER_MIN) {
    return { ok: false, error: `A whisper needs at least ${WHISPER_MIN} characters.` }
  }
  if (trimmed.length > WHISPER_MAX) {
    return { ok: false, error: `A whisper can be at most ${WHISPER_MAX} characters.` }
  }
  return { ok: true, text: trimmed }
}

export async function fetchWhispers(limit = 12) {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('whispers')
    .select(PUBLIC_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data ?? []
}

export async function releaseWhisper(text, category = 'Unspoken') {
  if (!supabase) throw new Error('Supabase is not configured.')
  const check = validateWhisper(text)
  if (!check.ok) throw new Error(check.error)

  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user?.id) throw new Error('Sign in to release a whisper into the dark.')

  const { data, error } = await supabase
    .from('whispers')
    .insert({ author_id: session.user.id, text: check.text, category })
    .select(PUBLIC_COLUMNS)
    .single()
  if (error) throw error

  // Same fire-and-forget pre-screen every other content type uses.
  supabase.functions
    .invoke('moderate-content', { body: { targetType: 'whisper', targetId: data.id } })
    .catch(console.error)

  return data
}

export async function deleteWhisper(id) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { error } = await supabase.from('whispers').delete().eq('id', id)
  if (error) throw error
}
