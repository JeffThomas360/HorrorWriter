-- Behaviour test for 20261117000000_member_dossier.sql. Rolls back; nothing is kept.
-- Success = final row 'ALL PASS'. Any failure raises 'FAIL: ...'.
--
--   & .\scripts\sql\rehearse.ps1 -Test scripts\sql\test-dossier.sql -Migration supabase\migrations\20261117000000_member_dossier.sql
--
-- Uses throwaway accounts (...c80xx) and content (...d80xx, ...f80xx, ...b80xx, ...a80xx,
-- ...e80xx). Free text it writes starts 'hwtest-dossier: '. Counts are compared before and
-- after, never assumed: production holds real rows. Dates are relative to now(), which
-- stands still inside a transaction.
begin;

do $$ begin
  if to_regprocedure('public.mod_user_dossier(uuid)') is null then
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
-- be(null) = the admin role; be(uuid) = that member, the way PostgREST presents them.
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

-- The actors, by name.
create function pg_temp.u(p_name text)
returns uuid language sql immutable as $f$
  select ('00000000-0000-4000-8000-0000000c80' || case p_name
            when 'new'    then '01' when 'week'   then '02' when 'old'  then '03'
            when 'keeper' then '04' when 'warden' then '05' when 'other' then '06'
            when 'new2'   then '07' when 'new3'   then '08' when 'new4' then '09'
          end)::uuid;
$f$;

-- True when running p_sql as the current role is refused outright.
create function pg_temp.refused(p_sql text)
returns boolean language plpgsql as $f$
begin
  execute p_sql;
  return false;
exception when insufficient_privilege then
  return true;
end $f$;

-- True when the current role can see nothing in p_table: refused, or no rows.
create function pg_temp.sees_nothing(p_table text)
returns boolean language plpgsql as $f$
declare n bigint;
begin
  execute format('select count(*) from %s', p_table) into n;
  return n = 0;
exception when insufficient_privilege then
  return true;
end $f$;

grant execute on function pg_temp.must(boolean, text)  to authenticated, anon;
grant execute on function pg_temp.be(uuid)             to authenticated, anon;
grant execute on function pg_temp.be_anon()            to authenticated, anon;
grant execute on function pg_temp.u(text)              to authenticated, anon;
grant execute on function pg_temp.refused(text)        to authenticated, anon;
grant execute on function pg_temp.sees_nothing(text)   to authenticated, anon;

-- Somewhere to keep a value read as one role and checked as another.
create temp table t_kept (k text primary key, v jsonb);
grant all on t_kept to authenticated, anon;

