-- Behaviour test for 20261127000000_ai_suspicion.sql. Rolls back; nothing is kept.
-- Success = final row 'ALL PASS'. Any failure raises 'FAIL: ...'.
--
--   & .\scripts\sql\rehearse.ps1 -Test scripts\sql\test-ai-suspicion.sql -Migration supabase\migrations\20261127000000_ai_suspicion.sql
--
-- Uses throwaway accounts (...cb0xx) and content (...db0xx).
begin;

do $$ begin
  if to_regprocedure('public.mod_set_ai_suspected(text,uuid,boolean,text)') is null then
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
  select ('00000000-0000-4000-8000-0000000cb0' || case p_name
            when 'writer' then '01' when 'member' then '02' when 'moderator' then '03'
            when 'warden' then '04' when 'sentinel' then '05'
          end)::uuid;
$f$;

create function pg_temp.c(p_name text)
returns uuid language sql immutable as $f$
  select ('00000000-0000-4000-8000-0000000db0' || case p_name
            when 'story' then '01' when 'critique' then '02' when 'thread' then '03'
            when 'opening' then '04' when 'post' then '05'
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

-- How many rows the tagged list gives whoever is asking.
create function pg_temp.listed(p_author uuid default null)
returns bigint language sql as $f$
  select count(*) from public.mod_ai_suspected_list(p_author);
$f$;

grant execute on function pg_temp.must(boolean, text) to authenticated, anon;
grant execute on function pg_temp.be(uuid)            to authenticated, anon;
grant execute on function pg_temp.be_anon()           to authenticated, anon;
grant execute on function pg_temp.u(text)             to authenticated, anon;
grant execute on function pg_temp.c(text)             to authenticated, anon;
grant execute on function pg_temp.refused(text)       to authenticated, anon;
grant execute on function pg_temp.listed(uuid)        to authenticated, anon;

-- ── Actors and their content ───────────────────────────
-- handle_new_user() creates their profiles.
insert into auth.users (id, email, aud, role, instance_id, created_at, email_confirmed_at)
select pg_temp.u(n), 'aisuspicion-' || n || '@example.test', 'authenticated', 'authenticated',
       '00000000-0000-0000-0000-000000000000', now() - interval '30 days', now() - interval '30 days'
from unnest(array['writer','member','moderator','warden','sentinel']) as n;
update public.profiles set mod_role = 'moderator', mod_scope = 'library' where id = pg_temp.u('moderator');
update public.profiles set mod_role = 'warden',    mod_scope = 'all'     where id = pg_temp.u('warden');
update public.profiles set mod_role = 'sentinel',  mod_scope = 'all'     where id = pg_temp.u('sentinel');

insert into public.books (id, title, lede, content, author_id) values
  (pg_temp.c('story'), 'hwtest The Lighthouse', 'L', 'Body', pg_temp.u('writer'));
insert into public.book_comments (id, book_id, author_id, content) values
  (pg_temp.c('critique'), pg_temp.c('story'), pg_temp.u('member'), 'hwtest critique of the lighthouse');
insert into public.threads (id, title, category_id, author_id) values
  (pg_temp.c('thread'), 'hwtest A thread',
   (select id from public.categories where id <> 'rituals' order by id limit 1), pg_temp.u('writer'));
insert into public.posts (id, thread_id, author_id, content) values
  (pg_temp.c('opening'), pg_temp.c('thread'), pg_temp.u('writer'), 'hwtest opening post');
insert into public.posts (id, thread_id, author_id, content) values
  (pg_temp.c('post'), pg_temp.c('thread'), pg_temp.u('writer'), 'hwtest a reply');

create temp table t_before as
  select (select count(*) from public.notifications where user_id = pg_temp.u('writer')) as notes;

-- ── 1. A warden tags the story; nothing else changes ──
select pg_temp.be(pg_temp.u('warden'));
select public.mod_set_ai_suspected('story', pg_temp.c('story'), true, 'hwtest: reads like a chatbot');
select pg_temp.be(null);

select pg_temp.must(
  (select count(*) = 1
      and bool_and(note = 'hwtest: reads like a chatbot'
                   and author_id = pg_temp.u('writer') and tagged_by = pg_temp.u('warden'))
   from public.ai_suspicions where target_type = 'story' and target_id = pg_temp.c('story')),
  '1: one tag row with the note, the author and the tagger');
select pg_temp.must(
  (select count(*) = 1 and bool_and(action = 'tag' and actor_id = pg_temp.u('warden'))
   from public.ai_suspicion_log where target_id = pg_temp.c('story')),
  '1: one tag row in the history');
select pg_temp.must((select mod_status = 'live' from public.books where id = pg_temp.c('story')),
  '1: the story is still live');
select pg_temp.must(
  (select count(*) from public.notifications where user_id = pg_temp.u('writer')) = (select notes from t_before),
  '1: the writer is not notified');
select pg_temp.must(not exists (select 1 from public.mod_actions where target_id = pg_temp.c('story')),
  '1: nothing is written to mod_actions');
select pg_temp.must(
  not exists (select 1 from public.get_transparency_log(200) l
              where to_jsonb(l)::text like '%' || pg_temp.c('story')::text || '%'),
  '1: the public transparency log does not mention the story');

-- ── 2. Tagging again replaces the note ──
select pg_temp.be(pg_temp.u('warden'));
select public.mod_set_ai_suspected('story', pg_temp.c('story'), true, 'hwtest: second look');
select pg_temp.be(null);
select pg_temp.must(
  (select count(*) = 1 and bool_and(note = 'hwtest: second look')
   from public.ai_suspicions where target_id = pg_temp.c('story')),
  '2: still one tag row, with the new note');
select pg_temp.must((select count(*) = 2 from public.ai_suspicion_log where target_id = pg_temp.c('story')),
  '2: two history rows');

-- ── 3. Untagging removes the tag and keeps the trail ──
select pg_temp.be(pg_temp.u('warden'));
select public.mod_set_ai_suspected('story', pg_temp.c('story'), false, 'hwtest: the member showed drafts');
select pg_temp.be(null);
select pg_temp.must(not exists (select 1 from public.ai_suspicions where target_id = pg_temp.c('story')),
  '3: the tag row is gone');
select pg_temp.must(
  (select count(*) = 1 and bool_and(note = 'hwtest: the member showed drafts')
   from public.ai_suspicion_log where target_id = pg_temp.c('story') and action = 'untag'),
  '3: an untag row is in the history');

select pg_temp.be(pg_temp.u('warden'));
select public.mod_set_ai_suspected('story', pg_temp.c('story'), false, 'hwtest: again');
select pg_temp.be(null);
select pg_temp.must((select count(*) = 3 from public.ai_suspicion_log where target_id = pg_temp.c('story')),
  '3: untagging what is not tagged adds no history');

-- ── 4. A library moderator tags library content only ──
select pg_temp.be(pg_temp.u('moderator'));
select public.mod_set_ai_suspected('story',    pg_temp.c('story'),    true, 'hwtest: moderator, story');
select public.mod_set_ai_suspected('critique', pg_temp.c('critique'), true, 'hwtest: moderator, critique');
select pg_temp.must(pg_temp.refused(
  $q$select public.mod_set_ai_suspected('post', pg_temp.c('post'), true, 'x')$q$),
  '4: a library moderator cannot tag a post');
select pg_temp.must(pg_temp.refused(
  $q$select public.mod_set_ai_suspected('thread', pg_temp.c('thread'), true, 'x')$q$),
  '4: a library moderator cannot tag a thread');
select pg_temp.be(null);
select pg_temp.must(
  (select count(*) = 2 from public.ai_suspicions
   where target_id in (pg_temp.c('story'), pg_temp.c('critique'))),
  '4: the story and the critique are tagged');
select pg_temp.must(
  (select author_id = pg_temp.u('member') from public.ai_suspicions where target_id = pg_temp.c('critique')),
  '4: the critique''s tag names the critique''s author');

-- ── 5. Sentinels and plain members get nothing ──
select pg_temp.be(pg_temp.u('sentinel'));
select pg_temp.must(pg_temp.refused(
  $q$select public.mod_set_ai_suspected('story', pg_temp.c('story'), true, 'x')$q$),
  '5: a sentinel cannot tag');
select pg_temp.must(pg_temp.refused(
  $q$select public.mod_ai_evidence('story', pg_temp.c('story'))$q$),
  '5: a sentinel cannot read the evidence');
select pg_temp.must(pg_temp.listed() = 0, '5: a sentinel''s list is empty');
select pg_temp.be(pg_temp.u('member'));
select pg_temp.must(pg_temp.refused(
  $q$select public.mod_set_ai_suspected('story', pg_temp.c('story'), true, 'x')$q$),
  '5: a member cannot tag');
select pg_temp.must(pg_temp.refused(
  $q$select public.mod_ai_evidence('story', pg_temp.c('story'))$q$),
  '5: a member cannot read the evidence');
select pg_temp.must(pg_temp.listed() = 0, '5: a member''s list is empty');
select pg_temp.be_anon();
select pg_temp.must(pg_temp.refused(
  $q$select public.mod_ai_suspected_list()$q$),
  '5: a visitor cannot call the list');

-- ── 6. Bad targets ──
select pg_temp.be(pg_temp.u('warden'));
do $$ begin
  begin
    perform public.mod_set_ai_suspected('user', pg_temp.c('story'), true, 'x');
    raise exception 'FAIL: 6: an unknown target type is accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.mod_set_ai_suspected('story', '00000000-0000-4000-8000-0000000db099', true, 'x');
    raise exception 'FAIL: 6: a story that does not exist is accepted';
  exception when no_data_found then null;
  end;
end $$;

-- ── 7. The list follows the caller's area, and filters by author ──
select public.mod_set_ai_suspected('post',   pg_temp.c('post'),   true, 'hwtest: warden, post');
select public.mod_set_ai_suspected('thread', pg_temp.c('thread'), true, 'hwtest: warden, thread');
select pg_temp.must(pg_temp.listed() = 4, '7: a warden sees all four');
select pg_temp.must(pg_temp.listed(pg_temp.u('member')) = 1, '7: filtered to the critique''s author, one row');
select pg_temp.must(pg_temp.listed(pg_temp.u('writer')) = 3, '7: filtered to the writer, three rows');
select pg_temp.must(
  (select bool_and(case l.target_type
             when 'story'    then l.title = 'hwtest The Lighthouse' and l.story_id = pg_temp.c('story') and l.thread_id is null
             when 'critique' then l.title = 'hwtest critique of the lighthouse' and l.story_id = pg_temp.c('story') and l.thread_id is null
             when 'thread'   then l.title = 'hwtest A thread' and l.thread_id = pg_temp.c('thread') and l.story_id is null
             when 'post'     then l.title = 'hwtest a reply' and l.thread_id = pg_temp.c('thread') and l.story_id is null
           end)
      and bool_and(l.author_handle is not null and l.tagged_by_handle is not null and l.note like 'hwtest:%')
   from public.mod_ai_suspected_list() l),
  '7: each row carries its title, where it lives, the handles and the note');
select pg_temp.be(pg_temp.u('moderator'));
select pg_temp.must(
  (select count(*) = 2 and bool_and(l.target_type in ('story', 'critique'))
   from public.mod_ai_suspected_list() l),
  '7: a library moderator sees the story and the critique only');
select pg_temp.be(null);

-- ── 8. The writer's browser sends counts, and only counts ──
select pg_temp.be(pg_temp.u('writer'));
select public.record_compose_signals(pg_temp.c('story'),
  '{"typed": 100, "pasted": -5, "pastes": "many", "largest_paste": 99999999, "evil": "x"}'::jsonb);
select pg_temp.be(null);
select pg_temp.must(
  (select count(*) = 1 from public.submission_evidence
   where story_id = pg_temp.c('story') and source = 'compose'),
  '8: one compose row');
select pg_temp.must(
  (select (select array_agg(k order by k) from jsonb_object_keys(e.compose) k)
            = array['active_ms','chars_at_open','chars_final','dictated','imported',
                    'largest_paste','pasted','pastes','sittings','typed']
      and (e.compose->>'typed')::bigint = 100
      and (e.compose->>'pasted')::bigint = 0
      and (e.compose->>'pastes')::bigint = 0
      and (e.compose->>'largest_paste')::bigint = 2000000
      and e.author_id = pg_temp.u('writer') and e.machine_score is null
   from public.submission_evidence e
   where e.story_id = pg_temp.c('story') and e.source = 'compose'),
  '8: exactly the ten keys, clamped, with nothing extra');

select pg_temp.be(pg_temp.u('member'));
select public.record_compose_signals(pg_temp.c('story'), '{"typed": 5}'::jsonb);
select pg_temp.be(pg_temp.u('writer'));
select public.record_compose_signals(pg_temp.c('story'), '"junk"'::jsonb);
select public.record_compose_signals(pg_temp.c('story'), null);
select pg_temp.be(null);
select pg_temp.must(
  (select count(*) = 3 from public.submission_evidence
   where story_id = pg_temp.c('story') and source = 'compose'),
  '8: another member''s call stores nothing; the writer''s junk is stored as zeros');
select pg_temp.must(
  (select bool_and((select count(*) from jsonb_object_keys(e.compose)) = 10)
   from public.submission_evidence e where e.story_id = pg_temp.c('story') and e.source = 'compose'),
  '8: junk rows still hold only the ten keys');

select pg_temp.be(pg_temp.u('writer'));
do $$ begin
  for i in 1..25 loop
    perform public.record_compose_signals(pg_temp.c('story'), jsonb_build_object('typed', 1000 + i));
  end loop;
end $$;
select pg_temp.be(null);
select pg_temp.must(
  (select count(*) = 20 and max((compose->>'typed')::int) = 1025 and min((compose->>'typed')::int) = 1006
   from public.submission_evidence
   where story_id = pg_temp.c('story') and source = 'compose'),
  '8: only the newest twenty compose rows are kept');
select pg_temp.be_anon();
select pg_temp.must(pg_temp.refused(
  $q$select public.record_compose_signals(pg_temp.c('story'), '{}'::jsonb)$q$),
  '8: a visitor cannot call it');
select pg_temp.be(null);

-- ── 9. Only the screening function saves the machine score ──
select public.record_machine_score(pg_temp.c('story'), 0.91);
select public.record_machine_score(pg_temp.c('story'), 1.5);
select public.record_machine_score(pg_temp.c('story'), -0.1);
select public.record_machine_score(pg_temp.c('story'), null);
select public.record_machine_score('00000000-0000-4000-8000-0000000db099', 0.5);
select pg_temp.must(
  (select count(*) = 1 and bool_and(machine_score = 0.91 and compose is null and story_id = pg_temp.c('story'))
   from public.submission_evidence where source = 'machine'
     and story_id in (pg_temp.c('story'), '00000000-0000-4000-8000-0000000db099')),
  '9: one machine row, 0.91; out-of-range scores and unknown stories store nothing');
select pg_temp.be(pg_temp.u('writer'));
select pg_temp.must(pg_temp.refused(
  $q$select public.record_machine_score(pg_temp.c('story'), 0.1)$q$),
  '9: a member cannot save a score');
select pg_temp.be_anon();
select pg_temp.must(pg_temp.refused(
  $q$select public.record_machine_score(pg_temp.c('story'), 0.1)$q$),
  '9: a visitor cannot save a score');
select pg_temp.be(null);

-- ── 10. Staff read it all in one place ──
insert into public.reports (reporter_id, target_type, target_id, category, details)
values (pg_temp.u('member'), 'story', pg_temp.c('story'), 'ai_written', 'hwtest: opens with "Certainly!"');
insert into public.reports (reporter_id, target_type, target_id, category, details, source)
values (null, 'story', pg_temp.c('story'), 'ai_written', 'Automated check: machine_written 0.91', 'automated');

select pg_temp.be(pg_temp.u('warden'));
create temp table t_evidence as select public.mod_ai_evidence('story', pg_temp.c('story')) as e;
create temp table t_post_evidence as select public.mod_ai_evidence('post', pg_temp.c('post')) as e;
select pg_temp.be(null);
select pg_temp.must(
  (select e->'tag'->>'note' = 'hwtest: moderator, story'
      and e->'tag'->>'tagged_by_handle' is not null
      and e->'tag'->>'tagged_at' is not null
   from t_evidence),
  '10: the tag, with who and when');
select pg_temp.must(
  (select (e->'machine'->>'score')::numeric = 0.91 and e->'machine'->>'recorded_at' is not null from t_evidence),
  '10: the machine score');
select pg_temp.must(
  (select (e->'compose'->>'typed')::int = 1025 and (e->'compose'->>'pasted')::int = 0
      and e->'compose'->>'recorded_at' is not null
   from t_evidence),
  '10: the latest compose record');
select pg_temp.must(
  (select (select array_agg(h->>'action' order by ord) from jsonb_array_elements(e->'history') with ordinality as x(h, ord))
            = array['tag', 'untag', 'tag', 'tag']
      and e->'history'->0->>'note' = 'hwtest: moderator, story'
      and e->'history'->0->>'actor_handle' is not null
   from t_evidence),
  '10: the history, newest first');
select pg_temp.must((select (e->>'reports')::int = 1 from t_evidence),
  '10: one member report; the automatic note is not counted as one');
select pg_temp.must(
  (select e->'tag'->>'note' = 'hwtest: warden, post'
      and e->'machine' = 'null'::jsonb and e->'compose' = 'null'::jsonb
      and (e->>'reports')::int = 0 and jsonb_array_length(e->'history') = 1
   from t_post_evidence),
  '10: a post has a tag and a history, and no machine or compose record');

select pg_temp.be(pg_temp.u('warden'));
select pg_temp.must(
  (select l.machine_score = 0.91 from public.mod_ai_suspected_list() l where l.target_type = 'story'),
  '10: the list carries the story''s machine score');
select pg_temp.must(
  (select bool_and(l.machine_score is null) from public.mod_ai_suspected_list() l where l.target_type <> 'story'),
  '10: and none for anything else');
select pg_temp.be(null);

-- ── 11. No client reads or writes the tables ──
select pg_temp.be(pg_temp.u('member'));
select pg_temp.must(pg_temp.refused($q$select 1 from public.ai_suspicions limit 1$q$),
  '11: a member cannot read ai_suspicions');
select pg_temp.must(pg_temp.refused($q$select 1 from public.ai_suspicion_log limit 1$q$),
  '11: a member cannot read ai_suspicion_log');
select pg_temp.must(pg_temp.refused($q$select 1 from public.submission_evidence limit 1$q$),
  '11: a member cannot read submission_evidence');
select pg_temp.must(pg_temp.refused(
  $q$insert into public.ai_suspicions (target_type, target_id) values ('story', pg_temp.c('story'))$q$),
  '11: a member cannot write ai_suspicions');
select pg_temp.must(pg_temp.refused(
  $q$delete from public.submission_evidence$q$),
  '11: a member cannot delete evidence');
select pg_temp.be_anon();
select pg_temp.must(pg_temp.refused($q$select 1 from public.ai_suspicions limit 1$q$),
  '11: a visitor cannot read ai_suspicions');
select pg_temp.must(pg_temp.refused($q$select 1 from public.submission_evidence limit 1$q$),
  '11: a visitor cannot read submission_evidence');
select pg_temp.be(null);

-- ── 12. Deleted work takes its tag and its evidence with it ──
delete from public.posts where id = pg_temp.c('post');
select pg_temp.must(not exists (select 1 from public.ai_suspicions where target_id = pg_temp.c('post')),
  '12: deleting the post removes its tag');
select pg_temp.must(exists (select 1 from public.ai_suspicions where target_id = pg_temp.c('thread')),
  '12: and leaves the thread''s');
delete from public.threads where id = pg_temp.c('thread');
select pg_temp.must(not exists (select 1 from public.ai_suspicions where target_id = pg_temp.c('thread')),
  '12: deleting the thread removes its tag');

delete from public.books where id = pg_temp.c('story');
select pg_temp.must(
  not exists (select 1 from public.ai_suspicions
              where target_id in (pg_temp.c('story'), pg_temp.c('critique'))),
  '12: deleting the story removes its tag and its critique''s');
select pg_temp.must(not exists (select 1 from public.submission_evidence where story_id = pg_temp.c('story')),
  '12: and its evidence rows');
select pg_temp.must(exists (select 1 from public.ai_suspicion_log where target_id = pg_temp.c('story')),
  '12: the history stays until the author''s account goes');

select 'ALL PASS' as result;
rollback;
