-- Behaviour test for prevent_profile_mod_escalation (20260924000000).
--
-- Runs entirely inside a transaction that ROLLS BACK: nothing is kept.
-- Success = the final row reads 'ALL PASS'. A failure raises 'FAIL: ...'.
--
-- It borrows the oldest profile, makes it a warden for the length of the
-- transaction, then impersonates it as the `authenticated` role (the same way
-- PostgREST does) and tries each escalation a warden must not be able to make.
--
-- Run: psql "$DATABASE_URL" -f scripts/sql/test-mod-escalation.sql
--   or paste into the SQL editor.

begin;

-- As the migration role: make the test user a warden, with no active sanction.
update public.profiles
   set mod_role = 'warden', mod_scope = 'all', banned_until = null, ban_reason = null
 where id = (select id from public.profiles order by created_at limit 1);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub',  (select id from public.profiles order by created_at limit 1),
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

do $$
declare
  attempts text[] := array[
    $q$update public.profiles set mod_role = 'keeper' where id = auth.uid()$q$,
    $q$update public.profiles set mod_scope = 'forum' where id = auth.uid()$q$,
    $q$update public.profiles set banned_until = now() + interval '1 day' where id = auth.uid()$q$,
    $q$update public.profiles set is_shadowbanned = true where id = auth.uid()$q$,
    $q$update public.profiles set requires_screening = true where id = auth.uid()$q$
  ];
  q text;
begin
  foreach q in array attempts loop
    begin
      execute q;
      raise exception 'FAIL: a warden was allowed to run: %', q;
    exception when others then
      if sqlerrm like 'FAIL:%' then raise; end if;
      -- Any other error is the guard refusing, which is the expected outcome.
    end;
  end loop;

  -- A warden can still edit their own ordinary profile fields.
  update public.profiles set bio = coalesce(bio, '') where id = auth.uid();
end $$;

select 'ALL PASS' as result;

rollback;
