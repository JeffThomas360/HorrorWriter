import { supabase } from '../supabaseClient'

/**
 * Block a user.
 * @param {string} blockedId - UUID of the user to block
 */
export async function blockUser(blockedId) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('You must be signed in to block a user.')

  const { error } = await supabase
    .from('user_blocks')
    .insert([{ blocker_id: user.id, blocked_id: blockedId }])

  if (error) throw new Error(error.message)
}

/**
 * Unblock a user.
 * @param {string} blockedId - UUID of the user to unblock
 */
export async function unblockUser(blockedId) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('You must be signed in to unblock a user.')

  const { error } = await supabase
    .from('user_blocks')
    .delete()
    .eq('blocker_id', user.id)
    .eq('blocked_id', blockedId)

  if (error) throw new Error(error.message)
}

/**
 * Check if the current user has blocked a target user.
 * @param {string} blockedId - UUID of the target user
 * @returns {Promise<boolean>}
 */
export async function isBlocked(blockedId) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { data, error } = await supabase
    .from('user_blocks')
    .select('id')
    .eq('blocker_id', user.id)
    .eq('blocked_id', blockedId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return !!data
}
