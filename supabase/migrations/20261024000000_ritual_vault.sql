-- Midnight Ritual "Keep it" vault.
--
-- Instead of deleting an entry for good, an author can lock it (and its critiques, its private
-- mentor conversation and its revision state) in a bundle encrypted IN THE BROWSER with their
-- recovery code (src/lib/seal.js). The database only ever stores ciphertext: nobody, including
-- us, can read a bundle without the code. Design: the Obsidian note rituals-vault.md.
--
-- Flow (three RPCs, all authenticated, all bound to auth.uid()):
--   1. ritual_vault_prepare(post)  -> the rows to keep + a server HMAC seal on each + a nonce
--                                     and a snapshot digest. Changes nothing.
--   2. (browser builds the payload, encrypts it with the recovery code)
--   3. ritual_vault_commit(post, nonce, key_version, snapshot, bundle)
--                                  -> locks the entry, re-reads, refuses if anything changed
--                                     since step 1, stores the bundle, deletes the entry
--                                     (critiques, feedback, revision cascade; an emptied
--                                     thread goes with it).
--   4. ritual_vault_restore(vault, payload) -> the browser decrypts and sends the payload back.
--                                     Every seal is re-checked BEFORE anything is re-inserted, so
--                                     a forged or edited entry/critique/message fails the whole
--                                     restore. Re-checks sanctions; a hidden entry comes back
--                                     hidden, with its revision and conversation.
--
-- Seals: HMAC-SHA256 with a server-only key over (kind, nonce, id, author, prompt, parent, text,
-- dates, mod_status). The nonce is per vault row, so a payload cannot be replayed into a
-- different vault row. Keys live in ritual_vault_keys (no grants, no policies: only the
-- SECURITY DEFINER functions below can read it), versioned so a rotation never breaks old
-- vaults. The key is generated here, inside the database, and no one ever sees it.
-- A leaked key would allow forging seals, never decrypting a bundle.
--
-- Moderation-removed ('hidden') critiques are never collected (already read and judged).

alter table public.posts add column if not exists restored_at timestamptz;

-- ── Server seal keys ──────────────────────────────────────────────────────
create table public.ritual_vault_keys (
  version    integer primary key,
  secret     bytea not null check (octet_length(secret) >= 32),
  created_at timestamptz not null default now()
);
alter table public.ritual_vault_keys enable row level security;
revoke all on public.ritual_vault_keys from anon, authenticated;
insert into public.ritual_vault_keys (version, secret) values (1, extensions.gen_random_bytes(32));

-- ── The vault ─────────────────────────────────────────────────────────────
create table public.ritual_vault (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  prompt_id   uuid not null,
  entry_id    uuid not null unique,
  nonce       uuid not null unique,
  key_version integer not null references public.ritual_vault_keys(version),
  -- version(1) + salt(16) + iv(12) + tag(16) is the smallest possible sealWriting() bundle.
  bundle      bytea not null check (octet_length(bundle) between 45 and 2097152),
  created_at  timestamptz not null default now()
);
create index ritual_vault_owner_idx on public.ritual_vault (owner_id, created_at);

alter table public.ritual_vault enable row level security;
revoke all on public.ritual_vault from anon, authenticated;
grant select, delete on public.ritual_vault to authenticated;
-- Writes only through the RPCs. Deleting from the vault is the owner's own call.
create policy ritual_vault_select on public.ritual_vault for select to authenticated
  using (owner_id = (select auth.uid()));
create policy ritual_vault_delete on public.ritual_vault for delete to authenticated
  using (owner_id = (select auth.uid()));

-- ── Internal helpers (nobody but the SECURITY DEFINER functions may call these) ──
create or replace function public.ritual_vault_us(p_ts timestamptz)
returns bigint language sql immutable set search_path = '' as $$
  select round(extract(epoch from p_ts) * 1000000)::bigint
$$;

create or replace function public.ritual_vault_hmac(p_version integer, p_parts jsonb)
returns text language plpgsql stable set search_path = '' as $$
declare v_secret bytea;
begin
  select secret into v_secret from public.ritual_vault_keys where version = p_version;
  if v_secret is null then raise exception 'no_vault_key' using errcode = 'HW030'; end if;
  return encode(extensions.hmac(convert_to(p_parts::text, 'UTF8'), v_secret, 'sha256'), 'hex');
end $$;

