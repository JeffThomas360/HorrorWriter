-- Behaviour test for 20261123000000_response_email.sql. Rolls back; nothing is kept.
-- Success = final row 'ALL PASS'. Any failure raises 'FAIL: ...'.
--
--   & .\scripts\sql\rehearse.ps1 -Test scripts\sql\test-response-email.sql -Migration supabase\migrations\20261123000000_response_email.sql
--
-- Uses throwaway accounts (...c90xx) and stories (...d90xx). No email is sent: the
-- dispatch is queued inside this transaction and discarded by the rollback, and the
-- claim is called here directly.
begin;

do $$ begin
  if to_regprocedure('public.member_email_claim(uuid)') is null then
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

create function pg_temp.u(p_name text)
returns uuid language sql immutable as $f$
  select ('00000000-0000-4000-8000-0000000c90' || case p_name
            when 'writer' then '01' when 'critic' then '02' when 'unconfirmed' then '03'
          end)::uuid;
$f$;

create function pg_temp.refused(p_sql text)
returns boolean language plpgsql as $f$
begin
  execute p_sql;
  return false;
exception when insufficient_privilege then
  return true;
end $f$;

grant execute on function pg_temp.must(boolean, text) to authenticated, anon;
grant execute on function pg_temp.be(uuid)            to authenticated, anon;
grant execute on function pg_temp.be_anon()           to authenticated, anon;
grant execute on function pg_temp.u(text)             to authenticated, anon;
grant execute on function pg_temp.refused(text)       to authenticated, anon;

create temp table t_kept (k text primary key, v text);
grant all on t_kept to authenticated, anon;

-- now() stands still in a transaction, so notifications cannot be told apart by
-- time. note() returns the one notification for a member not handed out before.
create temp table t_seen (id uuid primary key);
create function pg_temp.note(p_user uuid)
returns uuid language plpgsql as $f$
declare v_id uuid; n int;
begin
  select count(*), min(id::text)::uuid into n, v_id
  from public.notifications
  where user_id = p_user and id not in (select id from t_seen);
  if n <> 1 then raise exception 'FAIL: expected exactly one new notification, found %', n; end if;
  insert into t_seen values (v_id);
  return v_id;
end $f$;

create function pg_temp.claims(p_note uuid)
returns bigint language sql as $f$
  select count(*) from public.member_email_claim(p_note);
$f$;

create function pg_temp.critique(p_book uuid)
returns void language sql as $f$
  insert into public.book_comments (book_id, author_id, content)
  values (p_book, pg_temp.u('critic'), 'hwtest-response-email: a critique');
$f$;

