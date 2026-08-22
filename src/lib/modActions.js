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

/** Where a report/case-file link for a piece of content should point. */
export function contentHref(targetType, targetId) {
  if (targetType === 'story' || targetType === 'critique') return `/library/read/${targetId}`
  if (targetType === 'thread' || targetType === 'post') return `/forum/thread/${targetId}`
  return null
}

/**
 * A user's full moderation "case file": reports filed against them, reports
 * they've filed themselves (pattern-spotting for bad-faith reporters), and —
 * when the viewer holds read_audit (warden/keeper) — the mod_actions taken
 * against them. Each list is capped; this is a triage view, not a full export.
 * Queries are RLS-scoped to the caller already, so a lower-privileged caller
 * simply gets an empty actionsAgainst array rather than an error.
 */
export async function fetchUserCaseFile(userId, { includeAudit = false } = {}) {
  if (!supabase) throw new Error('Supabase not configured')

  const [reportsAgainstRes, reportsFiledRes, notesRes] = await Promise.all([
    supabase
      .from('reports')
      .select('id, target_type, target_id, category, status, details, created_at')
      .eq('target_type', 'user')
      .eq('target_id', userId)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('reports')
      .select('id, target_type, target_id, category, status, created_at')
      .eq('reporter_id', userId)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('mod_notes')
      .select('*, profiles!author_id(handle)')
      .eq('target_user_id', userId)
      .order('created_at', { ascending: false }),
  ])

  let actionsAgainst = []
  if (includeAudit) {
    const { data } = await supabase
      .from('mod_actions')
      .select('id, action, target_type, target_id, reason, created_at')
      .eq('target_user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10)
    actionsAgainst = data ?? []
  }

  return {
    reportsAgainst: reportsAgainstRes.data ?? [],
    reportsFiled: reportsFiledRes.data ?? [],
    notes: notesRes.data ?? [],
    actionsAgainst,
  }
}

/**
 * Counts for the Overview tab's stat row. Every query here is scoped by the
 * same RLS the individual tabs already rely on, so a lower-privileged mod
 * just sees the numbers their role can see — nothing new is exposed.
 */
export async function fetchOverviewCounts() {
  if (!supabase) throw new Error('Supabase not configured')

  const [reports, appeals, support, storms, sanctioned] = await Promise.all([
    supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'open').not('target_type', 'in', '(appeal,site)'),
    supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'open').eq('target_type', 'appeal'),
    supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'open').eq('target_type', 'site'),
    supabase.from('storm_alerts').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).gt('banned_until', new Date().toISOString()),
  ])

  return {
    openReports: reports.count ?? 0,
    openAppeals: appeals.count ?? 0,
    openSupport: support.count ?? 0,
    pendingStorms: storms.count ?? 0,
    activeSanctions: sanctioned.count ?? 0,
  }
}

/** Recent audit trail — requires read_audit (warden/keeper); callers should gate on modCan first. */
export async function fetchRecentModActions(limit = 12) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase
    .from('mod_actions')
    .select('id, action, target_type, target_id, target_user_id, reason, created_at, profiles!actor_id(handle)')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return data ?? []
}

/** All currently-active sanctions, for the Sanctions tab's roster view. */
export async function fetchActiveSanctions() {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase
    .from('profiles')
    .select('id, handle, banned_until')
    .gt('banned_until', new Date().toISOString())
    .order('banned_until', { ascending: false })
  if (error) throw new Error(error.message)
  return data ?? []
}

/**
 * Site-wide counts for the Admin page. Deliberately broader than
 * fetchOverviewCounts (which is queue-focused, for moderators) — this is the
 * keeper-only "how big is the site" view. Every table here has a public or
 * keeper-readable count via RLS, so no new exposure is introduced.
 */
export async function fetchSiteStats() {
  if (!supabase) throw new Error('Supabase not configured')

  const [users, stories, threads, critiques, reportsHandled, sanctioned] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('books').select('id', { count: 'exact', head: true }).eq('status', 'live'),
    supabase.from('threads').select('id', { count: 'exact', head: true }).eq('status', 'live'),
    supabase.from('book_comments').select('id', { count: 'exact', head: true }).eq('status', 'live'),
    supabase.from('reports').select('id', { count: 'exact', head: true }).neq('status', 'open'),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).gt('banned_until', new Date().toISOString()),
  ])

  return {
    totalUsers: users.count ?? 0,
    liveStories: stories.count ?? 0,
    liveThreads: threads.count ?? 0,
    liveCritiques: critiques.count ?? 0,
    reportsHandled: reportsHandled.count ?? 0,
    activeSanctions: sanctioned.count ?? 0,
  }
}
