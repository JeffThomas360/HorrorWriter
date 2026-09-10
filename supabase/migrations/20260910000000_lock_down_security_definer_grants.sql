-- supabase/migrations/20260910000000_lock_down_security_definer_grants.sql
--
-- Narrow EXECUTE grants on SECURITY DEFINER functions (advisor lints 0028 / 0029).
--
-- Audit finding (2026-09-10): every privileged RPC already enforces its own
-- authorization internally (mod_can(...) or an explicit Keeper check), so no
-- privilege escalation was reachable. What WAS wrong is the grant surface:
-- several functions were left EXECUTE-to-PUBLIC by the `create function`
-- default, which publishes them at /rest/v1/rpc/<name> to unauthenticated
-- callers. This migration revokes what nothing needs, and makes every
-- remaining grant explicit rather than inherited from PUBLIC.
--
-- The one genuine exposure closed here is check_for_storm(): it is anon-callable,
-- performs no auth check, writes a public.storm_alerts row and fires an outbound
-- pg_net dispatch to the storm-alert Edge Function. It is only ever meant to run
-- from the trg_check_storm_on_* triggers.

-- Why this keeps happening: 20260702000000_revoke_trigger_fn_execute did exactly this
-- for handle_new_report, prevent_mod_status_reset and prevent_profile_mod_escalation --
-- and those three are still correctly locked down. The hole reopened because the
-- 2026-08-19 storm/appeals work and 20260908010000_reapply_p1a_safety introduced NEW
-- functions without grants of their own. `CREATE OR REPLACE` preserves an existing ACL,
-- but a function created for the first time gets Postgres's default of EXECUTE TO PUBLIC.
--
-- Rule for any future migration: every new function in `public` gets an explicit
-- REVOKE ... FROM PUBLIC plus a deliberate GRANT, in the same migration that creates it.
-- 20260908010000 does this correctly for apply_automated_mod_status (lines 270-271);
-- follow that pattern.

-- ---------------------------------------------------------------------------
-- 1. Internal only — no client role has any reason to call these directly.
--    All remaining callers are SECURITY DEFINER functions owned by postgres,
--    which are unaffected by client grants.
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.check_for_storm(text, uuid)      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_banned(uuid)                  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_blocked_by(uuid, uuid)        FROM PUBLIC, anon, authenticated;

-- Trigger functions. Postgres refuses a direct call anyway ("trigger functions
-- can only be called as triggers"), but they should not be published as RPC.
REVOKE ALL ON FUNCTION public.stamp_book_comment_version()     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_check_storm_on_comment()     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_check_storm_on_post()        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_check_storm_on_report()      FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.check_for_storm(text, uuid) IS
'SECURITY DEFINER, trigger-internal only. Writes storm_alerts and dispatches to the storm-alert Edge Function, so it carries NO client grant: called only from trg_check_storm_on_comment/post/report.';

COMMENT ON FUNCTION public.is_banned(uuid) IS
'SECURITY DEFINER STABLE helper. No client grant: reached only from inside content_visible(), which is itself SECURITY DEFINER.';

COMMENT ON FUNCTION public.is_blocked_by(uuid, uuid) IS
'SECURITY DEFINER STABLE helper. No client grant; currently has no callers.';

-- ---------------------------------------------------------------------------
-- 2. Moderator/Keeper RPCs — signed-in callers only.
--    Each already gates on mod_can(...) or a Keeper check and writes to
--    mod_actions, so anon reaching them was harmless (auth.uid() is null, so
--    mod_can returns false) but it is still surface with no purpose.
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.resolve_report(uuid, text, text)                        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolve_appeal(uuid, boolean, text)                     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolve_storm(uuid, boolean, text)                      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_content_mod_status(text, uuid, text, text)          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_site_setting(boolean, boolean, text, text, boolean, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.resolve_report(uuid, text, text)                        TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_appeal(uuid, boolean, text)                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_storm(uuid, boolean, text)                      TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_content_mod_status(text, uuid, text, text)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_site_setting(boolean, boolean, text, text, boolean, text) TO authenticated;

COMMENT ON FUNCTION public.resolve_appeal(uuid, boolean, text) IS
'SECURITY DEFINER is intentional: resolves an appeal while enforcing mod_can(''handle_report'', area) and mod_actions audit logging. Granted to authenticated only.';

COMMENT ON FUNCTION public.resolve_storm(uuid, boolean, text) IS
'SECURITY DEFINER is intentional: resolves a storm alert while enforcing mod_can(''handle_report'', ''all'') and mod_actions audit logging. Granted to authenticated only.';

COMMENT ON FUNCTION public.set_site_setting(boolean, boolean, text, text, boolean, text) IS
'SECURITY DEFINER is intentional: the sole write path to site_settings, enforcing mod_can(''configure'', ''all'') and mod_actions audit logging. Granted to authenticated only.';

-- ---------------------------------------------------------------------------
-- 3. Stays reachable — make the grant explicit instead of inherited from PUBLIC.
--
--    mod_can() and content_visible() are evaluated inside RLS policies (12 and 4
--    policies respectively). RLS predicates run as the *calling* role, so anon
--    and authenticated must keep EXECUTE or reads break site-wide. Both are
--    read-only and disclose nothing beyond the caller's own permissions.
--    get_transparency_log() is public by design (see 20260907000000).
--
--    These three will keep appearing in advisor lints 0028/0029. That is
--    expected and accepted: the only way to clear them is to move the functions
--    out of the PostgREST-exposed schema, which would mean rewriting all 16
--    policies that reference them. Not worth it for read-only predicates.
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.mod_can(text, text)                     FROM PUBLIC;
REVOKE ALL ON FUNCTION public.content_visible(text, uuid, text)       FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_transparency_log(int)               FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.mod_can(text, text)                  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.content_visible(text, uuid, text)    TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_transparency_log(int)            TO anon, authenticated;

COMMENT ON FUNCTION public.mod_can(text, text) IS
'SECURITY DEFINER STABLE predicate used by 12 RLS policies. anon/authenticated EXECUTE is REQUIRED - RLS predicates run as the calling role. Read-only; reveals only the caller''s own capabilities. Advisor lints 0028/0029 on this function are accepted, not a finding.';

COMMENT ON FUNCTION public.content_visible(text, uuid, text) IS
'SECURITY DEFINER STABLE predicate used by 4 RLS policies. anon/authenticated EXECUTE is REQUIRED - RLS predicates run as the calling role. Advisor lints 0028/0029 on this function are accepted, not a finding.';

-- ---------------------------------------------------------------------------
-- Verify after applying: scripts/sql/verify-grants.sql must return ZERO rows.
-- (Before this migration it returns 33.)
--
-- 4. PostgREST publishes RPCs from its schema cache; a grant change is invisible
--    until the cache reloads.
-- ---------------------------------------------------------------------------

NOTIFY pgrst, 'reload schema';
