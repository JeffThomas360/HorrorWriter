-- Behaviour test for 20261106000000_story_vault.sql. Rolls back; nothing is kept.
-- Success = final row 'ALL PASS'. Any failure raises 'FAIL: ...'.
-- Before merge: powershell -File scripts/sql/rehearse.ps1 -Test scripts/sql/test-story-vault.sql -Migration supabase/migrations/20261106000000_story_vault.sql
-- Uses throwaway users (…e3xx); local dev points at PRODUCTION, so only run it this way.
begin;

do $$ begin
  if to_regclass('public.story_vault') is null then raise exception 'FAIL: story_vault missing'; end if;
end $$;

-- ── Setup (as postgres) ────────────────────────────────────────────────────
insert into auth.users (id, email, aud, role, instance_id) values
  ('00000000-0000-4000-8000-00000000e301', 'story-vault-author@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-4000-8000-00000000e302', 'story-vault-critic@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-4000-8000-00000000e303', 'story-vault-other@example.test',  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');

insert into public.books (id, author_id, title, lede, content, created_at, updated_at) values
  ('00000000-0000-4000-8000-0000000c3001', '00000000-0000-4000-8000-00000000e301',
   'The Kept Story', 'A lede.', 'Once, a story for the vault test. “Curly quotes” and ünïcode.', now() - interval '3 days', now() - interval '2 days');
insert into public.series (id, author_id, title) values
  ('00000000-0000-4000-8000-0000000c3101', '00000000-0000-4000-8000-00000000e301', 'Vault Test Series');
insert into public.series_books (series_id, book_id, sort_order) values
  ('00000000-0000-4000-8000-0000000c3101', '00000000-0000-4000-8000-0000000c3001', 2);
insert into public.book_comments (id, book_id, author_id, content, created_at, updated_at, mod_status) values
  ('00000000-0000-4000-8000-0000000c3201', '00000000-0000-4000-8000-0000000c3001', '00000000-0000-4000-8000-00000000e302',
   'A live critique.', now() - interval '30 hours', now() - interval '30 hours', 'live'),
  ('00000000-0000-4000-8000-0000000c3202', '00000000-0000-4000-8000-0000000c3001', '00000000-0000-4000-8000-00000000e302',
   'A critique a moderator removed.', now() - interval '29 hours', now() - interval '29 hours', 'hidden');

select set_config('test.bundle', encode(convert_to(repeat('x', 100), 'UTF8'), 'base64'), true);

-- ── Not allowed: anon, and the internals ───────────────────────────────────
set local role anon;
do $$ begin
  begin perform public.story_vault_prepare('00000000-0000-4000-8000-0000000c3001');
    raise exception 'FAIL: anon called prepare';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000e303","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  begin perform public.story_vault_collect('00000000-0000-4000-8000-0000000c3001');
    raise exception 'FAIL: authenticated can call collect';
  exception when insufficient_privilege then null; end;
  begin perform public.story_vault_seal(1, gen_random_uuid(), '{}'::jsonb);
    raise exception 'FAIL: authenticated can call the seal helper (seal oracle)';
  exception when insufficient_privilege then null; end;
  -- Someone else's story is not found.
  begin perform public.story_vault_prepare('00000000-0000-4000-8000-0000000c3001');
    raise exception 'FAIL: another member prepared the story';
  exception when no_data_found then null; end;
end $$;
reset role;

-- ── Prepare + commit as the author ─────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000e301","role":"authenticated"}', true);
set local role authenticated;
do $$
declare v_prep jsonb; v_id uuid;
begin
  v_prep := public.story_vault_prepare('00000000-0000-4000-8000-0000000c3001');
  if jsonb_array_length(v_prep#>'{payload,comments}') <> 1 then
    raise exception 'FAIL: expected 1 comment (hidden excluded), got %', v_prep#>'{payload,comments}';
  end if;
  if jsonb_array_length(v_prep#>'{payload,series}') <> 1 then raise exception 'FAIL: series place not collected'; end if;

  -- A stale seal is refused and nothing changes.
  begin
    perform public.story_vault_commit('00000000-0000-4000-8000-0000000c3001', (v_prep->>'nonce')::uuid,
      (v_prep->>'key_version')::integer, 'not-the-seal', current_setting('test.bundle'));
    raise exception 'FAIL: commit accepted a wrong seal';
  exception when sqlstate 'HW033' then null; end;

  v_id := public.story_vault_commit('00000000-0000-4000-8000-0000000c3001', (v_prep->>'nonce')::uuid,
    (v_prep->>'key_version')::integer, v_prep->>'seal', current_setting('test.bundle'));
  -- The full decrypted payload the browser would send back on restore.
  perform set_config('test.payload', ((v_prep->'payload') || jsonb_build_object('seal', v_prep->>'seal'))::text, true);
  perform set_config('test.vault', v_id::text, true);
end $$;
reset role;

do $$ begin
  if exists (select 1 from public.books where id = '00000000-0000-4000-8000-0000000c3001') then raise exception 'FAIL: story still there after keep'; end if;
  if exists (select 1 from public.book_comments where book_id = '00000000-0000-4000-8000-0000000c3001') then raise exception 'FAIL: comments left behind'; end if;
  if exists (select 1 from public.series_books where book_id = '00000000-0000-4000-8000-0000000c3001') then raise exception 'FAIL: series place left behind'; end if;
end $$;

-- ── Others can't see or restore it ─────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000e303","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  if exists (select 1 from public.story_vault) then raise exception 'FAIL: another member can see the vault row'; end if;
  begin perform public.story_vault_restore(current_setting('test.vault')::uuid, current_setting('test.payload')::jsonb);
    raise exception 'FAIL: another member restored it';
  exception when no_data_found then null; end;
end $$;
reset role;

-- ── Restore as the author ──────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000e301","role":"authenticated"}', true);
set local role authenticated;
do $$
declare v_res jsonb; v_payload jsonb := current_setting('test.payload')::jsonb;
begin
  if (select count(*) from public.story_vault) <> 1 then raise exception 'FAIL: author cannot see their vault row'; end if;

  -- Edited text fails the seal.
  begin perform public.story_vault_restore(current_setting('test.vault')::uuid,
      jsonb_set(v_payload, '{story,content}', '"tampered"'));
    raise exception 'FAIL: tampered story restored';
  exception when sqlstate 'HW036' then null; end;
  -- A forged extra critique fails the seal.
  begin perform public.story_vault_restore(current_setting('test.vault')::uuid,
      jsonb_set(v_payload, '{comments}', (v_payload->'comments') || jsonb_build_array(jsonb_build_object(
        'id', gen_random_uuid(), 'author_id', '00000000-0000-4000-8000-00000000e303', 'content', 'forged',
        'mod_status', 'live', 'created_at', now(), 'updated_at', now()))));
    raise exception 'FAIL: forged critique restored';
  exception when sqlstate 'HW036' then null; end;

  -- Key order and whitespace don't matter: jsonb text is canonical.
  v_res := public.story_vault_restore(current_setting('test.vault')::uuid, (v_payload::text)::jsonb);
  if (v_res->>'critiques_restored')::int <> 1 then raise exception 'FAIL: restore result %', v_res; end if;
end $$;
reset role;

do $$
declare v_b public.books;
begin
  select * into v_b from public.books where id = '00000000-0000-4000-8000-0000000c3001';
  if v_b.id is null then raise exception 'FAIL: story not back'; end if;
  if v_b.content <> 'Once, a story for the vault test. “Curly quotes” and ünïcode.' or v_b.title <> 'The Kept Story' then
    raise exception 'FAIL: story text changed';
  end if;
  if v_b.author_id <> '00000000-0000-4000-8000-00000000e301' or v_b.mod_status <> 'live' then raise exception 'FAIL: author/status wrong'; end if;
  if v_b.comments_count <> 1 then raise exception 'FAIL: comments_count %', v_b.comments_count; end if;
  if not exists (select 1 from public.book_comments where id = '00000000-0000-4000-8000-0000000c3201') then raise exception 'FAIL: critique not back'; end if;
  if exists (select 1 from public.book_comments where id = '00000000-0000-4000-8000-0000000c3202') then raise exception 'FAIL: hidden critique came back'; end if;
  if not exists (select 1 from public.series_books where book_id = v_b.id and series_id = '00000000-0000-4000-8000-0000000c3101' and sort_order = 2) then
    raise exception 'FAIL: series place not back';
  end if;
  if exists (select 1 from public.story_vault where id = current_setting('test.vault')::uuid) then raise exception 'FAIL: vault row not removed'; end if;
end $$;

-- ── Delete forever is the plain RLS delete ─────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000e301","role":"authenticated"}', true);
set local role authenticated;
delete from public.books where id = '00000000-0000-4000-8000-0000000c3001';
reset role;
do $$ begin
  if exists (select 1 from public.books where id = '00000000-0000-4000-8000-0000000c3001') then raise exception 'FAIL: delete forever left the story'; end if;
end $$;

select 'ALL PASS' as result;
rollback;
