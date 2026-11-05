-- Library story "Keep it" vault: the Ritual vault (20261024000000_ritual_vault.sql), for stories.
--
-- From My Stories an author can Delete forever (plain RLS delete, already allowed) or Keep it:
-- the story, its critiques and its series placement are encrypted IN THE BROWSER with the
-- writer's recovery code (src/lib/seal.js). The database only ever stores ciphertext.
--
-- Flow (three RPCs, all authenticated, all bound to auth.uid()):
--   1. story_vault_prepare(book)  -> the payload to encrypt (story, critiques, series places)
--                                    + a nonce + its seal. Changes nothing.
--   2. (browser adds the seal to the payload and encrypts it with the recovery code)
--   3. story_vault_commit(book, nonce, key_version, seal, bundle)
--                                 -> locks the story, re-collects, refuses if anything changed
--                                    since step 1, stores the bundle, deletes the story
--                                    (critiques and series places cascade).
--   4. story_vault_restore(vault, payload) -> the browser decrypts and sends the payload back.
--                                    The seal is re-checked BEFORE anything is re-inserted, so an
--                                    edited story or a forged critique fails the whole restore.
--
-- One seal covers the whole payload: HMAC-SHA256 (ritual_vault_keys, the same server-only keys)
-- over ('story', nonce, payload). jsonb's text form is canonical, so the payload survives the
-- browser round trip byte for byte as far as the seal is concerned.
--
-- The story's title is inside the bundle, so the vault row carries no title: the profile lists
-- kept stories by date only. That is the price of nobody else being able to read it.
-- Moderation-removed ('hidden') critiques are never collected (already read and judged).
-- Archive classics and account-deletion tombstones cannot be kept or deleted here.

create table public.story_vault (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  book_id     uuid not null unique,
  nonce       uuid not null unique,
  key_version integer not null references public.ritual_vault_keys(version),
  -- version(1) + salt(16) + iv(12) + tag(16) is the smallest possible sealWriting() bundle.
  -- Stories are longer than Ritual entries: allow 8 MB.
  bundle      bytea not null check (octet_length(bundle) between 45 and 8388608),
  created_at  timestamptz not null default now()
);
create index story_vault_owner_idx on public.story_vault (owner_id, created_at);

alter table public.story_vault enable row level security;
revoke all on public.story_vault from anon, authenticated;
grant select, delete on public.story_vault to authenticated;
-- Writes only through the RPCs. Deleting from the vault is the owner's own call.
create policy story_vault_select on public.story_vault for select to authenticated
  using (owner_id = (select auth.uid()));
create policy story_vault_delete on public.story_vault for delete to authenticated
  using (owner_id = (select auth.uid()));

-- ── Internal: what goes in the bundle (nobody but the functions below may call it) ──
create or replace function public.story_vault_collect(p_book_id uuid)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'v', 1,
    'kind', 'library-story',
    'story', (select jsonb_build_object(
        'id', b.id, 'author_id', b.author_id, 'title', b.title, 'lede', b.lede, 'cover', b.cover,
        'badge', b.badge, 'chapters_info', b.chapters_info, 'content', b.content,
        'series_teaser', b.series_teaser, 'version', b.version, 'prompt_id', b.prompt_id,
        'mod_status', b.mod_status, 'created_at', b.created_at, 'updated_at', b.updated_at)
      from public.books b where b.id = p_book_id),
    'comments', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id, 'author_id', c.author_id, 'content', c.content, 'mod_status', c.mod_status,
        'book_version', c.book_version, 'created_at', c.created_at, 'updated_at', c.updated_at)
        order by c.created_at, c.id)
      from public.book_comments c where c.book_id = p_book_id and c.mod_status <> 'hidden'), '[]'::jsonb),
    'series', coalesce((select jsonb_agg(jsonb_build_object(
        'series_id', sb.series_id, 'sort_order', sb.sort_order) order by sb.series_id)
      from public.series_books sb where sb.book_id = p_book_id), '[]'::jsonb))
$$;

create or replace function public.story_vault_seal(p_version integer, p_nonce uuid, p_payload jsonb)
returns text language sql stable set search_path = '' as $$
  select public.ritual_vault_hmac(p_version, jsonb_build_array('story', p_nonce, p_payload - 'seal'))
$$;

revoke all on function public.story_vault_collect(uuid) from public, anon, authenticated;
revoke all on function public.story_vault_seal(integer, uuid, jsonb) from public, anon, authenticated;

