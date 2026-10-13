import { supabase } from '../supabaseClient'

/**
 * Writer-side Midnight Ritual: the current prompt, the local safety net and
 * saving drafts. The database is the gate: RLS on ritual_drafts lets a writer
 * save only their own draft, only against a released prompt, and refuses
 * banned members (20260930000000_midnight_ritual.sql).
 */

export const WORD_LIMIT = 500

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
    .select('content, updated_at')
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
  const { error } = await supabase
    .from('ritual_drafts')
    .upsert({ prompt_id: promptId, author_id: userId, content }, { onConflict: 'author_id,prompt_id' })
  if (error) throw new Error(ritualSaveErrorMessage(error))
}
