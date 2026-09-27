-- Behaviour test for delete_member (20260927000000). Rolls back; nothing is kept.
-- Success = final row 'ALL PASS'. Any failure raises 'FAIL: ...'.
-- Run: npx supabase db query --linked -f scripts/sql/test-delete-member.sql
begin;

-- Three throwaway members. handle_new_user() creates their profiles.
insert into auth.users (id, email, aud, role, instance_id)
values ('00000000-0000-4000-8000-00000000d001', 'leaver@example.test',  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
       ('00000000-0000-4000-8000-00000000d002', 'stayer@example.test',  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
       ('00000000-0000-4000-8000-00000000d003', 'dashboarded@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');

-- Leaver: a story others critiqued, a story nobody critiqued, a thread with a reply,
-- a thread without, a critique and a reply on the stayer's work, a series, and a
-- mod note the leaver wrote about the stayer (F1).
insert into public.books (id, title, lede, content, author_id) values
  ('00000000-0000-4000-8000-0000000b0001', 'Critiqued', 'L', 'C', '00000000-0000-4000-8000-00000000d001'),
  ('00000000-0000-4000-8000-0000000b0002', 'Lonely',    'L', 'C', '00000000-0000-4000-8000-00000000d001'),
  ('00000000-0000-4000-8000-0000000b0003', 'Stayer story', 'L', 'C', '00000000-0000-4000-8000-00000000d002');
insert into public.book_comments (book_id, author_id, content) values
  ('00000000-0000-4000-8000-0000000b0001', '00000000-0000-4000-8000-00000000d002', 'stayer critique'),
  ('00000000-0000-4000-8000-0000000b0003', '00000000-0000-4000-8000-00000000d001', 'leaver critique');
insert into public.threads (id, title, category_id, author_id) values
  ('00000000-0000-4000-8000-0000000a0001', 'Replied',  (select id from public.categories limit 1), '00000000-0000-4000-8000-00000000d001'),
  ('00000000-0000-4000-8000-0000000a0002', 'Silent',   (select id from public.categories limit 1), '00000000-0000-4000-8000-00000000d001');
insert into public.posts (thread_id, author_id, content) values
  ('00000000-0000-4000-8000-0000000a0001', '00000000-0000-4000-8000-00000000d001', 'opening post'),
  ('00000000-0000-4000-8000-0000000a0001', '00000000-0000-4000-8000-00000000d002', 'stayer reply'),
  ('00000000-0000-4000-8000-0000000a0002', '00000000-0000-4000-8000-00000000d001', 'opening post 2');
insert into public.series (title, author_id) values ('Leaver series', '00000000-0000-4000-8000-00000000d001');
insert into public.mod_notes (target_user_id, author_id, note) values
  ('00000000-0000-4000-8000-00000000d002', '00000000-0000-4000-8000-00000000d001', 'leaver flagged the stayer for review');

-- Dashboarded member: never touches delete_member. Their auth.users row gets
-- deleted directly (as the Supabase dashboard would do), which cascades to
-- profiles -- the erase_member_content trigger must still fire (F2).
insert into public.books (id, title, lede, content, author_id) values
  ('00000000-0000-4000-8000-0000000b0004', 'Dashboarded lonely',    'L', 'C', '00000000-0000-4000-8000-00000000d003'),
  ('00000000-0000-4000-8000-0000000b0005', 'Dashboarded critiqued', 'L', 'C', '00000000-0000-4000-8000-00000000d003');
insert into public.book_comments (book_id, author_id, content) values
  ('00000000-0000-4000-8000-0000000b0005', '00000000-0000-4000-8000-00000000d002', 'stayer critique of dashboarded member');

select public.delete_member('00000000-0000-4000-8000-00000000d001', 'k-test', '\x01ff'::bytea);

-- F2: a profile deleted by a path other than delete_member -- here, the auth
-- user is deleted directly, the way the Supabase dashboard would -- must still
-- get the same erase/tombstone treatment, because it lives in a trigger.
delete from auth.users where id = '00000000-0000-4000-8000-00000000d003';

do $$
begin
  if exists (select 1 from public.profiles where id = '00000000-0000-4000-8000-00000000d001') then
    raise exception 'FAIL: profile still exists'; end if;
  if not exists (select 1 from public.books where id = '00000000-0000-4000-8000-0000000b0001'
                 and removed_by_author and author_id is null and title = '' and content is null) then
    raise exception 'FAIL: critiqued story is not a tombstone'; end if;
  if exists (select 1 from public.books where id = '00000000-0000-4000-8000-0000000b0002') then
    raise exception 'FAIL: uncritiqued story should be deleted'; end if;
  if not exists (select 1 from public.book_comments where content = 'stayer critique') then
    raise exception 'FAIL: another member''s critique was lost'; end if;
  if exists (select 1 from public.book_comments where content = 'leaver critique') then
    raise exception 'FAIL: leaver''s critique survived'; end if;
  if not exists (select 1 from public.threads where id = '00000000-0000-4000-8000-0000000a0001'
                 and removed_by_author and author_id is null and title = '') then
    raise exception 'FAIL: replied thread is not a tombstone'; end if;
  if exists (select 1 from public.threads where id = '00000000-0000-4000-8000-0000000a0002') then
    raise exception 'FAIL: silent thread should be deleted'; end if;
  if not exists (select 1 from public.posts where content = 'stayer reply') then
    raise exception 'FAIL: another member''s reply was lost'; end if;
  if exists (select 1 from public.posts where content like 'opening post%') then
    raise exception 'FAIL: leaver''s posts survived'; end if;
  if exists (select 1 from public.series where title = 'Leaver series') then
    raise exception 'FAIL: series survived'; end if;
  if not exists (select 1 from public.sealed_bundles where email_key = 'k-test'
                 and expires_at > now() + interval '6 years 11 months') then
    raise exception 'FAIL: sealed bundle missing or wrong expiry'; end if;

  -- F1: a mod note authored by the leaver about the stayer survives the
  -- author's deletion, with author_id cleared instead of the delete failing.
  if not exists (select 1 from public.mod_notes
                 where target_user_id = '00000000-0000-4000-8000-00000000d002'
                   and note = 'leaver flagged the stayer for review'
                   and author_id is null) then
    raise exception 'FAIL: mod note did not survive author deletion with author_id cleared'; end if;

  -- F2: a profile deleted outside delete_member (direct auth.users delete,
  -- cascading to profiles) still gets erased/tombstoned via the trigger.
  if exists (select 1 from public.profiles where id = '00000000-0000-4000-8000-00000000d003') then
    raise exception 'FAIL: dashboard-deleted profile still exists'; end if;
  if exists (select 1 from public.books where id = '00000000-0000-4000-8000-0000000b0004') then
    raise exception 'FAIL: dashboard-deleted member''s uncritiqued story should be deleted'; end if;
  if not exists (select 1 from public.books where id = '00000000-0000-4000-8000-0000000b0005'
                 and removed_by_author and author_id is null and title = '' and content is null) then
    raise exception 'FAIL: dashboard-deleted member''s critiqued story is not a tombstone'; end if;
end $$;

-- No client role may touch sealed_bundles or call delete_member.
do $$
begin
  if has_table_privilege('anon', 'public.sealed_bundles', 'select')
     or has_table_privilege('authenticated', 'public.sealed_bundles', 'select') then
    raise exception 'FAIL: client role can read sealed_bundles'; end if;
  if has_function_privilege('authenticated', 'public.delete_member(uuid, text, bytea)', 'execute')
     or has_function_privilege('anon', 'public.delete_member(uuid, text, bytea)', 'execute') then
    raise exception 'FAIL: client role can call delete_member'; end if;
end $$;

select 'ALL PASS' as result;
rollback;
