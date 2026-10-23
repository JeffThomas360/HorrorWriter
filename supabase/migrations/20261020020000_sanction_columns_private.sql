-- Sanction state was public. The baseline lets anyone read every profile row,
-- which includes is_shadowbanned, banned_until, ban_reason and
-- requires_screening: one anon GET defeated shadowbans and listed ban reasons.
--
-- Fix: column-level grants on profiles. Table-level SELECT goes away and every
-- column EXCEPT the four sanction columns is granted back, so `select('*')`
-- would fail: the client now selects explicit columns (PROFILE_COLUMNS in
-- src/lib/profile.js). Moderators read sanctions through mod_get_profile() and
-- mod_list_users(); the sitemap uses public_profile_handles().
--
-- TRAP: a new profiles column is NOT readable until it is granted here-style:
--   grant select (new_col) on public.profiles to anon, authenticated;

do $$
declare
  cols text;
begin
  select string_agg(quote_ident(column_name), ', ')
    into cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'profiles'
     and column_name not in ('is_shadowbanned', 'banned_until', 'ban_reason', 'requires_screening');
  execute 'revoke select on public.profiles from anon, authenticated';
  execute format('grant select (%s) on public.profiles to anon, authenticated', cols);
end $$;

-- Moderators: one user's full row (sanctions included), gated like the mod UI.
create or replace function public.mod_get_profile(p_id uuid)
returns setof public.profiles
language sql stable security definer set search_path = ''
as $$
  select * from public.profiles
   where id = p_id and public.mod_can('handle_report', 'all');
$$;
revoke all on function public.mod_get_profile(uuid) from public, anon;
grant execute on function public.mod_get_profile(uuid) to authenticated;

-- Admin Users tab: every member with sanction state. Warden/keeper only.
create or replace function public.mod_list_users()
returns table (
  id uuid, handle text, display_name text, avatar_url text, mod_role text, mod_scope text,
  banned_until timestamptz, is_shadowbanned boolean, requires_screening boolean, created_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select id, handle, display_name, avatar_url, mod_role, mod_scope,
         banned_until, is_shadowbanned, requires_screening, created_at
    from public.profiles
   where public.mod_can('ban', 'all')
   order by created_at desc;
$$;
revoke all on function public.mod_list_users() from public, anon;
grant execute on function public.mod_list_users() to authenticated;

-- Overview / Sanctions tabs: who is banned right now. Any moderator.
create or replace function public.mod_active_sanctions()
returns table (id uuid, handle text, banned_until timestamptz)
language sql stable security definer set search_path = ''
as $$
  select id, handle, banned_until from public.profiles
   where banned_until > now() and public.mod_can('handle_report', 'all')
   order by banned_until desc;
$$;
revoke all on function public.mod_active_sanctions() from public, anon;
grant execute on function public.mod_active_sanctions() to authenticated;

-- Sitemap: handles of writers who are not shadowbanned, without exposing the flag.
create or replace function public.public_profile_handles()
returns table (id uuid, handle text, updated_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select id, handle, updated_at from public.profiles
   where handle is not null and not is_shadowbanned;
$$;
revoke all on function public.public_profile_handles() from public;
grant execute on function public.public_profile_handles() to anon, authenticated;

NOTIFY pgrst, 'reload schema';
