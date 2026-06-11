import { supabase } from '../supabaseClient'

/** Search profiles by handle substring (for the Registry). */
export async function searchUsers(query) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase
    .from('profiles')
    .select('id, handle, display_name, avatar_url, mod_role, mod_scope')
    .ilike('handle', `%${query}%`)
    .order('handle')
    .limit(20)
  if (error) throw new Error(error.message)
  return data ?? []
}

/** Keeper-only: assign (or with role=null, revoke) a moderation role. */
export async function assignRole(targetId, role, scope = 'all') {
  if (!supabase) throw new Error('Supabase not configured')
  const { error } = await supabase.rpc('set_mod_role', {
    p_target: targetId, p_role: role, p_scope: scope,
  })
  if (error) throw new Error(error.message)
}

export async function revokeRole(targetId) {
  return assignRole(targetId, null, 'all')
}

/** Public read of the emoji↔role map. */
export async function getRoleBadges() {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase
    .from('mod_role_badges')
    .select('role, emoji, label')
  if (error) throw new Error(error.message)
  return data ?? []
}

/** Keeper-only: edit a role's badge. */
export async function setRoleBadge(role, emoji, label) {
  if (!supabase) throw new Error('Supabase not configured')
  const { error } = await supabase.rpc('set_role_badge', {
    p_role: role, p_emoji: emoji, p_label: label,
  })
  if (error) throw new Error(error.message)
}
