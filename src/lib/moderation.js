// Pure mirror of SQL public.mod_can(action, area) for UI gating ONLY.
// The real gate is server-side RLS + SECURITY DEFINER RPCs. Keep this matrix
// in sync with 00000000000000_baseline.sql (function mod_can).

// action -> roles permitted (before scope check). Keeper short-circuits true.
const MATRIX = {
  view_hidden:   ['sentinel', 'moderator', 'warden'],
  handle_report: ['sentinel', 'moderator', 'warden'],
  hide:          ['sentinel', 'moderator', 'warden'],
  screen:        ['moderator', 'warden'],
  shadowban:     ['warden'],
  ban:           ['warden'],
  read_audit:    ['warden'],
  assign_role:   [],   // keeper-only (handled by short-circuit)
  configure:     [],   // keeper-only
}

/** True when the profile holds any moderation role. */
export function isMod(profile) {
  return !!profile?.mod_role
}

/**
 * Can this profile perform `action` in `area` ('all' | 'forum' | 'library')?
 * Mirrors the SQL helper exactly.
 */
export function modCan(profile, action, area = 'all') {
  const role = profile?.mod_role
  if (!role) return false
  if (role === 'keeper') return true
  const allowed = MATRIX[action]
  if (!allowed || !allowed.includes(role)) return false
  const scope = profile.mod_scope || 'all'
  // permitted when scope is global, the request is global, or scope matches area
  return scope === 'all' || area === 'all' || scope === area
}
