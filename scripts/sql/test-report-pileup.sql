-- Behaviour test for 20261125000000_report_pileup_screening_fix.sql. Rolls back; nothing is kept.
-- Success = final row 'ALL PASS'. Any failure raises 'FAIL: ...'.
--
--   & .\scripts\sql\rehearse.ps1 -Test scripts\sql\test-report-pileup.sql -Migration supabase\migrations\20261125000000_report_pileup_screening_fix.sql
--
-- Uses throwaway accounts (...cb0xx), stories (...db00x) and one critique (...db011).
-- Every report is filed by the member themself, as the site does it.
begin;

do $$ begin
  if pg_get_functiondef('public.handle_new_report()'::regprocedure) not like '%app.automated_mod_action%' then
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

create function pg_temp.u(p_name text)
returns uuid language sql immutable as $f$
  select ('00000000-0000-4000-8000-0000000cb0' || case p_name
            when 'writer' then '01' when 'critic' then '02'
            when 'r1' then '11' when 'r2' then '12' when 'r3' then '13' when 'r4' then '14' when 'r5' then '15'
          end)::uuid;
$f$;

create function pg_temp.item(p_name text)
returns uuid language sql immutable as $f$
  select ('00000000-0000-4000-8000-0000000db0' || case p_name
            when 'detailed' then '01' when 'piled' then '02' when 'host' then '03'
            when 'critique' then '11'
          end)::uuid;
$f$;

-- Runs a statement as whoever is acting. Null = it went through; otherwise the error text.
create function pg_temp.err(p_sql text)
returns text language plpgsql as $f$
begin
  execute p_sql;
  return null;
exception when others then
  return sqlerrm;
end $f$;

-- One member files one report as themself. Null = accepted; otherwise the error text.
create function pg_temp.report(p_who text, p_type text, p_target uuid, p_details text)
returns text language plpgsql as $f$
declare v_err text;
begin
  perform pg_temp.be(pg_temp.u(p_who));
  v_err := pg_temp.err(format(
    'insert into public.reports (reporter_id, target_type, target_id, category, details) values (%L, %L, %L, %L, %L)',
    pg_temp.u(p_who), p_type, p_target, 'other', p_details));
  perform pg_temp.be(null);
  return v_err;
end $f$;

create function pg_temp.actions(p_target uuid, p_action text)
returns bigint language sql as $f$
  select count(*) from public.mod_actions where target_id = p_target and action = p_action;
$f$;

create function pg_temp.review_notes(p_user uuid)
returns bigint language sql as $f$
  select count(*) from public.notifications
  where user_id = p_user and kind = 'content_actioned' and title = 'Content Under Review';
$f$;

grant execute on function pg_temp.must(boolean, text)              to authenticated;
grant execute on function pg_temp.be(uuid)                         to authenticated;
grant execute on function pg_temp.u(text)                          to authenticated;
grant execute on function pg_temp.item(text)                       to authenticated;
grant execute on function pg_temp.err(text)                        to authenticated;
grant execute on function pg_temp.report(text, text, uuid, text)   to authenticated;

-- ── Actors, stories and a critique ─────────────────────
-- handle_new_user() creates their profiles. None of them is a moderator.
insert into auth.users (id, email, aud, role, instance_id, created_at, email_confirmed_at)
select pg_temp.u(n), 'pileup-' || n || '@example.test', 'authenticated', 'authenticated',
       '00000000-0000-0000-0000-000000000000', now() - interval '30 days', now() - interval '30 days'
from unnest(array['writer','critic','r1','r2','r3','r4','r5']) as n;

insert into public.books (id, title, lede, content, author_id) values
  (pg_temp.item('detailed'), 'hwtest The Drowned Bell', 'L', 'Body', pg_temp.u('writer')),
  (pg_temp.item('piled'),    'hwtest The Salt Road',    'L', 'Body', pg_temp.u('writer')),
  (pg_temp.item('host'),     'hwtest The Orchard',      'L', 'Body', pg_temp.u('writer'));

insert into public.book_comments (id, book_id, author_id, content)
values (pg_temp.item('critique'), pg_temp.item('host'), pg_temp.u('critic'), 'hwtest-report-pileup: a critique');

-- ── 1. Four detailed reports change nothing ──
select pg_temp.must(pg_temp.report(n, 'story', pg_temp.item('detailed'), 'hwtest: detail from ' || n) is null,
  '1: report from ' || n || ' is accepted')
from unnest(array['r1','r2','r3','r4']) as n;
select pg_temp.must((select mod_status = 'live' from public.books where id = pg_temp.item('detailed')),
  '1: four reports leave the story live');
select pg_temp.must(not exists (select 1 from public.mod_actions where target_id = pg_temp.item('detailed')),
  '1: four reports write nothing to the moderation log');
select pg_temp.must(pg_temp.review_notes(pg_temp.u('writer')) = 0, '1: four reports tell the writer nothing');

-- ── 2. The fifth detailed report is accepted and the story is put under review ──
-- Before the fix this insert was refused: "permission denied: cannot modify mod_status
-- without moderation permission".
select pg_temp.must(e is null, '2: the fifth report is accepted (got: ' || coalesce(e, '') || ')')
from (select pg_temp.report('r5', 'story', pg_temp.item('detailed'), 'hwtest: detail from r5') as e) s;
select pg_temp.must(
  (select count(*) = 5 from public.reports where target_type = 'story' and target_id = pg_temp.item('detailed')),
  '2: all five reports are stored');
select pg_temp.must((select mod_status = 'screening' from public.books where id = pg_temp.item('detailed')),
  '2: the story is under review');