-- ── Actors ─────────────────────────────────────────────
-- handle_new_user() creates their profiles.
insert into auth.users (id, email, aud, role, instance_id, created_at) values
  (pg_temp.u('new'),    'dossier-new@example.test',    'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now()),
  (pg_temp.u('new2'),   'dossier-new2@example.test',   'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now()),
  (pg_temp.u('new3'),   'dossier-new3@example.test',   'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now()),
  (pg_temp.u('new4'),   'dossier-new4@example.test',   'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now()),
  (pg_temp.u('week'),   'dossier-week@example.test',   'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now() - interval '3 days'),
  (pg_temp.u('old'),    'dossier-old@example.test',    'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now() - interval '30 days'),
  (pg_temp.u('keeper'), 'dossier-keeper@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now() - interval '30 days'),
  (pg_temp.u('warden'), 'dossier-warden@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now() - interval '30 days'),
  (pg_temp.u('other'),  'dossier-other@example.test',  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now() - interval '30 days');

update public.profiles set mod_role = 'keeper', mod_scope = 'all' where id = pg_temp.u('keeper');
update public.profiles set mod_role = 'warden', mod_scope = 'all' where id = pg_temp.u('warden');

-- The roll-up before any of the test's content exists (for check 34).
select pg_temp.be(pg_temp.u('keeper'));
insert into t_kept select 'funnel_before', public.admin_member_funnel();
select pg_temp.be(null);

-- ══ Task 1: arrivals and steps ═════════════════════════

-- ── 1. A new member's arrival is stored, cleaned ──
select pg_temp.be(pg_temp.u('new'));
select public.record_arrival('ChatGPT.com', 'Chat.OpenAI.com', '/library/?utm_source=x#top');
select pg_temp.be(null);
select pg_temp.must(
  (select count(*) = 1 and bool_and(source_tag = 'chatgpt.com' and referrer_host = 'chat.openai.com'
     and landing_path = '/library/' and asked_at is null and found_via is null)
   from public.member_arrivals where user_id = pg_temp.u('new')),
  '1: arrival stored lower-cased, host only, path without query or hash');

-- ── 2. A second call changes nothing ──
select pg_temp.be(pg_temp.u('new'));
select public.record_arrival('other', 'other.example', '/x/');
select pg_temp.be(null);
select pg_temp.must(
  (select source_tag = 'chatgpt.com' and referrer_host = 'chat.openai.com' and landing_path = '/library/'
   from public.member_arrivals where user_id = pg_temp.u('new')),
  '2: arrival is recorded once');

-- ── 3. An account older than a day cannot record an arrival ──
select pg_temp.be(pg_temp.u('week'));
select public.record_arrival('late', 'late.example', '/');
select pg_temp.be(null);
select pg_temp.must(
  not exists (select 1 from public.member_arrivals where user_id = pg_temp.u('week')),
  '3: no arrival for an account older than 24 hours');

-- ── 4. A signed-out visitor writes nothing and gets no error ──
insert into t_kept select 'arrivals_n', to_jsonb(count(*)) from public.member_arrivals;
select pg_temp.be_anon();
select pg_temp.must(pg_temp.refused('select public.record_arrival(''a'', ''a.example'', ''/'')'),
  '4a: anon has no grant on record_arrival');
select pg_temp.be(null);
select pg_temp.must(
  (select count(*) from public.member_arrivals) = (select (v #>> '{}')::bigint from t_kept where k = 'arrivals_n'),
  '4b: nothing written for a signed-out visitor');

-- ── 5. Hostile values are dropped, not stored ──
select pg_temp.be(pg_temp.u('new2'));
select public.record_arrival('<script>', 'javascript:alert(1)', 'not-a-path');
select pg_temp.be(null);
select pg_temp.must(
  (select count(*) = 1 and bool_and(source_tag is null and referrer_host is null and landing_path is null)
   from public.member_arrivals where user_id = pg_temp.u('new2')),
  '5: markup, a javascript: referrer and a non-path are all dropped');

-- ── 6. Long values are cut ──
select pg_temp.be(pg_temp.u('new3'));
select public.record_arrival(repeat('a', 500), repeat('b', 500), '/' || repeat('c', 500));
select pg_temp.be(null);
select pg_temp.must(
  (select length(source_tag) = 64 and length(referrer_host) = 100 and length(landing_path) = 200
   from public.member_arrivals where user_id = pg_temp.u('new3')),
  '6: tag cut to 64, host to 100, path to 200');

-- ── 7. A member of three days is due the question ──
select pg_temp.be(pg_temp.u('week'));
select pg_temp.must(public.arrival_prompt_due(), '7: a member of three days is due the question');

-- ── 8. Their answer is stored, trimmed, in a new row ──
select public.record_found_via('  hwtest-dossier: a friend told me  ');
select pg_temp.be(null);
select pg_temp.must(
  (select count(*) = 1 and bool_and(found_via = 'hwtest-dossier: a friend told me' and asked_at is not null
     and source_tag is null and referrer_host is null and landing_path is null)
   from public.member_arrivals where user_id = pg_temp.u('week')),
  '8: answer stored trimmed, asked_at stamped, arrival fields empty');

-- ── 9. Once answered, not due ──
select pg_temp.be(pg_temp.u('week'));
select pg_temp.must(not public.arrival_prompt_due(), '9: not due once answered');

-- ── 10. One answer, ever ──
select public.record_found_via('hwtest-dossier: changed my mind');
select pg_temp.be(null);
select pg_temp.must(
  (select found_via = 'hwtest-dossier: a friend told me' from public.member_arrivals where user_id = pg_temp.u('week')),
  '10: a second answer changes nothing');

-- ── 11. A Skip stamps asked_at, keeps the arrival, stores no answer ──
select pg_temp.be(pg_temp.u('new'));
select public.record_found_via('');
select pg_temp.must(not public.arrival_prompt_due(), '11a: not due after a skip');
select pg_temp.be(null);
select pg_temp.must(
  (select found_via is null and asked_at is not null and source_tag = 'chatgpt.com' and landing_path = '/library/'
   from public.member_arrivals where user_id = pg_temp.u('new')),
  '11b: a skip stores no answer, stamps asked_at, leaves the arrival alone');

-- ── 12. An old account is neither asked nor able to answer ──
select pg_temp.be(pg_temp.u('old'));
select pg_temp.must(not public.arrival_prompt_due(), '12a: an account of 30 days is not due');
select public.record_found_via('hwtest-dossier: x');
select pg_temp.be(null);
select pg_temp.must(
  not exists (select 1 from public.member_arrivals where user_id = pg_temp.u('old')),
  '12b: no row for an account older than a week');

-- ── 13. A signed-out visitor cannot ask ──
select pg_temp.be_anon();
select pg_temp.must(pg_temp.refused('select public.arrival_prompt_due()'), '13: anon has no grant on arrival_prompt_due');
select pg_temp.be(null);

-- ── 14. Answer first, arrival second: one row with both ──
select pg_temp.be(pg_temp.u('new4'));
select public.record_found_via('hwtest-dossier: search');
select public.record_arrival('bing', 'www.bing.com', '/');
select pg_temp.be(null);
select pg_temp.must(
  (select count(*) = 1 and bool_and(found_via = 'hwtest-dossier: search' and source_tag = 'bing'
     and referrer_host = 'www.bing.com' and landing_path = '/')
   from public.member_arrivals where user_id = pg_temp.u('new4')),
  '14: an answer given first does not block the arrival');

-- ── 15. A step is one row per member, flow, step and day ──
select pg_temp.be(pg_temp.u('old'));
select public.log_member_step('publish', 'opened');
select public.log_member_step('publish', 'opened');
select pg_temp.be(null);
select pg_temp.must(
  (select count(*) = 1 and bool_and(day = (now() at time zone 'utc')::date)
   from public.member_steps where user_id = pg_temp.u('old') and flow = 'publish' and step = 'opened'),
  '15: two calls in a day are one row, dated today UTC');

-- ── 16. Unknown names, Join, and nulls are ignored quietly ──
select pg_temp.be(pg_temp.u('old'));
select public.log_member_step('publish', 'nonsense');
select public.log_member_step('join', 'opened');
select public.log_member_step(null, null);
select pg_temp.be(null);
select pg_temp.must(
  (select count(*) = 1 from public.member_steps where user_id = pg_temp.u('old')),
  '16: only the known member step was stored');

-- ── 17. A signed-out visitor cannot log a member step ──
select pg_temp.be_anon();
select pg_temp.must(pg_temp.refused('select public.log_member_step(''publish'', ''opened'')'),
  '17: anon has no grant on log_member_step');
select pg_temp.be(null);

-- ── 18. A signed-out visitor's Join step adds one to today's count ──
insert into t_kept
select 'join_opened', to_jsonb(coalesce((select n from public.step_tallies
   where day = (now() at time zone 'utc')::date and flow = 'join' and step = 'opened'), 0));
select pg_temp.be_anon();
select public.tally_step('join', 'opened');
select public.tally_step('join', 'opened');
select public.tally_step('join', 'opened');
select pg_temp.be(null);
select pg_temp.must(
  (select n from public.step_tallies where day = (now() at time zone 'utc')::date and flow = 'join' and step = 'opened')
    = (select (v #>> '{}')::integer + 3 from t_kept where k = 'join_opened'),
  '18: three Join visits add exactly three');

-- ── 19. Only Join, and only its known steps, are counted ──
insert into t_kept select 'tally_sum', to_jsonb(coalesce(sum(n), 0)) from public.step_tallies;
select pg_temp.be_anon();
select public.tally_step('publish', 'opened');
select public.tally_step('join', 'nonsense');
select public.tally_step(null, null);
select pg_temp.be(null);
select pg_temp.must(
  (select coalesce(sum(n), 0) from public.step_tallies) = (select (v #>> '{}')::bigint from t_kept where k = 'tally_sum'),
  '19: other flows and unknown steps are not counted');

-- ── 20. Past the daily cap, nothing more is counted ──
insert into public.step_tallies (day, flow, step, n)
values ((now() at time zone 'utc')::date, 'join', 'age_passed', 5000)
on conflict (day, flow, step) do update set n = 5000;
select pg_temp.be_anon();
select public.tally_step('join', 'opened');
select pg_temp.be(null);
select pg_temp.must(
  (select n from public.step_tallies where day = (now() at time zone 'utc')::date and flow = 'join' and step = 'opened')
    = (select (v #>> '{}')::integer + 3 from t_kept where k = 'join_opened'),
  '20: nothing is counted once today''s total has reached 5000');

-- ── 21. A member can read none of the three tables ──
select pg_temp.be(pg_temp.u('old'));
select pg_temp.must(pg_temp.sees_nothing('public.member_arrivals'), '21a: a member cannot read member_arrivals');
select pg_temp.must(pg_temp.sees_nothing('public.member_steps'),    '21b: a member cannot read member_steps');
select pg_temp.must(pg_temp.sees_nothing('public.step_tallies'),    '21c: a member cannot read step_tallies');
select pg_temp.be(null);

-- ── 22. Deleting an account deletes its arrival row ──
delete from auth.users where id = pg_temp.u('new');
select pg_temp.must(
  not exists (select 1 from public.member_arrivals where user_id = pg_temp.u('new')),
  '22: the arrival row goes with the account');

-- ══ Task 2: the dossier and the roll-ups ════════════════

-- ── Content ────────────────────────────────────────────
-- `old` posts a story, a Ritual entry and a thread; `other` responds to each, and has one
-- hidden critique that must not count. `old` critiques a story of `other`'s, and has a
-- Ritual draft for a second prompt they never entered.
insert into public.books (id, title, lede, content, author_id, version, mod_status, created_at) values
  ('00000000-0000-4000-8000-0000000d8001', 'hwtest-dossier: old story',   'L', 'Body', pg_temp.u('old'),   1, 'live', now() - interval '10 days'),
  ('00000000-0000-4000-8000-0000000d8002', 'hwtest-dossier: other story', 'L', 'Body', pg_temp.u('other'), 1, 'live', now() - interval '15 days');

insert into public.ritual_prompts (id, body, status, goes_live_at, source) values
  ('00000000-0000-4000-8000-0000000e8001', 'hwtest-dossier: a prompt entered, for testing only.', 'scheduled', now() - interval '12 days 7 minutes', 'keeper'),
  ('00000000-0000-4000-8000-0000000e8002', 'hwtest-dossier: a prompt only drafted, for testing.', 'scheduled', now() - interval '11 days 7 minutes', 'keeper');
insert into public.threads (id, title, category_id, author_id, prompt_id) values
  ('00000000-0000-4000-8000-0000000f8003', 'hwtest-dossier: a prompt entered, for testing only.', 'rituals', null, '00000000-0000-4000-8000-0000000e8001');
-- Opening posts and replies go in separate statements: on_post_created is AFTER ROW and
-- would otherwise count an opening post inserted beside its reply.
insert into public.posts (id, thread_id, author_id, content, created_at) values
  ('00000000-0000-4000-8000-0000000b8010', '00000000-0000-4000-8000-0000000f8003', null, 'hwtest-dossier: a prompt entered, for testing only.', now() - interval '12 days');
insert into public.posts (id, thread_id, author_id, title, content, created_at) values
  ('00000000-0000-4000-8000-0000000b8011', '00000000-0000-4000-8000-0000000f8003', pg_temp.u('old'), 'hwtest-dossier: entry', 'Entry body.', now() - interval '9 days');
insert into public.posts (id, thread_id, author_id, parent_post_id, content, created_at) values
  ('00000000-0000-4000-8000-0000000b8012', '00000000-0000-4000-8000-0000000f8003', pg_temp.u('other'), '00000000-0000-4000-8000-0000000b8011', 'hwtest-dossier: someone on the entry.', now() - interval '6 days');

insert into public.threads (id, title, category_id, author_id, created_at) values
  ('00000000-0000-4000-8000-0000000f8001', 'hwtest-dossier: old thread',
   (select id from public.categories where id <> 'rituals' order by id limit 1), pg_temp.u('old'), now() - interval '8 days');
insert into public.posts (id, thread_id, author_id, content, created_at) values
  ('00000000-0000-4000-8000-0000000b8001', '00000000-0000-4000-8000-0000000f8001', pg_temp.u('old'), 'hwtest-dossier: opening post.', now() - interval '8 days');
insert into public.posts (id, thread_id, author_id, content, created_at) values
  ('00000000-0000-4000-8000-0000000b8002', '00000000-0000-4000-8000-0000000f8001', pg_temp.u('other'), 'hwtest-dossier: a reply in the thread.', now() - interval '5 days');

insert into public.book_comments (id, book_id, author_id, content, created_at) values
  ('00000000-0000-4000-8000-0000000a8001', '00000000-0000-4000-8000-0000000d8001', pg_temp.u('other'), 'hwtest-dossier: someone on the story.', now() - interval '7 days'),
  ('00000000-0000-4000-8000-0000000a8003', '00000000-0000-4000-8000-0000000d8002', pg_temp.u('old'),   'hwtest-dossier: old on the other story.', now() - interval '4 days 12 hours');
-- A hidden critique: only a moderator action may set that status.
select set_config('app.automated_mod_action', 'true', true);
insert into public.book_comments (id, book_id, author_id, content, created_at, mod_status) values
  ('00000000-0000-4000-8000-0000000a8002', '00000000-0000-4000-8000-0000000d8001', pg_temp.u('other'), 'hwtest-dossier: a hidden critique.', now() - interval '4 days', 'hidden');
select set_config('app.automated_mod_action', 'false', true);

insert into public.ritual_drafts (author_id, prompt_id, content, created_at, updated_at) values
  (pg_temp.u('old'), '00000000-0000-4000-8000-0000000e8002', 'hwtest-dossier: a draft never posted', now() - interval '2 days', now() - interval '2 days');

insert into auth.sessions (id, user_id, created_at, updated_at, refreshed_at, user_agent) values
  (gen_random_uuid(), pg_temp.u('old'), now() - interval '20 days', now() - interval '20 days',
   (now() at time zone 'utc') - interval '3 days',
   'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
insert into auth.identities (provider_id, user_id, identity_data, provider) values
  ('hwtest-dossier-old', pg_temp.u('old'), '{}'::jsonb, 'google');

insert into public.client_errors (kind, message, user_id, created_at) values
  ('window',  'hwtest-dossier: older error', pg_temp.u('old'), now() - interval '2 hours'),
  ('request', 'hwtest-dossier: newer error', pg_temp.u('old'), now() - interval '1 hour');

insert into public.tickets (user_id, topic, subject, status, closed_at) values
  (pg_temp.u('old'), 'other', 'hwtest-dossier: open ticket',   'waiting', null),
  (pg_temp.u('old'), 'other', 'hwtest-dossier: closed ticket', 'closed',  now());

-- ── The keeper reads two dossiers ──
select pg_temp.be(pg_temp.u('keeper'));
insert into t_kept select 'old',  public.mod_user_dossier(pg_temp.u('old'));
insert into t_kept select 'week', public.mod_user_dossier(pg_temp.u('week'));
insert into t_kept select 'nobody', coalesce(public.mod_user_dossier('00000000-0000-4000-8000-00000000dead'), 'null'::jsonb);
insert into t_kept select 'funnel_after', public.admin_member_funnel();
insert into t_kept select 'steps',   public.admin_step_funnel(30);
insert into t_kept select 'steps_0', public.admin_step_funnel(0);
insert into t_kept select 'steps_big', public.admin_step_funnel(5000);
select pg_temp.be(null);

do $$
declare
  d jsonb := (select v from t_kept where k = 'old');
  w jsonb := (select v from t_kept where k = 'week');
  before jsonb := (select v from t_kept where k = 'funnel_before');
  after  jsonb := (select v from t_kept where k = 'funnel_after');
  steps  jsonb := (select v from t_kept where k = 'steps');
  days text[];
  expected text;
  f text;
begin
  -- ── 23. What they wrote, by kind ──
  perform pg_temp.must(d->'wrote' = '{"story":1,"thread":1,"reply":0,"ritual":1,"critique":1}'::jsonb,
    '23: wrote is story 1, thread 1, reply 0, ritual 1, critique 1; got ' || (d->'wrote')::text);

  -- ── 24. Responses: three live ones from someone else ──
  perform pg_temp.must((d->'responses'->>'count')::int = 3,
    '24a: three responses (the hidden critique and their own critique elsewhere do not count); got ' || (d->'responses')::text);
  perform pg_temp.must((d->'responses'->>'first_at')::timestamptz = now() - interval '7 days',
    '24b: the first response is the critique of 7 days ago');

  -- ── 25. First thing, and first piece ──
  perform pg_temp.must(d->'first'->>'kind' = 'story' and d->'first'->>'title' = 'hwtest-dossier: old story',
    '25a: the first thing they posted is the story');
  perform pg_temp.must(d->'first_piece'->>'kind' = 'story'
      and (d->'first_piece'->>'first_response_at')::timestamptz = now() - interval '7 days',
    '25b: the first piece is the story, answered 7 days ago');

  -- ── 26. Stopped at a draft never posted ──
  perform pg_temp.must(d->'last'->>'what' = 'draft' and d->'last'->'title' = 'null'::jsonb,
    '26: the latest thing is the unposted draft; got ' || (d->'last')::text);

  -- ── 27. How they sign in, and on what ──
  perform pg_temp.must(d->'sign_in'->'providers' = '["google"]'::jsonb and (d->'sign_in'->>'passkeys')::int = 0,
    '27a: one provider, google, and no passkey; got ' || (d->'sign_in')::text);
  perform pg_temp.must(jsonb_array_length(d->'user_agents') = 1 and d->'user_agents'->>0 like '%Chrome/131%',
    '27b: the one session user agent');

  -- ── 28. Days seen ──
  days := array(select jsonb_array_elements_text(d->'seen_days'));
  foreach f in array array['30 days', '20 days', '10 days', '9 days', '8 days', '3 days'] loop
    expected := to_char((now() - f::interval) at time zone 'utc', 'YYYY-MM-DD');
    perform pg_temp.must(expected = any(days), '28a: seen ' || f || ' ago (' || expected || ') is missing from ' || (d->'seen_days')::text);
  end loop;
  perform pg_temp.must(days = array(select x from unnest(days) x order by x), '28b: days are ascending');
  perform pg_temp.must(cardinality(days) = (select count(distinct x) from unnest(days) x), '28c: no day twice');

  -- ── 29. Trouble ──
  perform pg_temp.must((d->>'error_count')::int = 2 and jsonb_array_length(d->'errors') = 2
      and d->'errors'->0->>'message' = 'hwtest-dossier: newer error',
    '29a: two errors, newest first');
  perform pg_temp.must(d->'tickets' = '{"total":2,"open":1}'::jsonb, '29b: two tickets, one open; got ' || (d->'tickets')::text);
  perform pg_temp.must(jsonb_array_length(d->'steps') = 1 and d->'steps'->0->>'flow' = 'publish', '29c: the one step logged in check 15');

  -- ── 30. No arrival row, and nothing private in the result ──
  perform pg_temp.must(d->'arrival' = 'null'::jsonb, '30a: a member with no arrival row has a null arrival');
  perform pg_temp.must(position('example.test' in d::text) = 0, '30b: no email address anywhere in the dossier');
  perform pg_temp.must(position('"ip"' in d::text) = 0, '30c: no ip key anywhere in the dossier');
  perform pg_temp.must(d ?& array['joined_at','sign_in','user_agents','arrival','first','wrote','responses',
                                  'first_piece','seen_days','last','errors','error_count','tickets','steps'],
    '30d: every key is present');

  -- ── 31. A member who has done nothing ──
  perform pg_temp.must(w->'arrival'->>'found_via' = 'hwtest-dossier: a friend told me', '31a: their answer is in the arrival');
  perform pg_temp.must(w->'first' = 'null'::jsonb and w->'first_piece' = 'null'::jsonb and w->'last' = 'null'::jsonb,
    '31b: first, first_piece and last are null');
  perform pg_temp.must(w->'wrote' = '{"story":0,"thread":0,"reply":0,"ritual":0,"critique":0}'::jsonb,
    '31c: every count is zero; got ' || (w->'wrote')::text);
  perform pg_temp.must((w->'responses'->>'count')::int = 0 and w->'responses'->'first_at' = 'null'::jsonb,
    '31d: no responses');
  perform pg_temp.must(w ?& array['joined_at','sign_in','user_agents','arrival','first','wrote','responses',
                                  'first_piece','seen_days','last','errors','error_count','tickets','steps'],
    '31e: every key is present for an empty member too');

  -- ── 32. Not a member ──
  perform pg_temp.must((select v from t_kept where k = 'nobody') = 'null'::jsonb, '32: an unknown id gives null');

  -- ── 34. The roll-up moved by exactly the test's own members ──
  -- Since the first reading: `new` was deleted; `old` and `other` each wrote, were each
  -- answered, and were each seen on a later day than they joined.
  perform pg_temp.must((after->>'members')::int = (before->>'members')::int - 1,
    '34a: members fell by the one deleted account; ' || before::text || ' -> ' || after::text);
  perform pg_temp.must((after->>'wrote')::int = (before->>'wrote')::int + 2,
    '34b: two more wrote; ' || before::text || ' -> ' || after::text);
  perform pg_temp.must((after->>'got_response')::int = (before->>'got_response')::int + 2,
    '34c: two more got a response; ' || before::text || ' -> ' || after::text);
  perform pg_temp.must((after->>'came_back')::int = (before->>'came_back')::int + 2,
    '34d: two more came back; ' || before::text || ' -> ' || after::text);

  -- ── 36. The step roll-up ──
  perform pg_temp.must(jsonb_typeof(steps) = 'array', '36a: the step roll-up is an array');
  perform pg_temp.must(exists (select 1 from jsonb_array_elements(steps) e
      where e->>'flow' = 'join' and e->>'step' = 'opened' and (e->>'n')::int >= 3),
    '36b: the three Join visits from check 18 are counted');
  perform pg_temp.must(exists (select 1 from jsonb_array_elements(steps) e
      where e->>'flow' = 'publish' and e->>'step' = 'opened' and (e->>'n')::int >= 1),
    '36c: the member who opened Publish in check 15 is counted');
  perform pg_temp.must(
    (select count(distinct e->>'flow') from jsonb_array_elements(steps) e where e->>'step' = 'finished') = 6,
    '36d: a finished count for each of the six flows');
  perform pg_temp.must(exists (select 1 from jsonb_array_elements(steps) e
      where e->>'flow' = 'publish' and e->>'step' = 'finished' and (e->>'n')::int >= 2),
    '36e: the two test authors who published a story are counted as finished');

  -- ── 37. Out-of-range day counts are clamped, not errors ──
  perform pg_temp.must(jsonb_typeof((select v from t_kept where k = 'steps_0')) = 'array'
      and jsonb_typeof((select v from t_kept where k = 'steps_big')) = 'array',
    '37: 0 and 5000 days are clamped');
end $$;

-- ── 33. Only a keeper may open a dossier ──
select pg_temp.be(pg_temp.u('warden'));
select pg_temp.must(pg_temp.refused('select public.mod_user_dossier(pg_temp.u(''old''))'), '33a: a warden is refused the dossier');
-- ── 35. Only a keeper may read the roll-ups ──
select pg_temp.must(pg_temp.refused('select public.admin_member_funnel()'), '35a: a warden is refused the member roll-up');
select pg_temp.must(pg_temp.refused('select public.admin_step_funnel()'),   '35b: a warden is refused the step roll-up');
select pg_temp.be(pg_temp.u('old'));
select pg_temp.must(pg_temp.refused('select public.mod_user_dossier(pg_temp.u(''old''))'), '33b: a member is refused their own dossier');
select pg_temp.be_anon();
select pg_temp.must(pg_temp.refused('select public.mod_user_dossier(pg_temp.u(''old''))'), '33c: anon is refused the dossier');
select pg_temp.be(null);

-- ── Who may call what ──
select pg_temp.must(not has_function_privilege('authenticated', 'public.member_responses_index()', 'execute'), 'the responses index must be private');
select pg_temp.must(not has_function_privilege('authenticated', 'public.member_seen_index()', 'execute'),      'the seen index must be private');
select pg_temp.must(not has_function_privilege('authenticated', 'public.known_steps()', 'execute'),            'the step list must be private');
select pg_temp.must(not has_function_privilege('authenticated', 'public.step_is_known(text, text)', 'execute'), 'step_is_known must be private');
select pg_temp.must(has_function_privilege('anon', 'public.tally_step(text, text)', 'execute'),                'anon must reach tally_step');
select pg_temp.must(not has_function_privilege('anon', 'public.mod_user_dossier(uuid)', 'execute'),            'anon must not reach the dossier');

select 'ALL PASS' as result;
rollback;
