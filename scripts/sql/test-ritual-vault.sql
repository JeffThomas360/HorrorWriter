-- Behaviour test for 20261024000000_ritual_vault.sql. Rolls back; nothing is kept.
-- Success = final row 'ALL PASS'. Any failure raises 'FAIL: ...'.
-- Before merge: powershell -File scripts/sql/rehearse.ps1 -Test scripts/sql/test-ritual-vault.sql -Migration supabase/migrations/20261024000000_ritual_vault.sql
-- Uses throwaway users (…e2xx) and prompt (…f2xx); local dev points at PRODUCTION, so only run it this way.
begin;

do $$ begin
  if to_regclass('public.ritual_vault') is null then raise exception 'FAIL: ritual_vault missing'; end if;
end $$;

-- ── Setup (as postgres) ────────────────────────────────────────────────────
insert into auth.users (id, email, aud, role, instance_id) values
  ('00000000-0000-4000-8000-00000000e201', 'vault-author@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-4000-8000-00000000e202', 'vault-critic@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-4000-8000-00000000e203', 'vault-other@example.test',  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');

insert into public.ritual_prompts (id, body, status, goes_live_at, source) values
  ('00000000-0000-4000-8000-0000000f2001', 'A vault prompt, for testing only.', 'scheduled', now() - interval '3 days', 'keeper');
insert into public.threads (id, title, category_id, author_id, prompt_id) values
  ('00000000-0000-4000-8000-0000000d2001', 'A vault prompt, for testing only.', 'rituals', null, '00000000-0000-4000-8000-0000000f2001');
insert into public.posts (id, thread_id, author_id, content, created_at) values
  ('00000000-0000-4000-8000-0000000b2000', '00000000-0000-4000-8000-0000000d2001', null, 'A vault prompt, for testing only.', now() - interval '2 days');
-- The entry (A), a live critique (B), a hidden critique (B), a feedback message each way.
insert into public.posts (id, thread_id, author_id, title, content, created_at, updated_at) values
  ('00000000-0000-4000-8000-0000000b2001', '00000000-0000-4000-8000-0000000d2001', '00000000-0000-4000-8000-00000000e201',
   'The Entry', 'Once upon a midnight, an entry for the vault test.', now() - interval '36 hours', now() - interval '36 hours');
insert into public.posts (id, thread_id, author_id, parent_post_id, content, created_at, updated_at, mod_status) values
  ('00000000-0000-4000-8000-0000000b2002', '00000000-0000-4000-8000-0000000d2001', '00000000-0000-4000-8000-00000000e202',
   '00000000-0000-4000-8000-0000000b2001', 'A live critique.', now() - interval '30 hours', now() - interval '30 hours', 'live'),
  ('00000000-0000-4000-8000-0000000b2003', '00000000-0000-4000-8000-0000000d2001', '00000000-0000-4000-8000-00000000e202',
   '00000000-0000-4000-8000-0000000b2001', 'A critique a moderator removed.', now() - interval '29 hours', now() - interval '29 hours', 'hidden');
insert into public.ritual_feedback (id, post_id, sender_id, body, created_at) values
  ('00000000-0000-4000-8000-0000000a2001', '00000000-0000-4000-8000-0000000b2001', '00000000-0000-4000-8000-00000000e203', 'Mentor note.', now() - interval '20 hours'),
  ('00000000-0000-4000-8000-0000000a2002', '00000000-0000-4000-8000-0000000b2001', '00000000-0000-4000-8000-00000000e201', 'Author reply.', now() - interval '19 hours');

-- A bundle stand-in: the database never looks inside, only at size.
select set_config('test.bundle', encode(convert_to(repeat('x', 100), 'UTF8'), 'base64'), true);

-- ── Not allowed: anon, and the internals ───────────────────────────────────
set local role anon;
do $$ begin
  begin perform public.ritual_vault_prepare('00000000-0000-4000-8000-0000000b2001');
    raise exception 'FAIL: anon called prepare';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000e201","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  begin perform public.ritual_vault_hmac(1, '["x"]'::jsonb);
    raise exception 'FAIL: authenticated can call the HMAC helper (seal oracle)';
  exception when insufficient_privilege then null; end;
  begin perform public.ritual_vault_collect('00000000-0000-4000-8000-0000000b2001', gen_random_uuid(), 1);
    raise exception 'FAIL: authenticated can call collect';
  exception when insufficient_privilege then null; end;
  begin perform count(*) from public.ritual_vault_keys;
    raise exception 'FAIL: authenticated can read the seal keys';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- ── Someone else's entry: not found ────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000e202","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  begin perform public.ritual_vault_prepare('00000000-0000-4000-8000-0000000b2001');
    raise exception 'FAIL: a non-author prepared someone else''s entry';
  exception when sqlstate 'P0002' then null; end;
end $$;
reset role;

-- ── Prepare as the author ──────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000e201","role":"authenticated"}', true);
set local role authenticated;
select set_config('test.prep', public.ritual_vault_prepare('00000000-0000-4000-8000-0000000b2001')::text, true);
do $$
declare p jsonb := current_setting('test.prep')::jsonb;
begin
  if jsonb_array_length(p->'posts') <> 1 then raise exception 'FAIL: prepare collected % critiques, want 1 (hidden one excluded)', jsonb_array_length(p->'posts'); end if;
  if jsonb_array_length(p->'feedback') <> 2 then raise exception 'FAIL: prepare collected % feedback rows, want 2', jsonb_array_length(p->'feedback'); end if;
  -- entry + 1 critique + 2 feedback
  if (select count(*) from jsonb_object_keys(p->'seals')) <> 4 then raise exception 'FAIL: expected 4 seals, got %', p->'seals'; end if;
  if p#>>'{seals,00000000-0000-4000-8000-0000000b2003}' is not null then raise exception 'FAIL: the hidden critique was sealed'; end if;
  if (p->>'snapshot') is null or (p->>'nonce') is null then raise exception 'FAIL: no snapshot/nonce'; end if;
end $$;

-- Commit with a stale snapshot, a short bundle, and a bad bundle.
do $$
declare p jsonb := current_setting('test.prep')::jsonb;
begin
  begin perform public.ritual_vault_commit('00000000-0000-4000-8000-0000000b2001', (p->>'nonce')::uuid, 1, 'deadbeef', current_setting('test.bundle'));
    raise exception 'FAIL: commit accepted a wrong snapshot';
  exception when sqlstate 'HW033' then null; end;
  begin perform public.ritual_vault_commit('00000000-0000-4000-8000-0000000b2001', (p->>'nonce')::uuid, 1, p->>'snapshot', encode('short'::bytea, 'base64'));
    raise exception 'FAIL: commit accepted a too-small bundle';
  exception when sqlstate 'HW032' then null; end;
  begin perform public.ritual_vault_commit('00000000-0000-4000-8000-0000000b2001', (p->>'nonce')::uuid, 1, p->>'snapshot', '!!not base64!!');
    raise exception 'FAIL: commit accepted a non-base64 bundle';
  exception when sqlstate 'HW032' then null; end;
end $$;
reset role;

-- A critique arriving between prepare and commit must make commit refuse.
-- Setup writes run as nobody: with the author's claims still set, guard triggers would act as them.
select set_config('request.jwt.claims', '', true);
insert into public.posts (id, thread_id, author_id, parent_post_id, content) values
  ('00000000-0000-4000-8000-0000000b2004', '00000000-0000-4000-8000-0000000d2001', '00000000-0000-4000-8000-00000000e202',
   '00000000-0000-4000-8000-0000000b2001', 'Arrived too late.');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000e201","role":"authenticated"}', true);
set local role authenticated;
do $$
declare p jsonb := current_setting('test.prep')::jsonb;
begin
  begin perform public.ritual_vault_commit('00000000-0000-4000-8000-0000000b2001', (p->>'nonce')::uuid, 1, p->>'snapshot', current_setting('test.bundle'));
    raise exception 'FAIL: commit ignored a critique added after prepare';
  exception when sqlstate 'HW033' then null; end;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);