-- ── Actors and stories ─────────────────────────────────
-- handle_new_user() creates their profiles.
insert into auth.users (id, email, aud, role, instance_id, created_at, email_confirmed_at) values
  (pg_temp.u('writer'),      'response-writer@example.test',      'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now() - interval '30 days', now() - interval '30 days'),
  (pg_temp.u('critic'),      'response-critic@example.test',      'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now() - interval '30 days', now() - interval '30 days'),
  (pg_temp.u('unconfirmed'), 'response-unconfirmed@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now() - interval '30 days', null);

insert into public.books (id, title, lede, content, author_id) values
  ('00000000-0000-4000-8000-0000000d9001', 'hwtest The Bell Tower', 'L', 'Body', pg_temp.u('writer')),
  ('00000000-0000-4000-8000-0000000d9002', 'hwtest The Cellar',     'L', 'Body', pg_temp.u('unconfirmed'));

-- ── 1. A member with no row has emails on ──
select pg_temp.be(pg_temp.u('writer'));
select pg_temp.must(public.get_email_pref() = true, '1: emails are on by default');
select pg_temp.be(null);
select pg_temp.must(not exists (select 1 from public.member_email_prefs where user_id = pg_temp.u('writer')),
  '1: reading the default creates no row');

-- ── 2. A critique can be claimed once, and the claim marks it ──
select pg_temp.critique('00000000-0000-4000-8000-0000000d9001');
insert into t_kept values ('n1', pg_temp.note(pg_temp.u('writer'))::text);
select pg_temp.must(
  (select count(*) = 1
      and bool_and(email = 'response-writer@example.test'
               and href = '/library/read/00000000-0000-4000-8000-0000000d9001/'
               and title like 'New critique on "hwtest The Bell Tower"'
               and off_token is not null)
   from public.member_email_claim((select v::uuid from t_kept where k = 'n1'))),
  '2: first claim returns the address, the link and a turn-off token');
select pg_temp.must(
  (select emailed_at is not null from public.notifications where id = (select v::uuid from t_kept where k = 'n1')),
  '2: the claimed notification is marked as emailed');
select pg_temp.must(
  (select last_emailed_at is not null and on_response from public.member_email_prefs where user_id = pg_temp.u('writer')),
  '2: the claim records when the member was last emailed');
select pg_temp.must(pg_temp.claims((select v::uuid from t_kept where k = 'n1')) = 0,
  '2: the same notification cannot be claimed twice');

-- ── 3. A second response inside the hour is not emailed ──
select pg_temp.critique('00000000-0000-4000-8000-0000000d9001');
insert into t_kept values ('n2', pg_temp.note(pg_temp.u('writer'))::text);
select pg_temp.must(pg_temp.claims((select v::uuid from t_kept where k = 'n2')) = 0,
  '3: one email an hour at most');
select pg_temp.must(
  (select emailed_at is null from public.notifications where id = (select v::uuid from t_kept where k = 'n2')),
  '3: a refused claim leaves the notification unmarked');

-- ── 4. After the hour it may go ──
update public.member_email_prefs set last_emailed_at = now() - interval '2 hours' where user_id = pg_temp.u('writer');
select pg_temp.must(pg_temp.claims((select v::uuid from t_kept where k = 'n2')) = 1,
  '4: a response is emailed once the hour has passed');

-- ── 5. The member's switch turns it off and on ──
select pg_temp.be(pg_temp.u('writer'));
-- Set and read in separate statements: get_email_pref() is STABLE, so inside the
-- statement that writes it would still see the value from before the write.
select pg_temp.must(public.set_email_pref(false) = false, '5: turning emails off returns the new choice');
select pg_temp.must(public.get_email_pref() = false, '5: the member can turn emails off');
select pg_temp.be(null);
update public.member_email_prefs set last_emailed_at = now() - interval '2 hours' where user_id = pg_temp.u('writer');
select pg_temp.critique('00000000-0000-4000-8000-0000000d9001');
insert into t_kept values ('n3', pg_temp.note(pg_temp.u('writer'))::text);
select pg_temp.must(pg_temp.claims((select v::uuid from t_kept where k = 'n3')) = 0,
  '5: nothing is emailed while the switch is off');
select pg_temp.be(pg_temp.u('writer'));
select pg_temp.must(public.set_email_pref(true) = true, '5: turning emails on returns the new choice');
select pg_temp.must(public.get_email_pref() = true, '5: the member can turn emails back on');
select pg_temp.be(null);
select pg_temp.must(pg_temp.claims((select v::uuid from t_kept where k = 'n3')) = 1,
  '5: with the switch back on the response is emailed');

-- ── 6. The link in the email turns it off without signing in ──
insert into t_kept select 'token', off_token::text from public.member_email_prefs where user_id = pg_temp.u('writer');
select pg_temp.be_anon();
select pg_temp.must(public.email_off('00000000-0000-4000-8000-0000000fffff') = false, '6: an unknown token changes nothing');
select pg_temp.must(public.email_off(null) = false, '6: a missing token changes nothing');
select pg_temp.must(public.email_off((select v::uuid from t_kept where k = 'token')) = true, '6: the token turns emails off signed out');
select pg_temp.be(pg_temp.u('writer'));
select pg_temp.must(public.get_email_pref() = false, '6: the member sees the switch off afterwards');
select pg_temp.be(null);
select pg_temp.must(
  (select on_response from public.member_email_prefs where user_id = pg_temp.u('critic')) is null,
  '6: nobody else was touched');

-- ── 7. An address that was never confirmed gets nothing ──
select pg_temp.critique('00000000-0000-4000-8000-0000000d9002');
insert into t_kept values ('n4', pg_temp.note(pg_temp.u('unconfirmed'))::text);
select pg_temp.must(pg_temp.claims((select v::uuid from t_kept where k = 'n4')) = 0,
  '7: an unconfirmed address is never emailed');

-- ── 8. Stale and unrelated notifications are never emailed ──
update public.member_email_prefs set on_response = true, last_emailed_at = null where user_id = pg_temp.u('writer');
select pg_temp.critique('00000000-0000-4000-8000-0000000d9001');
insert into t_kept values ('n5', pg_temp.note(pg_temp.u('writer'))::text);
update public.notifications set created_at = now() - interval '2 days' where id = (select v::uuid from t_kept where k = 'n5');
select pg_temp.must(pg_temp.claims((select v::uuid from t_kept where k = 'n5')) = 0,
  '8: a notification over a day old is not emailed');

insert into public.notifications (user_id, kind, title, body)
values (pg_temp.u('writer'), 'content_actioned', 'hwtest-response-email', 'not a response');
insert into t_kept values ('n6', pg_temp.note(pg_temp.u('writer'))::text);
select pg_temp.must(pg_temp.claims((select v::uuid from t_kept where k = 'n6')) = 0,
  '8: only responses to writing are emailed');
select pg_temp.must(pg_temp.claims('00000000-0000-4000-8000-0000000fffff') = 0,
  '8: an unknown notification id returns nothing');

-- ── 9. Who can reach what ──
select pg_temp.must(
  exists (select 1 from pg_trigger
          where tgname = 'trg_notifications_response_email'
            and tgrelid = 'public.notifications'::regclass and tgenabled = 'O'),
  '9: the dispatch trigger is on notifications');
select pg_temp.must(
  (select confdeltype = 'c' from pg_constraint
   where conrelid = 'public.member_email_prefs'::regclass and contype = 'f'),
  '9: deleting an account deletes its preference row');
select pg_temp.must(not has_function_privilege('anon', 'public.member_email_claim(uuid)', 'execute')
                and not has_function_privilege('authenticated', 'public.member_email_claim(uuid)', 'execute'),
  '9: only the service role can claim');
select pg_temp.must(has_function_privilege('service_role', 'public.member_email_claim(uuid)', 'execute'),
  '9: the service role can claim');
select pg_temp.must(not has_function_privilege('anon', 'public.dispatch_response_email()', 'execute')
                and not has_function_privilege('authenticated', 'public.dispatch_response_email()', 'execute'),
  '9: the trigger function is private');
select pg_temp.must(not has_function_privilege('anon', 'public.get_email_pref()', 'execute')
                and not has_function_privilege('anon', 'public.set_email_pref(boolean)', 'execute'),
  '9: visitors cannot read or set a preference');
select pg_temp.must(has_function_privilege('authenticated', 'public.get_email_pref()', 'execute')
                and has_function_privilege('authenticated', 'public.set_email_pref(boolean)', 'execute')
                and has_function_privilege('anon', 'public.email_off(uuid)', 'execute'),
  '9: members reach their switch; the emailed link works signed out');
select pg_temp.must(not has_table_privilege('anon', 'public.member_email_prefs', 'select, insert, update, delete')
                and not has_table_privilege('authenticated', 'public.member_email_prefs', 'select, insert, update, delete'),
  '9: member_email_prefs is closed to members and visitors');
select pg_temp.be(pg_temp.u('critic'));
select pg_temp.must(pg_temp.refused('select * from public.member_email_prefs'), '9: a member cannot read the table');
select pg_temp.must(pg_temp.refused($q$select * from public.member_email_claim('00000000-0000-4000-8000-0000000fffff')$q$),
  '9: a member cannot call the claim');
select pg_temp.be(null);

select 'ALL PASS' as result;
rollback;