select pg_temp.must(pg_temp.review_notes(pg_temp.u('writer')) = 1,
  '2: the writer gets exactly one "Content Under Review" notification');
select pg_temp.must(
  (select count(*) = 1
      and bool_and(actor_id is null and target_type = 'story' and target_user_id = pg_temp.u('writer')
               and reason like 'Auto-screened: 5 distinct reports in the last hour, 5 corroborated')
   from public.mod_actions where target_id = pg_temp.item('detailed') and action = 'screen'),
  '2: one screen row is logged, with no actor, naming the writer');
select pg_temp.must(pg_temp.actions(pg_temp.item('detailed'), 'pile_on_flag') = 0,
  '2: a corroborated set is not flagged as a pile-on');

-- ── 3. The door is shut again: a member cannot change mod_status themself ──
select pg_temp.must(coalesce(current_setting('app.automated_mod_action', true), '') <> 'true',
  '3: the automated-action flag is off after the trigger');
-- The writer may update their own story, so only the guard stands between them and 'live'.
select pg_temp.be(pg_temp.u('writer'));
select pg_temp.must(e like '%cannot modify mod_status without moderation permission%',
  '3: the writer cannot put their own story back live (got: ' || coalesce(e, 'no error') || ')')
from (select pg_temp.err(format('update public.books set mod_status = %L where id = %L', 'live', pg_temp.item('detailed'))) as e) s;
select pg_temp.must(e like '%cannot modify mod_status without moderation permission%',
  '3: the writer cannot screen their own live story either (got: ' || coalesce(e, 'no error') || ')')
from (select pg_temp.err(format('update public.books set mod_status = %L where id = %L', 'hidden', pg_temp.item('piled'))) as e) s;
-- A reporter is not the author: row-level security gives them no row to update.
select pg_temp.be(pg_temp.u('r5'));
select pg_temp.err(format('update public.books set mod_status = %L where id = %L', 'live', pg_temp.item('detailed')));
select pg_temp.be(null);
select pg_temp.must((select mod_status = 'screening' from public.books where id = pg_temp.item('detailed')),
  '3: the story is still under review');
select pg_temp.must((select mod_status = 'live' from public.books where id = pg_temp.item('piled')),
  '3: the other story is still live');

-- ── 4. A sixth report on a story already under review repeats nothing ──
select pg_temp.must(e is null, '4: a report on a story under review is accepted (got: ' || coalesce(e, '') || ')')
from (select pg_temp.report('critic', 'story', pg_temp.item('detailed'), 'hwtest: detail from critic') as e) s;
select pg_temp.must(pg_temp.actions(pg_temp.item('detailed'), 'screen') = 1, '4: still one screen row');
select pg_temp.must(pg_temp.review_notes(pg_temp.u('writer')) = 1, '4: the writer is not told twice');

-- ── 5. Five reports with no details are a pile-on: flagged, nothing hidden ──
select pg_temp.must(pg_temp.report(n, 'story', pg_temp.item('piled'), case when n = 'r2' then '   ' end) is null,
  '5: bare report from ' || n || ' is accepted')
from unnest(array['r1','r2','r3','r4','r5']) as n;
select pg_temp.must((select mod_status = 'live' from public.books where id = pg_temp.item('piled')),
  '5: the story stays live');
select pg_temp.must(
  (select count(*) = 1
      and bool_and(actor_id is null and target_type = 'story' and target_user_id = pg_temp.u('writer')
               and reason like 'PILE-ON PATTERN: 5 distinct reports in the last hour, only 0 corroborated%')
   from public.mod_actions where target_id = pg_temp.item('piled') and action = 'pile_on_flag'),
  '5: one pile_on_flag row is logged for the moderators');
select pg_temp.must(pg_temp.actions(pg_temp.item('piled'), 'screen') = 0, '5: no screen row for a pile-on');
select pg_temp.must(pg_temp.review_notes(pg_temp.u('writer')) = 1, '5: the writer is not notified of a pile-on');

-- ── 6. The same holds for a critique (book_comments has its own guard trigger) ──
select pg_temp.must(pg_temp.report(n, 'critique', pg_temp.item('critique'), 'hwtest: detail from ' || n) is null,
  '6: critique report from ' || n || ' is accepted')
from unnest(array['r1','r2','r3','r4','r5']) as n;
select pg_temp.must((select mod_status = 'screening' from public.book_comments where id = pg_temp.item('critique')),
  '6: the critique is under review');
select pg_temp.must(pg_temp.review_notes(pg_temp.u('critic')) = 1, '6: its author is notified');
select pg_temp.must(
  (select count(*) = 1 and bool_and(target_type = 'critique' and target_user_id = pg_temp.u('critic'))
   from public.mod_actions where target_id = pg_temp.item('critique') and action = 'screen'),
  '6: one screen row is logged for the critique');
select pg_temp.must((select mod_status = 'live' from public.books where id = pg_temp.item('host')),
  '6: the story the critique sits on is untouched');

-- ── 7. Who can reach what ──
select pg_temp.must(
  exists (select 1 from pg_trigger
          where tgname = 'on_report_inserted' and tgrelid = 'public.reports'::regclass
            and tgfoid = 'public.handle_new_report()'::regprocedure and tgenabled = 'O'),
  '7: the trigger is still on reports');
select pg_temp.must(not has_function_privilege('anon', 'public.handle_new_report()', 'execute')
                and not has_function_privilege('authenticated', 'public.handle_new_report()', 'execute'),
  '7: the trigger function is still private');
select pg_temp.must(
  (select prosecdef from pg_proc where oid = 'public.handle_new_report()'::regprocedure),
  '7: it still runs as its owner');

select 'ALL PASS' as result;
rollback;