-- An entry (parent null, title set) or a critique (title null).
create or replace function public.ritual_vault_seal_post(
  p_version integer, p_kind text, p_nonce uuid, p_id uuid, p_author uuid, p_prompt uuid,
  p_parent uuid, p_title text, p_content text,
  p_created timestamptz, p_updated timestamptz, p_edited timestamptz, p_status text
) returns text language sql stable set search_path = '' as $$
  select public.ritual_vault_hmac(p_version, jsonb_build_array(
    p_kind, p_nonce, p_id, p_author, p_prompt, p_parent, p_title, p_content,
    public.ritual_vault_us(p_created), public.ritual_vault_us(p_updated),
    public.ritual_vault_us(p_edited), p_status))
$$;

create or replace function public.ritual_vault_seal_feedback(
  p_version integer, p_nonce uuid, p_id uuid, p_post uuid, p_sender uuid, p_body text, p_created timestamptz
) returns text language sql stable set search_path = '' as $$
  select public.ritual_vault_hmac(p_version, jsonb_build_array(
    'feedback', p_nonce, p_id, p_post, p_sender, p_body, public.ritual_vault_us(p_created)))
$$;

create or replace function public.ritual_vault_seal_revision(
  p_version integer, p_nonce uuid, p_post uuid, p_started_by uuid,
  p_started timestamptz, p_ready timestamptz, p_resolved timestamptz
) returns text language sql stable set search_path = '' as $$
  select public.ritual_vault_hmac(p_version, jsonb_build_array(
    'revision', p_nonce, p_post, p_started_by,
    public.ritual_vault_us(p_started), public.ritual_vault_us(p_ready), public.ritual_vault_us(p_resolved)))
$$;

-- Reads everything that goes into a vault bundle and seals it. Shapes match what
-- buildVaultPayload() in src/lib/ritualVault.js takes (entry, posts, feedback, revision, seals).
-- Seals are keyed by row id; the revision seal is under "revision".
create or replace function public.ritual_vault_collect(p_post_id uuid, p_nonce uuid, p_version integer)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  v_entry public.posts;
  v_thread public.threads;
  v_rev public.ritual_revisions;
  v_critiques jsonb;
  v_feedback jsonb;
  v_seals jsonb;
  v_rev_json jsonb := null;
begin
  select * into v_entry from public.posts where id = p_post_id;
  select * into v_thread from public.threads where id = v_entry.thread_id;
  select * into v_rev from public.ritual_revisions where post_id = p_post_id;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'author_id', c.author_id, 'parent_post_id', c.parent_post_id,
      'content', c.content, 'created_at', c.created_at, 'updated_at', c.updated_at,
      'edited_at', c.edited_at, 'mod_status', c.mod_status,
      'profiles', jsonb_build_object('handle', pr.handle)
    ) order by c.created_at, c.id), '[]'::jsonb)
  into v_critiques
  from public.posts c left join public.profiles pr on pr.id = c.author_id
  where c.parent_post_id = p_post_id and c.mod_status <> 'hidden';

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', f.id, 'post_id', f.post_id, 'sender_id', f.sender_id, 'body', f.body,
      'created_at', f.created_at, 'profiles', jsonb_build_object('handle', pr.handle)
    ) order by f.created_at, f.id), '[]'::jsonb)
  into v_feedback
  from public.ritual_feedback f left join public.profiles pr on pr.id = f.sender_id
  where f.post_id = p_post_id;

  v_seals := jsonb_build_object(p_post_id::text, public.ritual_vault_seal_post(
    p_version, 'entry', p_nonce, v_entry.id, v_entry.author_id, v_thread.prompt_id, null,
    v_entry.title, v_entry.content, v_entry.created_at, v_entry.updated_at, v_entry.edited_at,
    v_entry.mod_status));

  v_seals := v_seals || coalesce((
    select jsonb_object_agg(c.id::text, public.ritual_vault_seal_post(
      p_version, 'critique', p_nonce, c.id, c.author_id, v_thread.prompt_id, c.parent_post_id,
      null, c.content, c.created_at, c.updated_at, c.edited_at, c.mod_status))
    from public.posts c where c.parent_post_id = p_post_id and c.mod_status <> 'hidden'
  ), '{}'::jsonb);

  v_seals := v_seals || coalesce((
    select jsonb_object_agg(f.id::text, public.ritual_vault_seal_feedback(
      p_version, p_nonce, f.id, f.post_id, f.sender_id, f.body, f.created_at))
    from public.ritual_feedback f where f.post_id = p_post_id
  ), '{}'::jsonb);

  if v_rev.post_id is not null then
    v_rev_json := jsonb_build_object('post_id', v_rev.post_id, 'started_by', v_rev.started_by,
      'started_at', v_rev.started_at, 'ready_at', v_rev.ready_at, 'resolved_at', v_rev.resolved_at);
    v_seals := v_seals || jsonb_build_object('revision', public.ritual_vault_seal_revision(
      p_version, p_nonce, v_rev.post_id, v_rev.started_by, v_rev.started_at, v_rev.ready_at, v_rev.resolved_at));
  end if;

  return jsonb_build_object(
    'nonce', p_nonce,
    'key_version', p_version,
    -- Commit recomputes this under a row lock; any change since prepare makes it differ.
    'snapshot', public.ritual_vault_hmac(p_version, jsonb_build_array('snapshot', p_nonce, v_seals)),
    'thread', jsonb_build_object('prompt_id', v_thread.prompt_id, 'title', v_thread.title,
                                 'created_at', v_thread.created_at),
    'entry', jsonb_build_object(
      'id', v_entry.id, 'author_id', v_entry.author_id, 'title', v_entry.title,
      'content', v_entry.content, 'created_at', v_entry.created_at, 'updated_at', v_entry.updated_at,
      'edited_at', v_entry.edited_at, 'mod_status', v_entry.mod_status,
      'profiles', jsonb_build_object('handle', (select handle from public.profiles where id = v_entry.author_id))),
    'posts', v_critiques,
    'feedback', v_feedback,
    'revision', v_rev_json,
    'seals', v_seals);
