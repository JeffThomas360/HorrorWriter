-- Behaviour test for 20261109000000_member_submissions.sql. Rolls back; nothing is kept.
-- Success = final row 'ALL PASS'. Any failure raises 'FAIL: ...'.
--
--   & .\scripts\sql\rehearse.ps1 -Test scripts\sql\test-submissions.sql -Migration supabase\migrations\20261109000000_member_submissions.sql
--
-- Uses throwaway accounts (...c50xx) and content (...d50xx, ...f50xx, ...b50xx). Dates are
-- written out because now() stands still inside a transaction, and the opening-post rule
-- needs posts at different times.
begin;

do $$ begin
  if to_regprocedure('public.mod_user_submissions(uuid)') is null then
    raise exception 'FAIL: the migration is not loaded';
  end if;
end $$;

-- ── Helpers (session-temporary) ────────────────────────
create function pg_temp.must(p_ok boolean, p_what text)
returns void language plpgsql as $f$
begin
  if p_ok is distinct from true then raise exception 'FAIL: %', p_what; end if;
end $f$;

-- Act as a signed-in member, the way PostgREST does. Null = back to the admin role.
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

grant execute on function pg_temp.must(boolean, text) to authenticated;
grant execute on function pg_temp.be(uuid)            to authenticated;

-- ── Actors ─────────────────────────────────────────────
insert into auth.users (id, email, aud, role, instance_id, created_at) values
  ('00000000-0000-4000-8000-0000000c5001', 'subs-writer@example.test',   'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now()),
  ('00000000-0000-4000-8000-0000000c5002', 'subs-other@example.test',    'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now()),
  ('00000000-0000-4000-8000-0000000c5003', 'subs-plain@example.test',    'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now()),
  ('00000000-0000-4000-8000-0000000c5004', 'subs-warden@example.test',   'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now()),
  ('00000000-0000-4000-8000-0000000c5005', 'subs-sentinel@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now()),
  ('00000000-0000-4000-8000-0000000c5006', 'subs-forum@example.test',    'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now()),
  ('00000000-0000-4000-8000-0000000c5007', 'subs-library@example.test',  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now());

update public.profiles set mod_role = 'warden',   mod_scope = 'all'     where id = '00000000-0000-4000-8000-0000000c5004';
update public.profiles set mod_role = 'sentinel', mod_scope = 'all'     where id = '00000000-0000-4000-8000-0000000c5005';
update public.profiles set mod_role = 'sentinel', mod_scope = 'forum'   where id = '00000000-0000-4000-8000-0000000c5006';
update public.profiles set mod_role = 'sentinel', mod_scope = 'library' where id = '00000000-0000-4000-8000-0000000c5007';

-- ── Content ────────────────────────────────────────────
-- Stories: one live and edited twice, one hidden, and one by someone else to critique.
insert into public.books (id, title, lede, content, author_id, version, mod_status, created_at) values
  ('00000000-0000-4000-8000-0000000d5001', 'Live story',   'L', 'Body', '00000000-0000-4000-8000-0000000c5001', 3, 'live',   '2026-10-03T12:00:00Z'),
  ('00000000-0000-4000-8000-0000000d5002', 'Hidden story', 'L', 'Body', '00000000-0000-4000-8000-0000000c5001', 1, 'hidden', '2026-10-04T12:00:00Z'),
  ('00000000-0000-4000-8000-0000000d5003', 'Other story',  'L', 'Body', '00000000-0000-4000-8000-0000000c5002', 1, 'live',   '2026-10-05T12:00:00Z');

-- Forum: the writer's thread (their opening post, someone's reply) and someone else's thread
-- (their opening post, the writer's long reply).
insert into public.threads (id, title, category_id, author_id, created_at) values
  ('00000000-0000-4000-8000-0000000f5001', 'Own thread',    (select id from public.categories where id <> 'rituals' order by id limit 1), '00000000-0000-4000-8000-0000000c5001', '2026-10-06T12:00:00Z'),
  ('00000000-0000-4000-8000-0000000f5002', 'Others thread', (select id from public.categories where id <> 'rituals' order by id limit 1), '00000000-0000-4000-8000-0000000c5002', '2026-10-06T12:00:00Z');
-- Opening posts and replies go in separate statements, as they do on the site: on_post_created
-- is an AFTER ROW trigger, which runs once the whole statement is in, so an opening post inserted
-- together with its reply sees the reply and gets counted in replies_count as well.
insert into public.posts (id, thread_id, author_id, content, created_at) values
  ('00000000-0000-4000-8000-0000000b5001', '00000000-0000-4000-8000-0000000f5001', '00000000-0000-4000-8000-0000000c5001', 'Own opening post.',    '2026-10-06T12:00:00Z'),
  ('00000000-0000-4000-8000-0000000b5003', '00000000-0000-4000-8000-0000000f5002', '00000000-0000-4000-8000-0000000c5002', 'Others opening post.', '2026-10-06T12:00:00Z');
insert into public.posts (id, thread_id, author_id, content, created_at) values
  ('00000000-0000-4000-8000-0000000b5002', '00000000-0000-4000-8000-0000000f5001', '00000000-0000-4000-8000-0000000c5002', 'A reply to the writer.', '2026-10-06T13:00:00Z'),
  ('00000000-0000-4000-8000-0000000b5004', '00000000-0000-4000-8000-0000000f5002', '00000000-0000-4000-8000-0000000c5001', repeat('word   ', 40),  '2026-10-06T14:00:00Z');

-- A Ritual: a prompt thread nobody owns, two entries by the writer (one edited before edits
-- were counted, one newer than counting), one by someone else, and a critique each way.
insert into public.ritual_prompts (id, body, status, goes_live_at, source) values
  ('00000000-0000-4000-8000-0000000e5001', 'A submissions prompt, for testing only.', 'scheduled', now() - interval '3 days', 'keeper');
insert into public.threads (id, title, category_id, author_id, prompt_id) values
  ('00000000-0000-4000-8000-0000000f5003', 'A submissions prompt, for testing only.', 'rituals', null, '00000000-0000-4000-8000-0000000e5001');
insert into public.posts (id, thread_id, author_id, content, created_at) values
  ('00000000-0000-4000-8000-0000000b5010', '00000000-0000-4000-8000-0000000f5003', null, 'A submissions prompt, for testing only.', '2026-10-07T00:00:00Z');
insert into public.posts (id, thread_id, author_id, title, content, created_at, edited_at) values
  ('00000000-0000-4000-8000-0000000b5011', '00000000-0000-4000-8000-0000000f5003', '00000000-0000-4000-8000-0000000c5001', 'Old entry',    'Old entry body.',    '2026-10-07T12:00:00Z', '2026-10-08T12:00:00Z'),
  ('00000000-0000-4000-8000-0000000b5012', '00000000-0000-4000-8000-0000000f5003', '00000000-0000-4000-8000-0000000c5001', 'New entry',    'New entry body.',    '2026-11-20T12:00:00Z', null),
  ('00000000-0000-4000-8000-0000000b5013', '00000000-0000-4000-8000-0000000f5003', '00000000-0000-4000-8000-0000000c5002', 'Others entry', 'Others entry body.', '2026-10-08T12:00:00Z', null);
insert into public.posts (id, thread_id, author_id, parent_post_id, content, created_at) values
  ('00000000-0000-4000-8000-0000000b5014', '00000000-0000-4000-8000-0000000f5003', '00000000-0000-4000-8000-0000000c5001', '00000000-0000-4000-8000-0000000b5013', 'The writer on the other entry.', '2026-10-09T12:00:00Z'),
  ('00000000-0000-4000-8000-0000000b5015', '00000000-0000-4000-8000-0000000f5003', '00000000-0000-4000-8000-0000000c5002', '00000000-0000-4000-8000-0000000b5011', 'Someone on the old entry.',      '2026-10-10T12:00:00Z');

-- Story critiques, one each way.
insert into public.book_comments (id, book_id, author_id, content, created_at) values
  ('00000000-0000-4000-8000-0000000a5001', '00000000-0000-4000-8000-0000000d5003', '00000000-0000-4000-8000-0000000c5001', 'The writer on the other story.', '2026-10-11T12:00:00Z'),
  ('00000000-0000-4000-8000-0000000a5002', '00000000-0000-4000-8000-0000000d5001', '00000000-0000-4000-8000-0000000c5002', 'Someone on the live story.',     '2026-10-12T12:00:00Z');

-- A report on one story and one Ritual entry.
insert into public.reports (reporter_id, target_type, target_id, category) values
  ('00000000-0000-4000-8000-0000000c5002', 'story', '00000000-0000-4000-8000-0000000d5001', 'spam'),
  ('00000000-0000-4000-8000-0000000c5002', 'post',  '00000000-0000-4000-8000-0000000b5011', 'other');

-- ── Checks ─────────────────────────────────────────────
do $$
declare
  writer      uuid := '00000000-0000-4000-8000-0000000c5001';
  other       uuid := '00000000-0000-4000-8000-0000000c5002';
  plain       uuid := '00000000-0000-4000-8000-0000000c5003';
  warden      uuid := '00000000-0000-4000-8000-0000000c5004';
  sentinel    uuid := '00000000-0000-4000-8000-0000000c5005';
  forum_mod   uuid := '00000000-0000-4000-8000-0000000c5006';
  library_mod uuid := '00000000-0000-4000-8000-0000000c5007';
  live_story   uuid := '00000000-0000-4000-8000-0000000d5001';
  hidden_story uuid := '00000000-0000-4000-8000-0000000d5002';
  other_story  uuid := '00000000-0000-4000-8000-0000000d5003';
  own_thread    uuid := '00000000-0000-4000-8000-0000000f5001';
  others_thread uuid := '00000000-0000-4000-8000-0000000f5002';
  prompt_thread uuid := '00000000-0000-4000-8000-0000000f5003';
  own_opening   uuid := '00000000-0000-4000-8000-0000000b5001';
  long_reply    uuid := '00000000-0000-4000-8000-0000000b5004';
  prompt_post   uuid := '00000000-0000-4000-8000-0000000b5010';
  old_entry     uuid := '00000000-0000-4000-8000-0000000b5011';
  new_entry     uuid := '00000000-0000-4000-8000-0000000b5012';
  others_entry  uuid := '00000000-0000-4000-8000-0000000b5013';
  ritual_critique uuid := '00000000-0000-4000-8000-0000000b5014';
  story_critique  uuid := '00000000-0000-4000-8000-0000000a5001';
  j jsonb;
  r record;
  first_row uuid;
begin
  -- ── 1. Who can call what ───────────────────────────────
  perform pg_temp.must(has_function_privilege('authenticated', 'public.mod_user_submissions(uuid)', 'execute'), 'authenticated must reach mod_user_submissions');
  perform pg_temp.must(has_function_privilege('authenticated', 'public.mod_list_users()', 'execute'), 'recreating mod_list_users must restore its grant');
  perform pg_temp.must(not has_function_privilege('anon', 'public.mod_user_submissions(uuid)', 'execute'), 'anon must not reach mod_user_submissions');
  perform pg_temp.must(not has_function_privilege('anon', 'public.mod_list_users()', 'execute'), 'anon must not reach mod_list_users');
  perform pg_temp.must(not has_function_privilege('authenticated', 'public.member_submissions_index()', 'execute'), 'the index must be private');
  perform pg_temp.must(not has_function_privilege('authenticated', 'public.submission_excerpt(text)', 'execute'), 'the excerpt helper must be private');
  perform pg_temp.must(not has_function_privilege('authenticated', 'public.count_post_edit()', 'execute'), 'the trigger function must be private');

  -- ── 2. Sorting rows into kinds, read as a warden through the Users list ──────
  perform pg_temp.be(warden);
  select u.submissions into j from public.mod_list_users() u where u.id = writer;
  perform pg_temp.must(j->'story'->>'total' = '2', format('stories: want 2, got %s', j->'story'));
  perform pg_temp.must(j->'story'->>'hidden' = '1', format('hidden stories: want 1, got %s', j->'story'));
  perform pg_temp.must(j->'ritual'->>'total' = '2', format('ritual entries: want 2, got %s', j->'ritual'));
  perform pg_temp.must(j->'thread'->>'total' = '1', format('threads: want 1, got %s', j->'thread'));
  perform pg_temp.must(j->'reply'->>'total' = '1', format('replies: want 1 (the opening post is not a reply), got %s', j->'reply'));
  perform pg_temp.must(j->'critique'->>'total' = '2', format('critiques: want a story one and a Ritual one, got %s', j->'critique'));
  select u.submissions into j from public.mod_list_users() u where u.id = plain;
  perform pg_temp.must(j = '{}'::jsonb, format('a member with nothing must read {}, got %s', j));

  -- ── 3. The case file's rows ───────────────────────────
  perform pg_temp.must((select count(*) from public.mod_user_submissions(writer)) = 8, 'the writer has 8 submissions');
  perform pg_temp.must(not exists (select 1 from public.mod_user_submissions(writer) s where s.id = own_opening), 'an opening post must not be listed as a reply');
  select s.id into first_row from public.mod_user_submissions(writer) s limit 1;
  perform pg_temp.must(first_row = new_entry, 'rows must come newest first');

  select * into r from public.mod_user_submissions(writer) s where s.id = live_story;
  perform pg_temp.must(r.kind = 'story' and r.title = 'Live story' and r.story_id = live_story, 'story row identity');
  perform pg_temp.must(r.edits = 2 and not r.edits_is_minimum, format('version 3 means 2 edits, got %s', r.edits));
  perform pg_temp.must(r.critiques = 1, format('story critiques: want 1, got %s', r.critiques));
  perform pg_temp.must(r.reports = 1, format('story reports: want 1, got %s', r.reports));

  select * into r from public.mod_user_submissions(writer) s where s.id = hidden_story;
  perform pg_temp.must(r.mod_status = 'hidden' and r.edits = 0 and r.reports = 0, 'hidden story row');

  select * into r from public.mod_user_submissions(writer) s where s.id = own_thread;
  perform pg_temp.must(r.kind = 'thread' and r.thread_id = own_thread and r.replies = 1, format('thread row: want 1 reply, got %s', r.replies));
  perform pg_temp.must(r.edits is null, 'threads have no edit count');

  select * into r from public.mod_user_submissions(writer) s where s.id = long_reply;
  perform pg_temp.must(r.kind = 'reply' and r.thread_id = others_thread and r.context_title = 'Others thread', 'reply row identity');
  perform pg_temp.must(right(r.excerpt, 1) = '…' and char_length(r.excerpt) <= 101, format('long excerpt must be cut: %s', r.excerpt));
  perform pg_temp.must(position('  ' in r.excerpt) = 0, 'runs of spaces must be squeezed');

  select * into r from public.mod_user_submissions(writer) s where s.id = old_entry;
  perform pg_temp.must(r.kind = 'ritual' and r.title = 'Old entry' and r.excerpt is null, 'entry row identity');
  perform pg_temp.must(r.context_title = 'A submissions prompt, for testing only.' and r.thread_id = prompt_thread, 'an entry names its prompt');
  perform pg_temp.must(r.critiques = 1 and r.reports = 1, format('entry critiques %s, reports %s', r.critiques, r.reports));
  perform pg_temp.must(r.edits = 1 and r.edits_is_minimum, 'an edit before counting began must read as a minimum');

  select * into r from public.mod_user_submissions(writer) s where s.id = new_entry;
  perform pg_temp.must(r.edits = 0 and not r.edits_is_minimum, 'an unedited entry reads a plain 0');

  select * into r from public.mod_user_submissions(writer) s where s.id = ritual_critique;
  perform pg_temp.must(r.kind = 'critique' and r.context_kind = 'ritual' and r.context_title = 'Others entry', 'Ritual critique names the entry');
  perform pg_temp.must(r.thread_id = prompt_thread and r.story_id is null and r.edits is null, 'Ritual critique links to the thread');

  select * into r from public.mod_user_submissions(writer) s where s.id = story_critique;
  perform pg_temp.must(r.kind = 'critique' and r.context_kind = 'story' and r.context_title = 'Other story', 'story critique names the story');
  perform pg_temp.must(r.story_id = other_story and r.thread_id is null and r.edits is null, 'story critique links to the story');

  -- ── 4. Nobody owns the classics or the prompts ─────────
  perform pg_temp.be(null);
  perform pg_temp.must(not exists (select 1 from public.member_submissions_index() s where s.author_id is null), 'no ownerless rows in the index');
  perform pg_temp.must(not exists (select 1 from public.member_submissions_index() s where s.id in (prompt_post, prompt_thread)), 'a prompt is nobody''s submission');

  -- ── 5. Counting edits ─────────────────────────────────
  update public.posts set content = 'Changed.', edited_at = now() where id = new_entry;
  perform pg_temp.must((select edit_count from public.posts where id = new_entry) = 1, 'a content change counts');
  update public.posts set title = 'Renamed entry' where id = new_entry;
  perform pg_temp.must((select edit_count from public.posts where id = new_entry) = 2, 'a title change counts');
  update public.posts set content = 'Changed.' where id = new_entry;
  perform pg_temp.must((select edit_count from public.posts where id = new_entry) = 2, 'saving the same text does not count');
  update public.posts set mod_status = 'hidden' where id = others_entry;
  perform pg_temp.must((select edit_count from public.posts where id = others_entry) = 0, 'a moderation change is not an edit');

  update public.posts set content = 'Changed again.', edited_at = now() where id = old_entry;
  perform pg_temp.be(warden);
  select * into r from public.mod_user_submissions(writer) s where s.id = new_entry;
  perform pg_temp.must(r.edits = 2 and not r.edits_is_minimum, format('a counted entry reads exactly, got %s', r.edits));
  select * into r from public.mod_user_submissions(writer) s where s.id = old_entry;
  perform pg_temp.must(r.edits = 1 and r.edits_is_minimum, 'an entry older than counting stays a minimum after a new edit');

  -- A member can't set their own count, on update or on insert.
  perform pg_temp.be(writer);
  begin
    update public.posts set edit_count = 99 where id = new_entry;
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.be(null);
  perform pg_temp.must((select edit_count from public.posts where id = new_entry) = 2, 'a member must not be able to change their edit count');
  insert into public.posts (id, thread_id, author_id, content, created_at, edit_count) values
    ('00000000-0000-4000-8000-0000000b5020', others_thread, writer, 'Fresh reply.', '2026-10-06T15:00:00Z', 50);
  perform pg_temp.must((select edit_count from public.posts where id = '00000000-0000-4000-8000-0000000b5020') = 0, 'a new post starts at 0 whatever it asks for');
  delete from public.posts where id = '00000000-0000-4000-8000-0000000b5020';

  -- ── 6. Who sees what ──────────────────────────────────
  perform pg_temp.be(plain);
  perform pg_temp.must((select count(*) from public.mod_user_submissions(writer)) = 0, 'a member gets no rows');
  perform pg_temp.must((select count(*) from public.mod_list_users()) = 0, 'a member gets no directory');
  perform pg_temp.be(writer);
  perform pg_temp.must((select count(*) from public.mod_user_submissions(writer)) = 0, 'not even their own: this is a moderation view');

  perform pg_temp.be(sentinel);
  perform pg_temp.must((select count(*) from public.mod_list_users()) = 0, 'the directory stays warden and keeper only');
  perform pg_temp.must(exists (select 1 from public.mod_user_submissions(writer) s where s.id = hidden_story), 'any moderator opening a case file sees hidden rows');

  perform pg_temp.be(forum_mod);
  perform pg_temp.must(exists (select 1 from public.mod_user_submissions(writer) s where s.id = live_story), 'a scoped moderator still sees live rows from other areas');
  perform pg_temp.must(not exists (select 1 from public.mod_user_submissions(writer) s where s.id = hidden_story), 'a forum moderator must not see a hidden story');
  perform pg_temp.must(exists (select 1 from public.mod_user_submissions(other) s where s.id = others_entry), 'a forum moderator sees a hidden post');

  perform pg_temp.be(library_mod);
  perform pg_temp.must(exists (select 1 from public.mod_user_submissions(writer) s where s.id = hidden_story), 'a library moderator sees a hidden story');
  perform pg_temp.must(not exists (select 1 from public.mod_user_submissions(other) s where s.id = others_entry), 'a library moderator must not see a hidden post');

  perform pg_temp.be(null);
end $$;

select 'ALL PASS' as result;

rollback;
