import { supabase } from '../supabaseClient'

/**
 * Fetch a profile row by handle. Returns `null` if no row matches (vs.
 * `.single()` which would throw on zero rows).
 */
export async function getProfileByHandle(handle) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('handle', handle)
    .maybeSingle()
  if (error) throw error
  return data
}

/**
 * Update the caller's own profile. RLS allows updates only when
 * `auth.uid() = id`, so passing a different `userId` will fail at the DB.
 *
 * @param {string} userId
 * @param {{ handle?: string, display_name?: string, bio?: string,
 *           location?: string, pronouns?: string, website_url?: string,
 *           avatar_url?: string }} fields
 */
export async function updateProfile(userId, fields) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase
    .from('profiles')
    .update(fields)
    .eq('id', userId)
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * Upload an avatar image to the `avatars` storage bucket and return a
 * cache-busted public URL (the `?t=…` suffix forces the <img> to re-fetch
 * even though we keep the same path).
 */
export async function uploadAvatar(userId, file) {
  if (!supabase) throw new Error('Supabase not configured')
  const ext = (file.name.split('.').pop() || 'png').toLowerCase()
  const path = `${userId}/avatar.${ext}`

  const { error: uploadErr } = await supabase
    .storage.from('avatars')
    .upload(path, file, { upsert: true, contentType: file.type })
  if (uploadErr) throw uploadErr

  const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
  return `${pub.publicUrl}?t=${Date.now()}`
}