delete from public.posts where id = '00000000-0000-4000-8000-0000000b2004';

-- Prepare again (the snapshot is for the current rows), then commit for real.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000e201","role":"authenticated"}', true);
set local role authenticated;
select set_config('test.prep', public.ritual_vault_prepare('00000000-0000-4000-8000-0000000b2001')::text, true);
select set_config('test.vault1', public.ritual_vault_commit('00000000-0000-4000-8000-0000000b2001',
  (current_setting('test.prep')::jsonb->>'nonce')::uuid, 1, current_setting('test.prep')::jsonb->>'snapshot', current_setting('test.bundle'))::text, true);
reset role;

do $$ begin
  if exists (select 1 from public.posts where id in ('00000000-0000-4000-8000-0000000b2001','00000000-0000-4000-8000-0000000b2002','00000000-0000-4000-8000-0000000b2003')) then
    raise exception 'FAIL: entry or critiques still present after commit'; end if;
  if exists (select 1 from public.ritual_feedback where post_id = '00000000-0000-4000-8000-0000000b2001') then
    raise exception 'FAIL: feedback still present after commit'; end if;
  if exists (select 1 from public.threads where id = '00000000-0000-4000-8000-0000000d2001') then
    raise exception 'FAIL: the emptied thread was not removed'; end if;
  if not exists (select 1 from public.ritual_vault where id = current_setting('test.vault1')::uuid) then
    raise exception 'FAIL: no vault row'; end if;
