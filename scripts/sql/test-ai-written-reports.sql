-- Behaviour test for 20261124000000_ai_written_reports.sql. Rolls back; nothing is kept.
-- Success = final row 'ALL PASS'. Any failure raises 'FAIL: ...'.
--
--   & .\scripts\sql\rehearse.ps1 -Test scripts\sql\test-ai-written-reports.sql -Migration supabase\migrations\20261124000000_ai_written_reports.sql
--
-- Uses throwaway accounts (...ca0xx) and one story (...da001).
begin;

do $$ begin
  if to_regprocedure('public.file_automated_report(text,uuid,text,text)') is null then
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
  select ('00000000-0000-4000-8000-0000000ca0' || case p_name
            when 'writer' then '01' when 'reader' then '02' when 'warden' then '03'
          end)::uuid;
$f$;

create function pg_temp.story()
returns uuid language sql immutable as $f$
  select '00000000-0000-4000-8000-0000000da001'::uuid;
$f$;

create function pg_temp.refused(p_sql text)
returns boolean language plpgsql as $f$
begin
  execute p_sql;
  return false;
exception when insufficient_privilege then
  return true;
end $f$;

-- The call under test, and how many of its notes are open on the story.
create function pg_temp.file()
returns boolean language sql as $f$
  select public.file_automated_report('story', pg_temp.story(), 'ai_written', 'Automated check: machine_written 0.91');
$f$;

create function pg_temp.open_notes()
returns bigint language sql as $f$
  select count(*) from public.reports
  where target_type = 'story' and target_id = pg_temp.story()
    and category = 'ai_written' and source = 'automated' and status = 'open';
$f$;

grant execute on function pg_temp.must(boolean, text) to authenticated, anon;
grant execute on function pg_temp.be(uuid)            to authenticated, anon;
grant execute on function pg_temp.be_anon()           to authenticated, anon;
grant execute on function pg_temp.u(text)             to authenticated, anon;
grant execute on function pg_temp.story()             to authenticated, anon;
grant execute on function pg_temp.refused(text)       to authenticated, anon;

-- ── Actors and the story ───────────────────────────────
-- handle_new_user() creates their profiles.
insert into auth.users (id, email, aud, role, instance_id, created_at, email_confirmed_at) values
  (pg_temp.u('writer'), 'aiwritten-writer@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now() - interval '30 days', now() - interval '30 days'),
  (pg_temp.u('reader'), 'aiwritten-reader@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now() - interval '30 days', now() - interval '30 days'),
  (pg_temp.u('warden'), 'aiwritten-warden@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now() - interval '30 days', now() - interval '30 days');
update public.profiles set mod_role = 'warden', mod_scope = 'all' where id = pg_temp.u('warden');

insert into public.books (id, title, lede, content, author_id) values
  (pg_temp.story(), 'hwtest The Lighthouse', 'L', 'Body', pg_temp.u('writer'));

-- ── 1. The automatic check files one quiet note ──
select pg_temp.must(pg_temp.file() = true, '1: the first call files a note');
select pg_temp.must(
  (select count(*) = 1
      and bool_and(reporter_id is null and details = 'Automated check: machine_written 0.91')
   from public.reports
   where target_type = 'story' and target_id = pg_temp.story()
     and category = 'ai_written' and source = 'automated' and status = 'open'),
  '1: the note is open, automated, has no reporter, and carries the score');

-- ── 2. It is quiet: the story stays up and nobody is told ──
select pg_temp.must((select mod_status = 'live' from public.books where id = pg_temp.story()),
  '2: the story is still live');
select pg_temp.must(not exists (select 1 from public.notifications where user_id = pg_temp.u('writer')),
  '2: the writer is not notified');
select pg_temp.must(not exists (select 1 from public.mod_actions where target_id = pg_temp.story()),
  '2: nothing is written to the moderation log');

-- ── 3. An edit does not pile up a second note ──
select pg_temp.must(pg_temp.file() = false, '3: a second call while one is open files nothing');
select pg_temp.must(pg_temp.open_notes() = 1, '3: still exactly one open note');

-- ── 4. Staff can close a note that has no reporter, and a later check files again ──
select pg_temp.be(pg_temp.u('warden'));
select public.resolve_report(
  (select id from public.reports
   where target_id = pg_temp.story() and source = 'automated' and status = 'open'),
  'dismissed', 'hwtest: reads as the member''s own');
select pg_temp.be(null);
select pg_temp.must(pg_temp.open_notes() = 0, '4: the note is closed');
select pg_temp.must(not exists (select 1 from public.notifications where kind = 'report_resolved' and user_id is null),
  '4: closing it notifies nobody');
select pg_temp.must(pg_temp.file() = true, '4: with none open, the next check files a new note');

-- ── 5. A member can report a story as written by AI ──
select pg_temp.be(pg_temp.u('reader'));
insert into public.reports (reporter_id, target_type, target_id, category, details)
values (pg_temp.u('reader'), 'story', pg_temp.story(), 'ai_written', 'hwtest: opens with "Certainly! Here is"');
select pg_temp.be(null);
select pg_temp.must(
  (select count(*) = 1 from public.reports
   where reporter_id = pg_temp.u('reader') and category = 'ai_written' and source = 'user'),
  '5: the member''s report is stored as a user report');
select pg_temp.must((select mod_status = 'live' from public.books where id = pg_temp.story()),
  '5: one member report plus the automatic note does not hide the story');

-- ── 6. Only the screening function may file automatic notes ──
select pg_temp.be(pg_temp.u('reader'));
select pg_temp.must(pg_temp.refused(
  $q$select public.file_automated_report('story', '00000000-0000-4000-8000-0000000da001', 'ai_written', 'x')$q$),
  '6: a member cannot call it');
select pg_temp.be_anon();
select pg_temp.must(pg_temp.refused(
  $q$select public.file_automated_report('story', '00000000-0000-4000-8000-0000000da001', 'ai_written', 'x')$q$),
  '6: a visitor cannot call it');
select pg_temp.be(null);

select 'ALL PASS' as result;
rollback;
