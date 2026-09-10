-- Grant-surface check for SECURITY DEFINER functions in `public`.
--
-- MUST RETURN ZERO ROWS. Do not trust the migration tool's exit code.
--
-- Every row is a SECURITY DEFINER function that PostgREST publishes at
-- /rest/v1/rpc/<name> to a role that should not have it. Advisor lints
-- 0028 (anon) and 0029 (authenticated) flag the same thing, but this runs in
-- one query, after every migration, without a dashboard visit.
--
-- Why this exists: a function created for the first time gets Postgres's
-- default ACL, which is EXECUTE TO PUBLIC. `CREATE OR REPLACE` preserves an
-- existing ACL, so a lockdown survives edits -- but every NEW function starts
-- wide open. 20260702000000 locked three trigger functions; the 2026-08-19 and
-- 2026-09-08 migrations then added new ones without grants and reopened the
-- hole. This check makes that regression visible the day it happens.
--
-- The allowlist below is the complete set of client-callable SECURITY DEFINER
-- functions as of 20260910000000_lock_down_security_definer_grants.sql.
-- Adding a row here is a decision, not a fix: write down why.
--
-- Run: psql "$DATABASE_URL" -f scripts/sql/verify-grants.sql
--   or paste into the SQL editor. Zero rows = healthy.

with allow(name, role, why) as (values
  -- RLS predicates. Policies evaluate these AS THE CALLING ROLE, so anon and
  -- authenticated must keep EXECUTE or reads break site-wide. Read-only.
  ('mod_can',                 'anon',          'RLS predicate in 12 policies'),
  ('mod_can',                 'authenticated', 'RLS predicate in 12 policies'),
  ('content_visible',         'anon',          'RLS predicate in 4 policies'),
  ('content_visible',         'authenticated', 'RLS predicate in 4 policies'),
  -- Public by design.
  ('get_transparency_log',    'anon',          'public moderation transparency (20260907000000)'),
  ('get_transparency_log',    'authenticated', 'public moderation transparency (20260907000000)'),
  -- Signed-in user RPC. Binds author_id to auth.uid() internally.
  ('create_thread_with_post', 'authenticated', 'atomic thread+post create, author = auth.uid()'),
  -- Moderator / Keeper RPCs. Each enforces mod_can(...) or a Keeper check
  -- internally and logs to mod_actions. anon is deliberately NOT here.
  ('resolve_report',          'authenticated', 'mod RPC, checks mod_can(handle_report, area)'),
  ('resolve_appeal',          'authenticated', 'mod RPC, checks mod_can(handle_report, area)'),
  ('resolve_storm',           'authenticated', 'mod RPC, checks mod_can(handle_report, all)'),
  ('set_content_mod_status',  'authenticated', 'mod RPC, checks mod_can(hide|screen, area)'),
  ('set_site_setting',        'authenticated', 'keeper RPC, checks mod_can(configure, all)'),
  ('set_mod_role',            'authenticated', 'keeper RPC, explicit keeper check'),
  ('set_role_badge',          'authenticated', 'keeper RPC, explicit keeper check')
),
grants as (
  select
    p.proname                                        as name,
    pg_get_function_identity_arguments(p.oid)        as args,
    case when a.grantee = 0 then 'PUBLIC'
         else pg_get_userbyid(a.grantee) end         as role,
    p.proacl is null                                 as acl_is_default
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  -- NULL proacl means "never granted or revoked" = Postgres default = PUBLIC.
  -- acldefault() expands that so the regression is not hidden behind a NULL.
  cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  where n.nspname = 'public'
    and p.prosecdef
    and a.privilege_type = 'EXECUTE'
    and (a.grantee = 0 or pg_get_userbyid(a.grantee) in ('anon', 'authenticated'))
)
select
  g.name,
  g.args,
  g.role,
  case
    when g.role = 'PUBLIC' then 'PUBLIC is never allowed on a SECURITY DEFINER function'
    when g.acl_is_default  then 'default ACL -- function was created without any grant statement'
    else 'explicit grant not in allowlist'
  end as problem
from grants g
left join allow al on al.name = g.name and al.role = g.role
where al.name is null
order by (g.role = 'PUBLIC') desc, g.name, g.role;
