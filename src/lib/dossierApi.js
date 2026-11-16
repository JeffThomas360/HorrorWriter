import { supabase } from '../supabaseClient'

/** One member's dossier, worked out by the database on demand. Keeper only. Null = no such member. */
export async function fetchUserDossier(userId) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase.rpc('mod_user_dossier', { p_user: userId })
  if (error) throw new Error(error.message)
  return data ?? null
}

/** The roll-up above the member list: { members, wrote, got_response, came_back }. Keeper only. */
export async function fetchMemberFunnel() {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase.rpc('admin_member_funnel')
  if (error) throw new Error(error.message)
  return data
}
