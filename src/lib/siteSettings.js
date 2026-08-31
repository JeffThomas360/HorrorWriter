import { supabase } from '../supabaseClient'

/**
 * Site-wide configuration — one row, read by everyone, written only through
 * the audited set_site_setting() RPC. See
 * supabase/migrations/20260822010000_site_settings.sql.
 */

export const DEFAULT_SETTINGS = {
  registration_open: true,
  maintenance_mode: false,
  maintenance_message: null,
  announcement_text: null,
  announcement_active: false,
  announcement_severity: 'info',
}

export async function fetchSiteSettings() {
  if (!supabase) return DEFAULT_SETTINGS
  const { data, error } = await supabase
    .from('site_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle()
  // A failed settings read must never take the site down — fall back to
  // permissive defaults rather than throwing into MainLayout's island.
  if (error || !data) return DEFAULT_SETTINGS
  return data
}

/** Keeper-only. Pass only the keys that changed; the RPC leaves the rest alone. */
export async function updateSiteSettings(patch) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase.rpc('set_site_setting', {
    p_registration_open:     patch.registration_open     ?? null,
    p_maintenance_mode:      patch.maintenance_mode      ?? null,
    p_maintenance_message:   patch.maintenance_message   ?? null,
    p_announcement_text:     patch.announcement_text     ?? null,
    p_announcement_active:   patch.announcement_active   ?? null,
    p_announcement_severity: patch.announcement_severity ?? null,
  })
  if (error) throw new Error(error.message)
  return data
}

/**
 * The user directory. Deliberately fetches all profiles and sorts/filters on
 * the client — correct up to a few thousand rows, and this site is sized for
 * dozens. Swap to .range() pagination if that ever stops being true.
 *
 * Note: profiles has no last_active column, so "joined" is the only real
 * recency signal available; updated_at reflects profile edits, not visits.
 */
export async function fetchAllUsers() {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase
    .from('profiles')
    .select('id, handle, display_name, avatar_url, mod_role, mod_scope, banned_until, is_shadowbanned, requires_screening, created_at')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data ?? []
}

/** Paged audit trail for the Admin Audit tab. Requires read_audit (warden/keeper). */
export async function fetchAuditLog({ limit = 100 } = {}) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase
    .from('mod_actions')
    .select('id, action, target_type, target_id, target_user_id, reason, created_at, profiles!actor_id(handle)')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return data ?? []
}
