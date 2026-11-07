-- Proves "Download my writing" works under real RLS for a banned member. Rolls back; nothing is kept.
-- Success = final row 'ALL PASS'. Any failure raises 'FAIL: ...'.
--
--   $env:SUPABASE_PROJECT_ID = 'bmvvugrfnuedjlucmlbw'; npx supabase db query --remote -f scripts/sql/test-download-access.sql
--
-- The promise: a member can always read back everything they wrote, even work a moderator
-- hid, even with banned_until in 2099. The column lists below are EXACTLY what
-- src/lib/writingExport.js selects, so a misnamed column fails here first. It also proves
-- the bundle of a kept story and a kept ritual entry stays readable to a banned owner (the
-- kept-file Download reads it with no RPC) and unreadable to anyone else.
-- Every actor is a throwaway account (...0d50xx); no real profile is touched.
begin;

-- ── Helpers (session-temporary) ────────────────────────────────────────────
create function pg_temp.must(p_ok boolean, p_what text)
returns void language plpgsql as $f$
begin
  if p_ok is distinct from true then raise exception 'FAIL: %', p_what; end if;
end $f$;

-- Act as a signed-in member, the way PostgREST does. Null = back to the admin role this
-- script started with (the CLI's login role is not necessarily postgres).
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

grant execute on function pg_temp.must(boolean, text) to authenticated, anon;
grant execute on function pg_temp.be(uuid)            to authenticated, anon;

-- ── Actors ─────────────────────────────────────────────────────────────────
-- A = the banned writer. B = another member who owns the hidden thread and story A
-- took part in. C = an unrelated member.
insert into auth.users (id, email, aud, role, instance_id, created_at) values
  ('00000000-0000-4000-8000-0000000d5001', 'download-writer@example.test',  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now()),
  ('00000000-0000-4000-8000-0000000d5002', 'download-host@example.test',    'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now()),
  ('00000000-0000-4000-8000-0000000d5003', 'download-stranger@example.test','authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now());

-- ── Seed (as the admin role, so mod_status can be set directly) ────────────
insert into public.ritual_prompts (id, body, status, goes_live_at, source) values
  ('00000000-0000-4000-8000-0000000d5f01', 'A prompt for the download test.', 'scheduled', now() - interval '1 day', 'keeper');

-- A's own work, all hidden by a moderator.
insert into public.books (id, author_id, title, lede, content, mod_status) values
  ('00000000-0000-4000-8000-0000000d5101', '00000000-0000-4000-8000-0000000d5001', 'Hidden Story', 'A lede.', 'Story text.', 'hidden');
insert into public.threads (id, author_id, title, category_id, mod_status) values
  ('00000000-0000-4000-8000-0000000d5201', '00000000-0000-4000-8000-0000000d5001', 'Hidden Thread', (select id from public.categories limit 1), 'hidden');
insert into public.posts (id, thread_id, author_id, title, content, mod_status) values
  ('00000000-0000-4000-8000-0000000d5301', '00000000-0000-4000-8000-0000000d5201', '00000000-0000-4000-8000-0000000d5001', 'Hidden Post', 'Post text.', 'hidden');
insert into public.series (id, author_id, title, description) values
  ('00000000-0000-4000-8000-0000000d5401', '00000000-0000-4000-8000-0000000d5001', 'My Series', 'A description that is writing too.');
insert into public.series_books (series_id, book_id, sort_order) values
  ('00000000-0000-4000-8000-0000000d5401', '00000000-0000-4000-8000-0000000d5101', 1);
insert into public.ritual_drafts (author_id, prompt_id, content) values
  ('00000000-0000-4000-8000-0000000d5001', '00000000-0000-4000-8000-0000000d5f01', 'A private ritual draft.');

-- B's hidden thread and hidden story, with A's work inside them.
insert into public.books (id, author_id, title, lede, content, mod_status) values
  ('00000000-0000-4000-8000-0000000d5102', '00000000-0000-4000-8000-0000000d5002', 'Hosts Hidden Story', 'L', 'C', 'hidden');
insert into public.threads (id, author_id, title, category_id, mod_status) values
  ('00000000-0000-4000-8000-0000000d5202', '00000000-0000-4000-8000-0000000d5002', 'Hosts Hidden Thread', (select id from public.categories limit 1), 'hidden');
insert into public.posts (id, thread_id, author_id, title, content, mod_status) values
  ('00000000-0000-4000-8000-0000000d5302', '00000000-0000-4000-8000-0000000d5202', '00000000-0000-4000-8000-0000000d5001', null, 'A reply in the host''s hidden thread.', 'hidden');
insert into public.book_comments (id, book_id, author_id, content, mod_status) values
  ('00000000-0000-4000-8000-0000000d5501', '00000000-0000-4000-8000-0000000d5101', '00000000-0000-4000-8000-0000000d5002', 'B critique on A story, live.', 'live'),
  ('00000000-0000-4000-8000-0000000d5502', '00000000-0000-4000-8000-0000000d5102', '00000000-0000-4000-8000-0000000d5001', 'A critique on the host''s hidden story.', 'hidden'),
  ('00000000-0000-4000-8000-0000000d5503', '00000000-0000-4000-8000-0000000d5101', '00000000-0000-4000-8000-0000000d5001', 'A critique on own hidden story.', 'hidden');

-- A's kept work: one row in each vault. Bundles are opaque filler of the minimum legal size
-- (45 bytes); nothing here is, or needs, a real ciphertext or secret. key_version points at
-- an existing key version, looked up by number only.
insert into public.story_vault (owner_id, book_id, nonce, key_version, bundle) values
  ('00000000-0000-4000-8000-0000000d5001', gen_random_uuid(), gen_random_uuid(),
   (select version from public.ritual_vault_keys order by version limit 1), decode(repeat('ab', 45), 'hex'));
insert into public.ritual_vault (owner_id, prompt_id, entry_id, nonce, key_version, bundle) values
  ('00000000-0000-4000-8000-0000000d5001', '00000000-0000-4000-8000-0000000d5f01', gen_random_uuid(), gen_random_uuid(),
   (select version from public.ritual_vault_keys order by version limit 1), decode(repeat('cd', 45), 'hex'));

-- Ban A until 2099 (admin role, no JWT, so the self-sanction guard does not apply).
update public.profiles set banned_until = '2099-01-01T00:00:00Z' where id = '00000000-0000-4000-8000-0000000d5001';

do $$
declare
  a uuid := '00000000-0000-4000-8000-0000000d5001';
  b uuid := '00000000-0000-4000-8000-0000000d5002';
  c uuid := '00000000-0000-4000-8000-0000000d5003';
  n integer;
begin
  perform pg_temp.must((select count(*) from public.profiles where id in (a, b, c)) = 3, 'three throwaway profiles');
  perform pg_temp.must((select banned_until from public.profiles where id = a) > now() + interval '50 years', 'A is banned until 2099');
  perform pg_temp.must(public.is_banned(a), 'is_banned(A) is true');

  -- ── A, banned, reads every kind of their own writing (exact column lists) ──
  perform pg_temp.be(a);

  select count(*) into n from (
    select id, title, lede, content, mod_status, prompt_id, created_at, updated_at
    from public.books where author_id = a order by id) q;
  perform pg_temp.must(n = 1, format('A reads their own hidden story: got %s', n));

  select count(*) into n from (
    select id, title, category_id, mod_status, prompt_id, created_at
    from public.threads where author_id = a order by id) q;
  perform pg_temp.must(n = 1, format('A reads their own hidden thread: got %s', n));

  select count(*) into n from (
    select id, thread_id, title, content, mod_status, created_at, updated_at
    from public.posts where author_id = a order by id) q;
  perform pg_temp.must(n = 2, format('A reads both their posts, incl. the one in the host''s hidden thread: got %s', n));

  select count(*) into n from (
    select id, book_id, content, mod_status, created_at
    from public.book_comments where author_id = a order by id) q;
  perform pg_temp.must(n = 2, format('A reads both their critiques, incl. the one on the host''s hidden story: got %s', n));

  select count(*) into n from (
    select prompt_id, content, created_at, updated_at
    from public.ritual_drafts where author_id = a order by id) q;
  perform pg_temp.must(n = 1, format('A reads their ritual draft: got %s', n));

  select count(*) into n from (
    select id, title, description, created_at
    from public.series where author_id = a order by id) q;
  perform pg_temp.must(n = 1, format('A reads their series: got %s', n));

  -- Lookup columns.
  select count(*) into n from (
    select series_id, book_id, sort_order
    from public.series_books
    where series_id in ('00000000-0000-4000-8000-0000000d5401')
    order by series_id, book_id) q;
  perform pg_temp.must(n = 1, format('A reads their series_books row: got %s', n));

  select count(*) into n from (
    select id, body from public.ritual_prompts
    where id in ('00000000-0000-4000-8000-0000000d5f01')) q;
  perform pg_temp.must(n = 1, format('A reads the prompt behind their draft: got %s', n));

  -- Kept work: the Download button reads exactly this, with no RPC, so a ban must not block it.
  select count(*) into n from (
    select bundle from public.story_vault where owner_id = a) q;
  perform pg_temp.must(n = 1, format('banned A reads the bundle of their kept story: got %s', n));
  perform pg_temp.must(
    (select octet_length(bundle) from public.story_vault where owner_id = a) = 45,
    'banned A gets the whole story bundle');

  select count(*) into n from (
    select bundle from public.ritual_vault where owner_id = a) q;
  perform pg_temp.must(n = 1, format('banned A reads the bundle of their kept ritual entry: got %s', n));
  perform pg_temp.must(
    (select octet_length(bundle) from public.ritual_vault where owner_id = a) = 45,
    'banned A gets the whole ritual bundle');

  -- ── The host's thread and story are themselves unreadable to A ──
  perform pg_temp.must(
    (select count(*) from public.threads where id = '00000000-0000-4000-8000-0000000d5202') = 0,
    'A cannot read the host''s hidden thread');
  perform pg_temp.must(
    (select count(*) from public.books where id = '00000000-0000-4000-8000-0000000d5102') = 0,
    'A cannot read the host''s hidden story');

  -- ── A stranger cannot read A's hidden work ──
  perform pg_temp.be(c);
  perform pg_temp.must((select count(*) from public.books where id = '00000000-0000-4000-8000-0000000d5101') = 0, 'a stranger cannot read A''s hidden story');
  perform pg_temp.must((select count(*) from public.threads where id = '00000000-0000-4000-8000-0000000d5201') = 0, 'a stranger cannot read A''s hidden thread');
  perform pg_temp.must((select count(*) from public.posts where author_id = a) = 0, 'a stranger cannot read A''s hidden posts');
  perform pg_temp.must((select count(*) from public.book_comments where author_id = a) = 0, 'a stranger cannot read A''s hidden critiques');
  perform pg_temp.must((select count(*) from public.ritual_drafts where author_id = a) = 0, 'a stranger cannot read A''s ritual draft');

  perform pg_temp.must((select count(*) from public.story_vault where owner_id = a) = 0, 'a stranger cannot read A''s kept stories');
  perform pg_temp.must((select count(*) from public.ritual_vault where owner_id = a) = 0, 'a stranger cannot read A''s kept entries');

  perform pg_temp.be(null);
end $$;

select 'ALL PASS' as result;

rollback;
