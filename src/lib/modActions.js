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

export async function submitReport({ targetType, targetId, category, details }) {
  if (!supabase) throw new Error('Supabase not configured')
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('You must be signed in to submit a report.')

  const { data, error } = await supabase
    .from('reports')
    .insert([{ 
      reporter_id: user.id,
      target_type: targetType, 
      target_id: targetId || null, 
      category, 
      details 
    }])
    .select()
    .single()
  if (error) throw new Error(error.message)
  
  if (category === 'urgent' && data) {
    supabase.functions.invoke('urgent-report-email', { body: { reportId: data.id } }).catch(console.error)
  }
}

export async function resolveReport(reportId, actionTaken, resolutionNote) {
  if (!supabase) throw new Error('Supabase not configured')
  const { error } = await supabase.rpc('resolve_report', {
    p_report_id: reportId,
    p_action_taken: actionTaken,
    p_resolution_note: resolutionNote
  })
  if (error) throw new Error(error.message)
}

export async function setContentModStatus(targetType, targetId, status, reason) {
  if (!supabase) throw new Error('Supabase not configured')
  const { error } = await supabase.rpc('set_content_mod_status', {
    p_target_type: targetType,
    p_target_id: targetId,
    p_status: status,
    p_reason: reason
  })
  if (error) throw new Error(error.message)
}

export async function resolveStorm(stormId, confirmed, note) {
  if (!supabase) throw new Error('Supabase not configured')
  const { error } = await supabase.rpc('resolve_storm', {
    p_storm_id: stormId,
    p_confirmed: confirmed,
    p_note: note,
  })
  if (error) throw new Error(error.message)
}

export async function submitAppeal({ modActionId, targetType, explanation }) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('You must be signed in to submit an appeal.')

  const { error } = await supabase
    .from('reports')
    .insert([{
      reporter_id: user.id,
      target_type: 'appeal',
      target_id: modActionId,
      category: 'other',
      details: explanation,
      source: 'user',
    }])
  if (error) throw new Error(error.message)
}

export async function resolveAppeal(reportId, upheld, reason) {
  if (!supabase) throw new Error('Supabase not configured')
  const { error } = await supabase.rpc('resolve_appeal', {
    p_report_id: reportId,
    p_upheld: upheld,
    p_reason: reason,
  })
  if (error) throw new Error(error.message)
}
