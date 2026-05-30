-- Security hardening for trigger / utility functions.
-- Addresses Supabase advisors 0011 (function_search_path_mutable),
-- 0028 (anon can execute SECURITY DEFINER fn) and 0029 (authenticated likewise).
--
-- None of this disables any trigger: trigger functions are invoked by the trigger
-- mechanism, which does NOT require the invoking role to hold EXECUTE on the
-- function. So revoking EXECUTE only removes them from the public PostgREST RPC
-- surface (/rest/v1/rpc/<fn>); the triggers keep firing as before.

-- 1. Pin search_path so a malicious session search_path can't redirect unqualified
--    name resolution inside these SECURITY DEFINER functions. Every body is fully
--    schema-qualified (public.* / auth.uid() / pg_catalog built-ins), so '' is safe.
alter function public.handle_new_post()          set search_path = '';
alter function public.handle_new_book_comment()  set search_path = '';
alter function public.enforce_rate_limit()       set search_path = '';
alter function public.touch_profile_updated_at() set search_path = '';

-- 2. Remove the trigger / utility functions from the API-callable surface.
--    Postgres grants EXECUTE to PUBLIC by default on function creation, and
--    anon/authenticated inherit that, so we revoke from PUBLIC as well to make it
--    effective. The function owner (and service_role) retain access; nothing in the
--    app calls these directly — they are triggers.
revoke execute on function public.handle_new_post()          from public, anon, authenticated;
revoke execute on function public.handle_new_book_comment()  from public, anon, authenticated;
revoke execute on function public.enforce_rate_limit()       from public, anon, authenticated;
revoke execute on function public.handle_new_user()          from public, anon, authenticated;
revoke execute on function public.touch_profile_updated_at() from public, anon, authenticated;
