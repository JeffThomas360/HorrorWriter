-- Behaviour test for 20261116000000_site_event_log.sql. Rolls back; nothing is kept.
-- Success = final row 'ALL PASS'. Any failure raises 'FAIL: ...'.
--
--   & .\scripts\sql\rehearse.ps1 -Test scripts\sql\test-site-events.sql -Migration supabase\migrations\20261116000000_site_event_log.sql
--
-- Uses one throwaway account (...c7001). Rows are told apart by their message text.
begin;

do $$ begin
  if to_regprocedure('public.log_site_event(text,text,text,text,text,text,integer,text)') is null then
    raise exception 'FAIL: the migration is not loaded';
  end if;
end $$;

-- ── Helpers (session-temporary) ────────────────────────
create function pg_temp.must(p_ok boolean, p_what text)
returns void language plpgsql as $f$
begin
  if p_ok is distinct from true then raise exception 'FAIL: %', p_what; end if;
end $f$;

select set_config('test.admin_role', current_user, true);
-- be(null) = the admin role; be(uuid) = that member.
create function pg_temp.be(p_id uuid)
returns void language plpgsql as $f$
begin
  if p_id is null then
    perform set_config('request.jwt.claims', '', true);
    perform set_config('role', current_setting('test.admin_role'), true);
  else
    perform set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
  end if;
end $f$;

create function pg_temp.be_anon()
returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);
end $f$;

grant execute on function pg_temp.must(boolean, text) to authenticated, anon;
grant execute on function pg_temp.be(uuid)            to authenticated, anon;
grant execute on function pg_temp.be_anon()           to authenticated, anon;

-- ── Actor ──────────────────────────────────────────────
insert into auth.users (id, email, aud, role, instance_id, created_at) values
  ('00000000-0000-4000-8000-0000000c7001', 'events-member@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now());

-- ── 1. anon request event: every field stored, url loses query and fragment ──
select pg_temp.be_anon();
select public.log_site_event('request', 'duplicate key', null, 'https://horrorwriter.org/my-stories/?x=1#top', 'UA', 'books:update', 409, '23505');
select pg_temp.be(null);
select pg_temp.must(
  (select count(*) = 1 and bool_and(kind = 'request' and url = 'https://horrorwriter.org/my-stories/'
     and action = 'books:update' and status = 409 and code = '23505' and user_id is null)
   from public.client_errors where message = 'duplicate key'),
  '1: anon request event stored with a clean url, action, status, code and no user');

-- ── 2. member shown event carries the member ──
select pg_temp.be('00000000-0000-4000-8000-0000000c7001');
select public.log_site_event('shown', 'Could not save', null, 'https://horrorwriter.org/publish/');
select pg_temp.be(null);
select pg_temp.must(
  (select count(*) = 1 and bool_and(kind = 'shown' and user_id = '00000000-0000-4000-8000-0000000c7001')
   from public.client_errors where message = 'Could not save'),
  '2: shown event stored with the member as user_id');

-- ── 3. unknown kind adds nothing ──
create temp table t_count (n bigint) on commit drop;
insert into t_count select count(*) from public.client_errors;
select public.log_site_event('nonsense', 'x');
select pg_temp.must((select count(*) from public.client_errors) = (select n from t_count),
  '3: an unknown kind adds no row');

-- ── 4. blank message adds nothing ──
delete from t_count;
insert into t_count select count(*) from public.client_errors;
select public.log_site_event('request', '   ');
select pg_temp.must((select count(*) from public.client_errors) = (select n from t_count),
  '4: a blank message adds no row');

-- ── 5. status outside 0..599 is dropped, the row is kept ──
select public.log_site_event('request', 'status-700', null, null, null, null, 700, null);
select pg_temp.must(
  (select count(*) = 1 and bool_and(status is null) from public.client_errors where message = 'status-700'),
  '5: status 700 is stored as null');

-- (extra) 0 is a valid status: it means a network failure
select public.log_site_event('request', 'status-0', null, null, null, null, 0, null);
select pg_temp.must(
  (select count(*) = 1 and bool_and(status = 0) from public.client_errors where message = 'status-0'),
  '5b: status 0 is stored');

-- ── 6. truncation ──
select public.log_site_event('request', repeat('a', 2000), null, null, null, repeat('b', 300), 500, repeat('c', 100));
select pg_temp.must(
  (select count(*) = 1 and bool_and(length(message) = 1000 and length(action) = 120 and length(code) = 40)
   from public.client_errors where message like 'aaaaaaaaaa%' and action like 'bbbbbbbbbb%'),
  '6: message, action and code are truncated to 1000, 120 and 40');

-- ── 7. the old log_client_error also strips the query and fragment ──
select pg_temp.be_anon();
select public.log_client_error('window', 'old bundle', null, 'https://horrorwriter.org/?utm_source=x', null);
select pg_temp.be(null);
select pg_temp.must(
  (select count(*) = 1 and bool_and(url = 'https://horrorwriter.org/') from public.client_errors where message = 'old bundle'),
  '7: log_client_error stores the url without its query string');

-- ── 8. retention is 90 days ──
insert into public.client_errors (kind, message, created_at) values
  ('window', 'age-60', now() - interval '60 days'),
  ('window', 'age-91', now() - interval '91 days');
select public.log_client_error('window', 'prune', null, null, null);
select pg_temp.must(exists (select 1 from public.client_errors where message = 'age-60'),
  '8: a 60-day-old row is kept');
select pg_temp.must(not exists (select 1 from public.client_errors where message = 'age-91'),
  '8: a 91-day-old row is pruned');

-- ── 9. a signed-in caller who is not an account gets user_id null ──
select pg_temp.be('00000000-0000-4000-8000-0000000c7fff');
select public.log_site_event('request', 'ghost');
select pg_temp.be(null);
select pg_temp.must(
  (select count(*) = 1 and bool_and(user_id is null) from public.client_errors where message = 'ghost'),
  '9: an unknown sub is stored with user_id null');

-- ── 10. deleting the account removes its rows ──
select pg_temp.must(exists (select 1 from public.client_errors where user_id = '00000000-0000-4000-8000-0000000c7001'),
  '10: setup, the member has rows before deletion');
delete from auth.users where id = '00000000-0000-4000-8000-0000000c7001';
select pg_temp.must(not exists (select 1 from public.client_errors where user_id = '00000000-0000-4000-8000-0000000c7001'),
  '10: no client_errors row keeps the deleted account''s user_id');

-- ── 11. anon still cannot read the table ──
select pg_temp.be_anon();
do $$
declare n bigint;
begin
  begin
    select count(*) into n from public.client_errors;
  exception when insufficient_privilege then
    n := 0;
  end;
  perform pg_temp.be(null);
  if n <> 0 then raise exception 'FAIL: 11: anon can read client_errors (% rows)', n; end if;
end $$;
select pg_temp.be(null);

select 'ALL PASS' as result;

rollback;
