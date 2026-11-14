-- Behaviour test for 20261114000000_admin_export_writing.sql. Rolls back; nothing is kept.
-- Success = final row 'ALL PASS'. Any failure raises 'FAIL: ...'.
--
--   & .\scripts\sql\rehearse.ps1 -Test scripts\sql\test-admin-export.sql -Migration supabase\migrations\20261114000000_admin_export_writing.sql
--
-- Uses throwaway accounts (...c60xx) and content (...d60xx, ...f60xx, ...b60xx).
begin;

do $$ begin
  if to_regprocedure('public.admin_export_writing()') is null then
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

-- True when calling the export as the current role is refused.
create function pg_temp.refused()
returns boolean language plpgsql as $f$
begin
  perform public.admin_export_writing();
  return false;
exception when insufficient_privilege then
  return true;
end $f$;

grant execute on function pg_temp.must(boolean, text) to authenticated, anon;
grant execute on function pg_temp.be(uuid)            to authenticated, anon;
grant execute on function pg_temp.refused()           to authenticated, anon;

-- ── Actors ─────────────────────────────────────────────
insert into auth.users (id, email, aud, role, instance_id, created_at) values
  ('00000000-0000-4000-8000-0000000c6001', 'export-writer@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now()),
  ('00000000-0000-4000-8000-0000000c6002', 'export-keeper@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now()),
  ('00000000-0000-4000-8000-0000000c6003', 'export-warden@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now());

update public.profiles set mod_role = 'keeper', mod_scope = 'all' where id = '00000000-0000-4000-8000-0000000c6002';
update public.profiles set mod_role = 'warden', mod_scope = 'all' where id = '00000000-0000-4000-8000-0000000c6003';

-- The keeper has blocked the writer: a direct table read would hide all of the writer's work.
insert into public.user_blocks (blocker_id, blocked_id) values
  ('00000000-0000-4000-8000-0000000c6002', '00000000-0000-4000-8000-0000000c6001');

-- ── Content ────────────────────────────────────────────
insert into public.books (id, title, lede, content, author_id, mod_status, removed_by_author) values
  ('00000000-0000-4000-8000-0000000d6001', 'Export live story',    'L', 'Live body',    '00000000-0000-4000-8000-0000000c6001', 'live',   false),
  ('00000000-0000-4000-8000-0000000d6002', 'Export hidden story',  'L', 'Hidden body',  '00000000-0000-4000-8000-0000000c6001', 'hidden', false),
  ('00000000-0000-4000-8000-0000000d6003', 'Export removed story', 'L', 'Removed body', '00000000-0000-4000-8000-0000000c6001', 'live',   true);

insert into public.threads (id, title, category_id, author_id) values
  ('00000000-0000-4000-8000-0000000f6001', 'Export thread', (select id from public.categories where id <> 'rituals' order by id limit 1), '00000000-0000-4000-8000-0000000c6001');
insert into public.posts (id, thread_id, author_id, content) values
  ('00000000-0000-4000-8000-0000000b6001', '00000000-0000-4000-8000-0000000f6001', '00000000-0000-4000-8000-0000000c6001', 'Export opening post.');
insert into public.posts (id, thread_id, author_id, content) values
  ('00000000-0000-4000-8000-0000000b6002', '00000000-0000-4000-8000-0000000f6001', null, 'A post left by a deleted account.');

insert into public.book_comments (id, book_id, author_id, content) values
  ('00000000-0000-4000-8000-0000000b6003', '00000000-0000-4000-8000-0000000d6001', '00000000-0000-4000-8000-0000000c6003', 'Export critique.');

-- ── Who may call it ────────────────────────────────────
select pg_temp.be('00000000-0000-4000-8000-0000000c6001');
select pg_temp.must(pg_temp.refused(), 'a plain member is refused');
select pg_temp.be('00000000-0000-4000-8000-0000000c6003');
select pg_temp.must(pg_temp.refused(), 'a warden is refused (keepers only)');
select pg_temp.be(null);
select pg_temp.must(not has_function_privilege('anon', 'public.admin_export_writing()', 'execute'), 'anon cannot execute it');

-- ── What a keeper gets ─────────────────────────────────
select pg_temp.be('00000000-0000-4000-8000-0000000c6002');
select pg_temp.must(not pg_temp.refused(), 'the keeper is allowed');

-- Sanity: a direct read really is blinded by the block, which is why the RPC exists.
select pg_temp.must(not exists (select 1 from public.books where id = '00000000-0000-4000-8000-0000000d6001'),
  'the block hides the writer''s story from a direct read');

-- Kept in a setting so it can be read back as the admin role.
select set_config('test.export', public.admin_export_writing()::text, true);
select pg_temp.be(null);
create temp table x on commit drop as select current_setting('test.export')::jsonb as j;

select pg_temp.must((select j ? 'exported_at' from x), 'has exported_at');
select pg_temp.must(exists (select 1 from x, jsonb_array_elements(j->'books') e where e->>'id' = '00000000-0000-4000-8000-0000000d6001' and e->>'content' = 'Live body'),
  'includes the blocked writer''s live story, with its text');
select pg_temp.must(exists (select 1 from x, jsonb_array_elements(j->'books') e where e->>'id' = '00000000-0000-4000-8000-0000000d6002' and e->>'mod_status' = 'hidden'),
  'includes the hidden story, marked hidden');
select pg_temp.must(not exists (select 1 from x, jsonb_array_elements(j->'books') e where e->>'id' = '00000000-0000-4000-8000-0000000d6003'),
  'leaves out the story its author removed');
select pg_temp.must(exists (select 1 from x, jsonb_array_elements(j->'threads') e where e->>'id' = '00000000-0000-4000-8000-0000000f6001'),
  'includes the thread');
select pg_temp.must(exists (select 1 from x, jsonb_array_elements(j->'posts') e where e->>'id' = '00000000-0000-4000-8000-0000000b6001' and e->>'content' = 'Export opening post.'),
  'includes the post, with its text');
select pg_temp.must(not exists (select 1 from x, jsonb_array_elements(j->'posts') e where e->>'id' = '00000000-0000-4000-8000-0000000b6002'),
  'leaves out the post with no author');
select pg_temp.must(exists (select 1 from x, jsonb_array_elements(j->'book_comments') e where e->>'id' = '00000000-0000-4000-8000-0000000b6003'),
  'includes the critique');
select pg_temp.must(exists (select 1 from x, jsonb_array_elements(j->'members') e where e->>'id' = '00000000-0000-4000-8000-0000000c6001' and e ? 'handle'),
  'lists the writer with a handle');
select pg_temp.must((select jsonb_typeof(j->'series') = 'array' and jsonb_typeof(j->'series_books') = 'array' and jsonb_typeof(j->'ritual_prompts') = 'array' from x),
  'series, series_books and ritual_prompts are arrays');

select 'ALL PASS' as result;

rollback;