-- ── 1. Prepare ────────────────────────────────────────────────────────────
create or replace function public.story_vault_prepare(p_book_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_version integer;
  v_nonce uuid := gen_random_uuid();
  v_payload jsonb;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  perform 1 from public.books
  where id = p_book_id and author_id = v_uid and archive_author is null
    and not coalesce(removed_by_author, false);
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select max(version) into v_version from public.ritual_vault_keys;
  v_payload := public.story_vault_collect(p_book_id);
  return jsonb_build_object('nonce', v_nonce, 'key_version', v_version, 'payload', v_payload,
                            'seal', public.story_vault_seal(v_version, v_nonce, v_payload));
end $$;

-- ── 2. Commit ─────────────────────────────────────────────────────────────
create or replace function public.story_vault_commit(
  p_book_id uuid, p_nonce uuid, p_key_version integer, p_seal text, p_bundle text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_bundle bytea;
  v_id uuid;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  -- Lock the story first: a critique being added right now holds a key-share lock on it, so we
  -- either wait for that insert to land (and then see it) or it waits for us (and then fails).
  perform 1 from public.books
  where id = p_book_id and author_id = v_uid and archive_author is null
    and not coalesce(removed_by_author, false)
  for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;

  if (select count(*) from public.story_vault where owner_id = v_uid) >= 50 then
    raise exception 'vault_full' using errcode = 'HW031';
  end if;
  begin
    v_bundle := decode(coalesce(p_bundle, ''), 'base64');
  exception when others then
    raise exception 'bad_bundle' using errcode = 'HW032';
  end;
  if octet_length(v_bundle) not between 45 and 8388608 then
    raise exception 'bad_bundle' using errcode = 'HW032';
  end if;
  if not exists (select 1 from public.ritual_vault_keys where version = p_key_version)
     or public.story_vault_seal(p_key_version, p_nonce, public.story_vault_collect(p_book_id))
        is distinct from p_seal then
    raise exception 'changed_since_prepare' using errcode = 'HW033';
  end if;

  insert into public.story_vault (owner_id, book_id, nonce, key_version, bundle)
  values (v_uid, p_book_id, p_nonce, p_key_version, v_bundle)
  returning id into v_id;

  -- Same as Delete forever from here: critiques and series places cascade.
  delete from public.books where id = p_book_id;
  return v_id;
end $$;

-- ── 3. Restore ────────────────────────────────────────────────────────────
-- p_payload is the decrypted bundle: prepare's payload plus its 'seal'. Nothing in it is trusted
-- until that seal matches, under the vault row's own nonce and key version.
create or replace function public.story_vault_restore(p_vault_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_vault public.story_vault;
  v_s jsonb;
  v_item jsonb;
  v_prompt uuid;
  v_author uuid;
  v_restored integer := 0;
  v_skipped integer := 0;
  v_series_lost integer := 0;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  select * into v_vault from public.story_vault where id = p_vault_id and owner_id = v_uid for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  -- A sanctioned author waits; the vault stays intact.
  if public.is_banned(v_uid) then raise exception 'sanctioned' using errcode = 'HW034'; end if;

  if jsonb_typeof(p_payload) is distinct from 'object' or jsonb_typeof(p_payload->'seal') is distinct from 'string' then
    raise exception 'bad_payload' using errcode = 'HW035';
  end if;
  -- 1. The seal, before anything else is read from the payload.
  if (p_payload->>'seal') is distinct from public.story_vault_seal(v_vault.key_version, v_vault.nonce, p_payload) then
    raise exception 'seal_invalid' using errcode = 'HW036';
  end if;
  v_s := p_payload->'story';
  if (p_payload->>'kind') is distinct from 'library-story'
     or (v_s->>'id')::uuid is distinct from v_vault.book_id
     or (v_s->>'author_id')::uuid is distinct from v_uid then
    raise exception 'bad_payload' using errcode = 'HW035';
  end if;

  -- 2. Re-check the world.
  if exists (select 1 from public.books where id = v_vault.book_id) then
    raise exception 'already_exists' using errcode = 'HW037';
  end if;
  -- A prompt link survives only if that prompt is still out (books_prompt_released would refuse).
  select id into v_prompt from public.ritual_prompts
  where id = (v_s->>'prompt_id')::uuid and status = 'scheduled' and goes_live_at <= now();

  -- 3. Put it back. mod_status returns exactly as sealed: a hidden story comes back hidden.
  insert into public.books (id, author_id, title, lede, cover, badge, chapters_info, content,
                            series_teaser, version, prompt_id, mod_status, created_at, updated_at)
  values (v_vault.book_id, v_uid, v_s->>'title', v_s->>'lede', v_s->>'cover', v_s->>'badge',
          v_s->>'chapters_info', v_s->>'content', v_s->>'series_teaser',
          coalesce((v_s->>'version')::integer, 1), v_prompt, coalesce(v_s->>'mod_status', 'live'),
          (v_s->>'created_at')::timestamptz, (v_s->>'updated_at')::timestamptz);

  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'comments', '[]'::jsonb)) loop
    v_author := (v_item->>'author_id')::uuid;
    -- A critic whose account is gone cannot be re-attached; their critique is not restored.
    if v_author is null or not exists (select 1 from public.profiles where id = v_author) then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    insert into public.book_comments (id, book_id, author_id, content, mod_status, created_at, updated_at)
    values ((v_item->>'id')::uuid, v_vault.book_id, v_author, v_item->>'content',
            v_item->>'mod_status', (v_item->>'created_at')::timestamptz, (v_item->>'updated_at')::timestamptz);
    v_restored := v_restored + 1;
  end loop;

  -- Back into each series that still exists and is still the writer's.
  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'series', '[]'::jsonb)) loop
    if exists (select 1 from public.series where id = (v_item->>'series_id')::uuid and author_id = v_uid) then
      insert into public.series_books (series_id, book_id, sort_order)
      values ((v_item->>'series_id')::uuid, v_vault.book_id, (v_item->>'sort_order')::integer)
      on conflict do nothing;
    else
      v_series_lost := v_series_lost + 1;
    end if;
  end loop;

  delete from public.story_vault where id = v_vault.id;

  return jsonb_build_object('book_id', v_vault.book_id, 'mod_status', v_s->>'mod_status',
                            'critiques_restored', v_restored, 'critiques_skipped', v_skipped,
                            'series_lost', v_series_lost);
end $$;

revoke all on function public.story_vault_prepare(uuid) from public, anon;
revoke all on function public.story_vault_commit(uuid, uuid, integer, text, text) from public, anon;
revoke all on function public.story_vault_restore(uuid, jsonb) from public, anon;
grant execute on function public.story_vault_prepare(uuid) to authenticated;
grant execute on function public.story_vault_commit(uuid, uuid, integer, text, text) to authenticated;
grant execute on function public.story_vault_restore(uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';