end $$;

revoke all on function public.ritual_vault_us(timestamptz) from public, anon, authenticated;
revoke all on function public.ritual_vault_hmac(integer, jsonb) from public, anon, authenticated;
revoke all on function public.ritual_vault_seal_post(integer, text, uuid, uuid, uuid, uuid, uuid, text, text, timestamptz, timestamptz, timestamptz, text) from public, anon, authenticated;
revoke all on function public.ritual_vault_seal_feedback(integer, uuid, uuid, uuid, uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.ritual_vault_seal_revision(integer, uuid, uuid, uuid, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.ritual_vault_collect(uuid, uuid, integer) from public, anon, authenticated;

-- ── 1. Prepare ────────────────────────────────────────────────────────────
-- Allowed for any entry of the caller's, including a hidden / under-revision one: the writing
-- is never lost. Creates nothing.
create or replace function public.ritual_vault_prepare(p_post_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_version integer;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  perform 1
  from public.posts p join public.threads t on t.id = p.thread_id
  where p.id = p_post_id and p.author_id = v_uid and p.parent_post_id is null
    and t.category_id = 'rituals' and t.prompt_id is not null;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select max(version) into v_version from public.ritual_vault_keys;
  return public.ritual_vault_collect(p_post_id, gen_random_uuid(), v_version);
end $$;

-- ── 2. Commit ─────────────────────────────────────────────────────────────
create or replace function public.ritual_vault_commit(
  p_post_id uuid, p_nonce uuid, p_key_version integer, p_snapshot text, p_bundle text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_post public.posts;
  v_thread public.threads;
  v_bundle bytea;
  v_id uuid;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  -- Lock the entry first: a critique being added right now holds a key-share lock on it, so we
  -- either wait for that insert to land (and then see it) or it waits for us (and then fails).
  select p.* into v_post
  from public.posts p join public.threads t on t.id = p.thread_id
  where p.id = p_post_id and p.author_id = v_uid and p.parent_post_id is null
    and t.category_id = 'rituals' and t.prompt_id is not null
  for update of p;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into v_thread from public.threads where id = v_post.thread_id;

  if (select count(*) from public.ritual_vault where owner_id = v_uid) >= 50 then
    raise exception 'vault_full' using errcode = 'HW031';
  end if;
  begin
    v_bundle := decode(coalesce(p_bundle, ''), 'base64');
  exception when others then
    raise exception 'bad_bundle' using errcode = 'HW032';
  end;
  if octet_length(v_bundle) not between 45 and 2097152 then
    raise exception 'bad_bundle' using errcode = 'HW032';
  end if;
  if public.ritual_vault_collect(p_post_id, p_nonce, p_key_version)->>'snapshot' is distinct from p_snapshot then
    raise exception 'changed_since_prepare' using errcode = 'HW033';
  end if;

  insert into public.ritual_vault (owner_id, prompt_id, entry_id, nonce, key_version, bundle)
  values (v_uid, v_thread.prompt_id, p_post_id, p_nonce, p_key_version, v_bundle)
  returning id into v_id;

  -- Same as "Delete forever" from here: cascades take the critiques, feedback and revision;
  -- on_ritual_entry_deleted removes the thread if this was its last entry.
  delete from public.posts where id = p_post_id;
  update public.threads
  set replies_count = greatest((select count(*) from public.posts
                                where thread_id = v_post.thread_id and mod_status = 'live') - 1, 0)
  where id = v_post.thread_id;
  return v_id;
end $$;

-- ── 3. Restore ────────────────────────────────────────────────────────────
-- p_payload is the decrypted bundle (buildVaultPayload() shape). Nothing in it is trusted
-- without its seal; the seals are checked against the vault row's own nonce and key version.
create or replace function public.ritual_vault_restore(p_vault_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_vault public.ritual_vault;
  v_prompt public.ritual_prompts;
  v_e jsonb;
  v_rev jsonb;
  v_item jsonb;
  v_thread uuid;
  v_created timestamptz;
  v_opening timestamptz;
  v_author uuid;
  v_restored integer := 0;
  v_skipped integer := 0;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  select * into v_vault from public.ritual_vault where id = p_vault_id and owner_id = v_uid for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  -- A sanctioned author waits; the vault stays intact.
  if public.is_banned(v_uid) then raise exception 'sanctioned' using errcode = 'HW034'; end if;

  begin
    v_e := p_payload->'entry';
    v_rev := p_payload->'revision';
    if jsonb_typeof(p_payload) is distinct from 'object'
       or (p_payload->>'v') is distinct from '1'
       or (p_payload->>'kind') is distinct from 'ritual-entry'
       or jsonb_typeof(v_e) is distinct from 'object'
       or jsonb_typeof(coalesce(p_payload->'critiques', '[]'::jsonb)) is distinct from 'array'
       or jsonb_typeof(coalesce(p_payload->'feedback', '[]'::jsonb)) is distinct from 'array'
       or jsonb_array_length(coalesce(p_payload->'critiques', '[]'::jsonb)) > 1000
       or jsonb_array_length(coalesce(p_payload->'feedback', '[]'::jsonb)) > 1000
       or (p_payload#>>'{thread,prompt_id}')::uuid is distinct from v_vault.prompt_id
       or (v_e->>'key')::uuid is distinct from v_vault.entry_id
       or (v_e->>'author_id')::uuid is distinct from v_uid then
      raise exception 'bad_payload' using errcode = 'HW035';
    end if;

    -- 1. Verify every seal before touching anything.
    v_created := (v_e->>'created_at')::timestamptz;
    if (v_e->>'seal') is distinct from public.ritual_vault_seal_post(
         v_vault.key_version, 'entry', v_vault.nonce, v_vault.entry_id, v_uid, v_vault.prompt_id, null,
         v_e->>'title', v_e->>'content', v_created, (v_e->>'updated_at')::timestamptz,
         (v_e->>'edited_at')::timestamptz, v_e->>'mod_status') then
      raise exception 'seal_invalid' using errcode = 'HW036';
    end if;

    for v_item in select value from jsonb_array_elements(coalesce(p_payload->'critiques', '[]'::jsonb)) loop
      if (v_item->>'parent_key')::uuid is distinct from v_vault.entry_id
         or (v_item->>'seal') is distinct from public.ritual_vault_seal_post(
              v_vault.key_version, 'critique', v_vault.nonce, (v_item->>'key')::uuid,
              (v_item->>'author_id')::uuid, v_vault.prompt_id, v_vault.entry_id, null,
              v_item->>'content', (v_item->>'created_at')::timestamptz,
              (v_item->>'updated_at')::timestamptz, (v_item->>'edited_at')::timestamptz,
              v_item->>'mod_status') then
        raise exception 'seal_invalid' using errcode = 'HW036';
      end if;
    end loop;

    for v_item in select value from jsonb_array_elements(coalesce(p_payload->'feedback', '[]'::jsonb)) loop
      if (v_item->>'seal') is distinct from public.ritual_vault_seal_feedback(
           v_vault.key_version, v_vault.nonce, (v_item->>'key')::uuid, v_vault.entry_id,
           (v_item->>'sender_id')::uuid, v_item->>'body', (v_item->>'created_at')::timestamptz) then
        raise exception 'seal_invalid' using errcode = 'HW036';
      end if;
    end loop;

    if jsonb_typeof(v_rev) = 'object' and (v_rev->>'seal') is distinct from public.ritual_vault_seal_revision(
         v_vault.key_version, v_vault.nonce, v_vault.entry_id, (v_rev->>'started_by')::uuid,
         (v_rev->>'started_at')::timestamptz, (v_rev->>'ready_at')::timestamptz,
         (v_rev->>'resolved_at')::timestamptz) then
      raise exception 'seal_invalid' using errcode = 'HW036';
    end if;

    -- 2. Re-check the world.
    select * into v_prompt from public.ritual_prompts where id = v_vault.prompt_id;
    if not found then raise exception 'prompt_gone' using errcode = 'HW038'; end if;
    if exists (select 1 from public.posts where id = v_vault.entry_id) then
      raise exception 'already_exists' using errcode = 'HW037';
    end if;

    -- 3. Put it back. The thread is keyed to the prompt: recreate it if it went with the last entry.
    v_opening := v_created - interval '1 second';
    insert into public.threads (title, category_id, author_id, prompt_id, created_at)
    values (left(v_prompt.body, 200), 'rituals', null, v_vault.prompt_id, v_opening)
    on conflict (prompt_id) where prompt_id is not null do nothing
    returning id into v_thread;
    if v_thread is null then
      select id into v_thread from public.threads where prompt_id = v_vault.prompt_id;
    else
      insert into public.posts (thread_id, author_id, content, created_at)
      values (v_thread, null, v_prompt.body, v_opening);
    end if;

    -- mod_status goes back exactly as sealed: a hidden entry returns hidden, never public.
    insert into public.posts (id, thread_id, author_id, title, content, created_at, updated_at,
                              edited_at, mod_status, restored_at)
    values (v_vault.entry_id, v_thread, v_uid, v_e->>'title', v_e->>'content', v_created,
            (v_e->>'updated_at')::timestamptz, (v_e->>'edited_at')::timestamptz,
            v_e->>'mod_status', now());

    for v_item in select value from jsonb_array_elements(coalesce(p_payload->'critiques', '[]'::jsonb)) loop
      v_author := (v_item->>'author_id')::uuid;
      -- A critic whose account is gone cannot be re-attached; their critique is not restored.
      if v_author is null or not exists (select 1 from public.profiles where id = v_author) then
        v_skipped := v_skipped + 1;
        continue;
      end if;
      insert into public.posts (id, thread_id, author_id, parent_post_id, content, created_at,
                                updated_at, edited_at, mod_status)
      values ((v_item->>'key')::uuid, v_thread, v_author, v_vault.entry_id, v_item->>'content',
              (v_item->>'created_at')::timestamptz, (v_item->>'updated_at')::timestamptz,
              (v_item->>'edited_at')::timestamptz, v_item->>'mod_status');
      v_restored := v_restored + 1;
    end loop;

    if jsonb_typeof(v_rev) = 'object' then
      insert into public.ritual_revisions (post_id, started_by, started_at, ready_at, resolved_at)
      values (v_vault.entry_id,
              (select id from public.profiles where id = (v_rev->>'started_by')::uuid),
              (v_rev->>'started_at')::timestamptz, (v_rev->>'ready_at')::timestamptz,
              (v_rev->>'resolved_at')::timestamptz);
    end if;

    for v_item in select value from jsonb_array_elements(coalesce(p_payload->'feedback', '[]'::jsonb)) loop
      insert into public.ritual_feedback (id, post_id, sender_id, body, created_at)
      values ((v_item->>'key')::uuid, v_vault.entry_id,
              (select id from public.profiles where id = (v_item->>'sender_id')::uuid),
              v_item->>'body', (v_item->>'created_at')::timestamptz);
    end loop;
  exception when invalid_text_representation or invalid_datetime_format
         or datetime_field_overflow or numeric_value_out_of_range or null_value_not_allowed then
    raise exception 'bad_payload' using errcode = 'HW035';
  end;

  update public.threads
  set replies_count = greatest((select count(*) from public.posts
                                where thread_id = v_thread and mod_status = 'live') - 1, 0)
  where id = v_thread;
  delete from public.ritual_vault where id = v_vault.id;

  return jsonb_build_object('thread_id', v_thread, 'entry_id', v_vault.entry_id,
                            'mod_status', v_e->>'mod_status',
                            'critiques_restored', v_restored, 'critiques_skipped', v_skipped);
end $$;

revoke all on function public.ritual_vault_prepare(uuid) from public, anon;
revoke all on function public.ritual_vault_commit(uuid, uuid, integer, text, text) from public, anon;
revoke all on function public.ritual_vault_restore(uuid, jsonb) from public, anon;
grant execute on function public.ritual_vault_prepare(uuid) to authenticated;
grant execute on function public.ritual_vault_commit(uuid, uuid, integer, text, text) to authenticated;
grant execute on function public.ritual_vault_restore(uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';
