import { supabase } from '../supabaseClient'

/**
 * Writer-side Midnight Ritual: the current prompt, the local safety net and
 * saving drafts. The database is the gate: RLS on ritual_drafts lets a writer
 * save only their own draft, only against a released prompt, and refuses
 * banned members (20260930000000_midnight_ritual.sql).
 */

export const WORD_LIMIT = 2000

/** \S+ tokens: the same rule as the ritual_drafts CHECK. */
export function countWords(text) {
  const m = (text || '').match(/\S+/g)
  return m ? m.length : 0
}

const draftKey = (promptId) => `hw.ritual.draft.${promptId}`
const SAVE_FLAG = 'hw.ritual.saveAfterSignin'

// Every storage access is wrapped: with storage blocked, writing still works
// and only the safety net goes quiet.
function get(key) {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}
function set(key, value) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    /* storage unavailable */
  }
}
function remove(key) {
  try {
    window.localStorage.removeItem(key)
  } catch {
    /* storage unavailable */
  }
}

export const readLocalDraft = (promptId) => get(draftKey(promptId))
export const writeLocalDraft = (promptId, text) => set(draftKey(promptId), text)
export const clearLocalDraft = (promptId) => remove(draftKey(promptId))

/** Survives the sign-in round trip, including OAuth and passkey redirects. */
export const setSaveAfterSignin = (promptId) => set(SAVE_FLAG, promptId)
export function takeSaveAfterSignin() {
  const v = get(SAVE_FLAG)
  if (v) remove(SAVE_FLAG)
  return v
}

/**
 * The newest released prompt. The explicit filters matter: a keeper's RLS
 * policy can read future and pending prompts too, and must not see one here.
 */
export async function fetchCurrentPrompt(now = new Date()) {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('ritual_prompts')
    .select('id, body, goes_live_at')
    .eq('status', 'scheduled')
    .lte('goes_live_at', now.toISOString())
    .order('goes_live_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

/**
 * The 5 most recent released prompts (rotating weekly, staying active for 5 weeks).
 */
export async function fetchActivePrompts(limit = 5, now = new Date()) {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('ritual_prompts')
    .select('id, body, goes_live_at, created_at')
    .eq('status', 'scheduled')
    .lte('goes_live_at', now.toISOString())
    .order('goes_live_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}

/** When the next prompt unlocks, without its text. Null when nothing is scheduled. */
export async function fetchNextUnlock() {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('ritual_next_unlock')
  if (error) return null
  return data
}

export async function fetchMyDraft(promptId, userId) {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('ritual_drafts')
    .select('id, content, updated_at')
    .eq('prompt_id', promptId)
    .eq('author_id', userId)
    .maybeSingle()
  if (error) return null
  return data
}

export function ritualSaveErrorMessage(error) {
  if (error?.code === '23514') return `A ritual piece must be between 1 and ${WORD_LIMIT} words.`
  if (error?.code === '42501') return "Your draft couldn't be saved to your account. It's still kept on this device."
  return "Something went wrong saving your draft. It's still kept on this device."
}

export async function saveRitualDraft({ promptId, userId, content }) {
  if (!supabase) throw new Error(ritualSaveErrorMessage(null))
  const query = supabase
    .from('ritual_drafts')
    .upsert({ prompt_id: promptId, author_id: userId, content }, { onConflict: 'author_id,prompt_id' })
  const result = typeof query?.select === 'function' ? await query.select('id').maybeSingle() : await query
  if (result?.error) throw new Error(ritualSaveErrorMessage(result.error))
  return result?.data?.id
}

export function ritualPublishErrorMessage(error) {
  if (error?.code === 'HW013') return 'A story title must be between 1 and 200 characters.'
  if (error?.code === 'HW014') return 'Your story needs some words before it can be published.'
  if (error?.code === 'P0002') return "This channel's prompt isn't live yet, so it can't take entries."
  if (error?.code === '42501') return 'You do not have permission to publish this story.'
  return error?.message || 'Failed to publish for critique.'
}

/** The signed-in writer's newest entry in a thread — used to screen it and link to it. */
export async function fetchMyLatestEntryId(threadId, userId) {
  if (!supabase || !threadId || !userId) return null
  const { data, error } = await supabase
    .from('posts')
    .select('id')
    .eq('thread_id', threadId)
    .eq('author_id', userId)
    .is('parent_post_id', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) return null
  return data?.id ?? null
}

export async function shareRitualDraft({ draftId, title }) {
  if (!supabase) throw new Error("Could not share draft.")
  const trimmed = (title || '').trim()
  if (!trimmed || trimmed.length > 200) {
    throw new Error('A story title must be between 1 and 200 characters.')
  }
  const { data, error } = await supabase.rpc('share_ritual_draft', {
    p_draft_id: draftId,
    p_title: trimmed,
  })
  if (error) throw new Error(ritualPublishErrorMessage(error))
  return data
}

export async function publishRitualToForum({ title, content, promptId }) {
  if (!supabase) throw new Error('Could not publish to The Crypt.')
  const trimmedTitle = (title || '').trim()
  if (!trimmedTitle || trimmedTitle.length > 200) {
    throw new Error('A thread title must be between 1 and 200 characters.')
  }
  const trimmedContent = (content || '').trim()
  if (!trimmedContent) {
    throw new Error('Content is required.')
  }
  const { data, error } = await supabase.rpc('create_thread_with_post', {
    p_title: trimmedTitle,
    p_category_id: 'rituals',
    p_content: trimmedContent,
    p_prompt_id: promptId || null,
  })
  if (error) throw new Error(ritualPublishErrorMessage(error))
  return data
}
