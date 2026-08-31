-- supabase/migrations/20260824000000_security_definer_audit.sql
--
-- SECURITY DEFINER Audit & Explicit Intent Documentation
--
-- This migration documents the architectural intent for every SECURITY DEFINER
-- object and service-role-only table flagged in the Supabase security advisor scan.

-- 1. transparency_log view
-- Intent: Redacts moderator PII (actor_id -> actor_role) and sensitive targets
-- while allowing public/anon visibility of moderation transparency records.
-- security_invoker = false (SECURITY DEFINER) is intentional and required because
-- the underlying public.mod_actions table has RLS restricting SELECT to moderators
-- (mod_can('read_audit')).
COMMENT ON VIEW public.transparency_log IS 
'SECURITY DEFINER view (security_invoker=false) is intentional: enables public read access to sanitized moderation logs while underlying mod_actions table remains restricted to moderators via RLS.';

-- 2. webauthn_challenges table
-- Intent: Internal challenge store used exclusively by Edge Functions / service_role.
-- RLS is enabled with zero policies granted to anon/authenticated.
COMMENT ON TABLE public.webauthn_challenges IS 
'Private service-role-only table for WebAuthn challenge verification. Zero client policies are intentional; all access is mediated by service-role Edge Functions.';

-- 3. Moderation RPC functions
COMMENT ON FUNCTION public.set_mod_role(uuid, text, text) IS 
'SECURITY DEFINER is intentional: allows role updates while enforcing strict Keeper-only authorization check and mod_actions audit logging.';

COMMENT ON FUNCTION public.set_role_badge(text, text, text) IS 
'SECURITY DEFINER is intentional: allows badge label/emoji updates while enforcing strict Keeper-only authorization check and mod_actions audit logging.';

COMMENT ON FUNCTION public.set_content_mod_status(text, uuid, text, text) IS 
'SECURITY DEFINER is intentional: updates content mod_status across books/threads/posts/comments while enforcing mod_can(action, area) authorization and mod_actions audit logging.';

COMMENT ON FUNCTION public.resolve_report(uuid, text, text) IS 
'SECURITY DEFINER is intentional: updates report resolution while enforcing mod_can(''handle_report'', area) authorization and mod_actions audit logging.';

COMMENT ON FUNCTION public.content_visible(text, uuid, text) IS 
'SECURITY DEFINER STABLE helper: safely evaluates content visibility across status, shadowban, active sanctions, moderator overrides, and user blocklists.';

COMMENT ON FUNCTION public.create_thread_with_post(text, text, text) IS 
'SECURITY DEFINER atomic transaction: creates a thread and first post together, strictly binding author_id to auth.uid().';
