-- Revoke public RPC access to trigger-only SECURITY DEFINER functions.
--
-- handle_new_report(), prevent_mod_status_reset(), and prevent_profile_mod_escalation()
-- only make sense fired as triggers (they read NEW/OLD). With no REVOKE, Postgres's
-- default grants left them callable directly via PostgREST at
-- /rest/v1/rpc/<function_name> by anon and authenticated. Direct calls fail (NEW/OLD
-- aren't assigned outside trigger context), but there's no reason to leave
-- SECURITY DEFINER functions reachable that way.

REVOKE ALL ON FUNCTION public.handle_new_report() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_mod_status_reset() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_profile_mod_escalation() FROM PUBLIC, anon, authenticated;