end $$;

-- ── The vault is private ───────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000e202","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  if exists (select 1 from public.ritual_vault) then raise exception 'FAIL: another user can see the vault row'; end if;
  begin perform public.ritual_vault_restore(current_setting('test.vault1')::uuid, '{}'::jsonb);
    raise exception 'FAIL: another user restored the vault';
  exception when sqlstate 'P0002' then null; end;
end $$;
reset role;

-- Build the payload the way buildVaultPayload() does.
create or replace function pg_temp.mk_payload(p jsonb) returns jsonb language sql as $f$
  select jsonb_build_object(
    'v', 1, 'kind', 'ritual-entry',
    'thread', jsonb_build_object('prompt_id', p#>>'{thread,prompt_id}'),
    'entry', (p->'entry') - 'id' - 'profiles'
             || jsonb_build_object('key', p#>>'{entry,id}', 'parent_key', null, 'seal', p->'seals'->(p#>>'{entry,id}')),
    'critiques', coalesce((select jsonb_agg(c - 'id' - 'profiles' - 'parent_post_id'
             || jsonb_build_object('key', c->>'id', 'parent_key', c->>'parent_post_id', 'seal', p->'seals'->(c->>'id')))
             from jsonb_array_elements(p->'posts') c), '[]'::jsonb),
    'feedback', coalesce((select jsonb_agg((f - 'id' - 'post_id' - 'profiles')
             || jsonb_build_object('key', f->>'id', 'seal', p->'seals'->(f->>'id')))
             from jsonb_array_elements(p->'feedback') f), '[]'::jsonb),
    'revision', case when p->'revision' = 'null'::jsonb then null
                else (p->'revision') - 'post_id' || jsonb_build_object('seal', p->'seals'->'revision') end)
$f$;
select set_config('test.payload', pg_temp.mk_payload(current_setting('test.prep')::jsonb)::text, true);

-- ── Forgeries are refused ──────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000e201","role":"authenticated"}', true);
set local role authenticated;
do $$
declare pl jsonb := current_setting('test.payload')::jsonb; v uuid := current_setting('test.vault1')::uuid; bad jsonb;
begin
  -- an edited critique
  bad := jsonb_set(pl, '{critiques,0,content}', '"Words they never wrote."');
  begin perform public.ritual_vault_restore(v, bad); raise exception 'FAIL: edited critique restored';
  exception when sqlstate 'HW036' then null; end;
  -- an edited entry
  bad := jsonb_set(pl, '{entry,content}', '"Rewritten."');
  begin perform public.ritual_vault_restore(v, bad); raise exception 'FAIL: edited entry restored';
  exception when sqlstate 'HW036' then null; end;
  -- an invented critique (valid-looking, no valid seal)
  bad := jsonb_set(pl, '{critiques}', (pl->'critiques') || jsonb_build_array(jsonb_build_object(
    'key', gen_random_uuid(), 'parent_key', pl#>>'{entry,key}', 'author_id', '00000000-0000-4000-8000-00000000e202',
    'content', 'Invented.', 'created_at', now(), 'updated_at', now(), 'edited_at', null, 'mod_status', 'live', 'seal', 'abc')));
  begin perform public.ritual_vault_restore(v, bad); raise exception 'FAIL: invented critique restored';
  exception when sqlstate 'HW036' then null; end;
  -- a real critique re-added under a new key, reusing its old seal
  bad := jsonb_set(pl, '{critiques}', (pl->'critiques') || jsonb_build_array(jsonb_set(pl#>'{critiques,0}', '{key}', to_jsonb(gen_random_uuid()::text))));
  begin perform public.ritual_vault_restore(v, bad); raise exception 'FAIL: re-keyed critique restored';
  exception when sqlstate 'HW036' then null; end;
  -- garbage
  begin perform public.ritual_vault_restore(v, '{"v":1}'::jsonb); raise exception 'FAIL: junk payload restored';
  exception when sqlstate 'HW035' then null; end;
  begin perform public.ritual_vault_restore(v, jsonb_set(pl, '{entry,created_at}', '"not a date"')); raise exception 'FAIL: bad date restored';
  exception when sqlstate 'HW035' then null; end;
  -- someone else's entry
  bad := jsonb_set(pl, '{entry,author_id}', '"00000000-0000-4000-8000-00000000e202"');
  begin perform public.ritual_vault_restore(v, bad); raise exception 'FAIL: entry claimed for another author';
  exception when sqlstate 'HW035' then null; end;
end $$;
reset role;
do $$ begin
  if exists (select 1 from public.posts where id = '00000000-0000-4000-8000-0000000b2001') then
    raise exception 'FAIL: a refused restore left rows behind'; end if;
  if not exists (select 1 from public.ritual_vault where id = current_setting('test.vault1')::uuid) then
    raise exception 'FAIL: a refused restore consumed the vault'; end if;
end $$;

-- ── A sanctioned author waits ──────────────────────────────────────────────
-- Clear the claims so auth.uid() is null: the escalation trigger refuses a user changing their own sanctions.
select set_config('request.jwt.claims', '', true);
update public.profiles set banned_until = now() + interval '1 day' where id = '00000000-0000-4000-8000-00000000e201';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000e201","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  begin perform public.ritual_vault_restore(current_setting('test.vault1')::uuid, current_setting('test.payload')::jsonb);
    raise exception 'FAIL: a sanctioned author restored';
  exception when sqlstate 'HW034' then null; end;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);
update public.profiles set banned_until = null where id = '00000000-0000-4000-8000-00000000e201';

-- One critic's account is gone by restore time.
-- (kept separate: delete a throwaway profile only after its critique is in the vault)
-- ── Restore ────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000e201","role":"authenticated"}', true);
set local role authenticated;
select set_config('test.result', public.ritual_vault_restore(current_setting('test.vault1')::uuid, current_setting('test.payload')::jsonb)::text, true);
reset role;
do $$
declare r jsonb := current_setting('test.result')::jsonb;
begin
  if (r->>'critiques_restored')::int <> 1 or (r->>'critiques_skipped')::int <> 0 then raise exception 'FAIL: restore counts %', r; end if;
  if not exists (select 1 from public.posts where id = '00000000-0000-4000-8000-0000000b2001' and restored_at is not null
                 and title = 'The Entry' and mod_status = 'live' and author_id = '00000000-0000-4000-8000-00000000e201') then
    raise exception 'FAIL: entry not back, or not marked'; end if;
  -- now() is fixed for the transaction, so the original 30-hour-old date must come back exactly.
  if not exists (select 1 from public.posts where id = '00000000-0000-4000-8000-0000000b2002'
                 and parent_post_id = '00000000-0000-4000-8000-0000000b2001' and content = 'A live critique.'
                 and created_at = now() - interval '30 hours') then
    raise exception 'FAIL: critique not back in place'; end if;
  if exists (select 1 from public.posts where id = '00000000-0000-4000-8000-0000000b2003') then raise exception 'FAIL: the hidden critique came back'; end if;
  if (select count(*) from public.ritual_feedback where post_id = '00000000-0000-4000-8000-0000000b2001') <> 2 then raise exception 'FAIL: feedback not back'; end if;
  -- replies_count = every live post but the opening one: the entry + its critique.
  if not exists (select 1 from public.threads where id = (r->>'thread_id')::uuid and prompt_id = '00000000-0000-4000-8000-0000000f2001' and replies_count = 2) then
    raise exception 'FAIL: thread not recreated for the prompt, or wrong count'; end if;
  if exists (select 1 from public.ritual_vault where id = current_setting('test.vault1')::uuid) then raise exception 'FAIL: vault row not consumed'; end if;
end $$;

-- ── Round two: a hidden entry under revision comes back hidden, with its conversation ──
-- The mentor sends it for revision the real way (hides it, opens the revision, adds a note).
-- mod_status guards refuse anyone without 'hide', so the throwaway mentor gets the smallest role that has it.
select set_config('request.jwt.claims', '', true);
update public.profiles set mod_role = 'sentinel', mod_scope = 'forum' where id = '00000000-0000-4000-8000-00000000e203';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000e203","role":"authenticated"}', true);
set local role authenticated;
select public.ritual_start_revision('00000000-0000-4000-8000-0000000b2001', 'Mentor: please revise.');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000e201","role":"authenticated"}', true);
set local role authenticated;
select set_config('test.prep', public.ritual_vault_prepare('00000000-0000-4000-8000-0000000b2001')::text, true);
select set_config('test.vault2', public.ritual_vault_commit('00000000-0000-4000-8000-0000000b2001',
  (current_setting('test.prep')::jsonb->>'nonce')::uuid, 1, current_setting('test.prep')::jsonb->>'snapshot', current_setting('test.bundle'))::text, true);
reset role;
-- A payload from the FIRST vault must not open the second (nonce binding).
do $$ begin
  if exists (select 1 from public.posts where id = '00000000-0000-4000-8000-0000000b2001') then raise exception 'FAIL: hidden entry survived commit'; end if;
end $$;
-- The critic's account disappears while the piece is in the vault.
select set_config('request.jwt.claims', '', true);
delete from public.profiles where id = '00000000-0000-4000-8000-00000000e202';
select set_config('test.payload2', pg_temp.mk_payload(current_setting('test.prep')::jsonb)::text, true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000e201","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  begin perform public.ritual_vault_restore(current_setting('test.vault2')::uuid, current_setting('test.payload')::jsonb);
    raise exception 'FAIL: an old payload opened a different vault row';
  exception when sqlstate 'HW036' then null; end;
end $$;
select set_config('test.result', public.ritual_vault_restore(current_setting('test.vault2')::uuid, current_setting('test.payload2')::jsonb)::text, true);
reset role;
do $$
declare r jsonb := current_setting('test.result')::jsonb;
begin
  if (r->>'critiques_skipped')::int <> 1 or (r->>'critiques_restored')::int <> 0 then raise exception 'FAIL: expected the orphaned critique skipped, got %', r; end if;
  if not exists (select 1 from public.posts where id = '00000000-0000-4000-8000-0000000b2001' and mod_status = 'hidden') then
    raise exception 'FAIL: hidden entry did not come back hidden'; end if;
  if not exists (select 1 from public.ritual_revisions where post_id = '00000000-0000-4000-8000-0000000b2001' and resolved_at is null) then
    raise exception 'FAIL: revision not back open'; end if;
  -- the two from round one + the revision note
  if (select count(*) from public.ritual_feedback where post_id = '00000000-0000-4000-8000-0000000b2001') <> 3 then
    raise exception 'FAIL: conversation not back'; end if;
end $$;

-- ── Deleting from the vault is the owner's call ────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000e201","role":"authenticated"}', true);
set local role authenticated;
select set_config('test.prep', public.ritual_vault_prepare('00000000-0000-4000-8000-0000000b2001')::text, true);
select set_config('test.vault3', public.ritual_vault_commit('00000000-0000-4000-8000-0000000b2001',
  (current_setting('test.prep')::jsonb->>'nonce')::uuid, 1, current_setting('test.prep')::jsonb->>'snapshot', current_setting('test.bundle'))::text, true);
delete from public.ritual_vault where id = current_setting('test.vault3')::uuid;
do $$ begin
  if exists (select 1 from public.ritual_vault where id = current_setting('test.vault3')::uuid) then raise exception 'FAIL: owner could not delete a vault row'; end if;
end $$;
reset role;

select 'ALL PASS' as result;
rollback;
