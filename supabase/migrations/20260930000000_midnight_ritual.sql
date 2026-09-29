-- Midnight Ritual, PR 1 of 3: database.
-- Spec: docs/superpowers/specs/2026-09-28-midnight-ritual-design.md
--
-- One shared prompt a week, released Fridays 03:00 America/New_York. Prompts are
-- drafted (by AI or a keeper) as 'pending' and go live only when a keeper approves
-- them into the next free weekly slot. Every prompt write goes through the keeper
-- functions below, which log to mod_actions -- there are deliberately no
-- INSERT/UPDATE/DELETE policies (same pattern as site_settings).

-- ── 1. Prompts ─────────────────────────────────────────────────────────────
create table public.ritual_prompts (
  id           uuid primary key default gen_random_uuid(),
  body         text not null check (char_length(btrim(body)) between 10 and 400),
  status       text not null default 'pending' check (status in ('pending', 'scheduled')),
  goes_live_at timestamptz,
  source       text not null check (source in ('ai', 'keeper')),
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint ritual_prompts_schedule_consistent check ((status = 'scheduled') = (goes_live_at is not null)),
  -- Deferred so a re-pack can shift every future prompt one slot without
  -- colliding with itself mid-statement.
  constraint ritual_prompts_slot_unique unique (goes_live_at) deferrable initially deferred
);

create trigger ritual_prompts_set_updated_at
  before update on public.ritual_prompts
  for each row execute function public.touch_profile_updated_at();

alter table public.ritual_prompts enable row level security;

-- Released prompts are public. Pending and future ones are keeper-only, so nobody
-- can read next week's prompt early.
create policy ritual_prompts_released_read on public.ritual_prompts
  for select to anon, authenticated
  using (status = 'scheduled' and goes_live_at <= now());
create policy ritual_prompts_keeper_read on public.ritual_prompts
  for select to authenticated
  using (public.mod_can('configure', 'all'));

revoke insert, update, delete on public.ritual_prompts from anon, authenticated;

-- ── 2. Schedule helpers (internal) ─────────────────────────────────────────
-- The first Friday-03:00-New-York instant strictly after p_after. Local-time
-- arithmetic, so DST is handled by the final AT TIME ZONE.
create function public.ritual_slot_after(p_after timestamptz)
returns timestamptz
language plpgsql stable
set search_path = ''
as $$
declare
  v_local timestamp := p_after at time zone 'America/New_York';
  v_cand  timestamp := date_trunc('day', v_local) + interval '3 hours';
begin
  v_cand := v_cand + ((5 - extract(dow from v_cand)::int + 7) % 7) * interval '1 day';
  if v_cand <= v_local then
    v_cand := v_cand + interval '7 days';
  end if;
  return v_cand at time zone 'America/New_York';
end $$;

-- Future scheduled prompts always sit in consecutive slots from the first slot
-- after now(), in their existing order. Released prompts are never moved.
create function public.ritual_repack()
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_slot timestamptz := public.ritual_slot_after(now());
  r record;
begin
  for r in
    select id from public.ritual_prompts
    where status = 'scheduled' and goes_live_at > now()
    order by goes_live_at
  loop
    update public.ritual_prompts set goes_live_at = v_slot where id = r.id;
    v_slot := public.ritual_slot_after(v_slot);
  end loop;
end $$;

create function public.ritual_require_keeper()
returns void
language plpgsql stable
set search_path = ''
as $$
begin
  if not coalesce(public.mod_can('configure', 'all'), false) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
end $$;

-- ── 3. Keeper functions ────────────────────────────────────────────────────
create function public.ritual_add_prompt(p_body text)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  perform public.ritual_require_keeper();
  insert into public.ritual_prompts (body, source, created_by)
  values (btrim(p_body), 'keeper', auth.uid())
  returning id into v_id;
  insert into public.mod_actions (actor_id, action, target_type, target_id)
  values (auth.uid(), 'ritual_prompt_added', 'ritual_prompt', v_id);
  return v_id;
end $$;

create function public.ritual_edit_prompt(p_id uuid, p_body text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare v_row public.ritual_prompts;
begin
  perform public.ritual_require_keeper();
  select * into v_row from public.ritual_prompts where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_row.status = 'scheduled' and v_row.goes_live_at <= now() then
    raise exception 'released' using errcode = 'HW010';
  end if;
  update public.ritual_prompts set body = btrim(p_body) where id = p_id;
  insert into public.mod_actions (actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'ritual_prompt_edited', 'ritual_prompt', p_id, jsonb_build_object('before', v_row.body));
end $$;

create function public.ritual_approve_prompt(p_id uuid)
returns timestamptz
language plpgsql security definer
set search_path = ''
as $$
declare
  v_row  public.ritual_prompts;
  v_slot timestamptz;
begin
  perform public.ritual_require_keeper();
  lock table public.ritual_prompts in share row exclusive mode;
  select * into v_row from public.ritual_prompts where id = p_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_row.status <> 'pending' then raise exception 'not_pending' using errcode = 'HW011'; end if;
  perform public.ritual_repack();
  select public.ritual_slot_after(greatest(now(), coalesce(max(goes_live_at), now())))
    into v_slot
    from public.ritual_prompts where status = 'scheduled';
  update public.ritual_prompts set status = 'scheduled', goes_live_at = v_slot where id = p_id;
  insert into public.mod_actions (actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'ritual_prompt_approved', 'ritual_prompt', p_id, jsonb_build_object('goes_live_at', v_slot));
  return v_slot;
end $$;

create function public.ritual_unschedule_prompt(p_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare v_row public.ritual_prompts;
begin
  perform public.ritual_require_keeper();
  lock table public.ritual_prompts in share row exclusive mode;
  select * into v_row from public.ritual_prompts where id = p_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_row.status <> 'scheduled' then raise exception 'not_scheduled' using errcode = 'HW012'; end if;
  if v_row.goes_live_at <= now() then raise exception 'released' using errcode = 'HW010'; end if;
  update public.ritual_prompts set status = 'pending', goes_live_at = null where id = p_id;
  perform public.ritual_repack();
  insert into public.mod_actions (actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'ritual_prompt_unscheduled', 'ritual_prompt', p_id, jsonb_build_object('was', v_row.goes_live_at));
end $$;

create function public.ritual_reject_prompt(p_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare v_row public.ritual_prompts;
begin
  perform public.ritual_require_keeper();
  select * into v_row from public.ritual_prompts where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_row.status <> 'pending' then raise exception 'not_pending' using errcode = 'HW011'; end if;
  delete from public.ritual_prompts where id = p_id;
  insert into public.mod_actions (actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'ritual_prompt_rejected', 'ritual_prompt', p_id, jsonb_build_object('body', v_row.body));
end $$;

-- ── 4. Public: when does the next prompt unlock (time only, never its text) ─
create function public.ritual_next_unlock()
returns timestamptz
language sql stable security definer
set search_path = ''
as $$
  select min(goes_live_at) from public.ritual_prompts
  where status = 'scheduled' and goes_live_at > now()
$$;

-- ── Grants (prompts) ───────────────────────────────────────────────────────
revoke all on function public.ritual_slot_after(timestamptz) from public, anon, authenticated;
revoke all on function public.ritual_repack()                 from public, anon, authenticated;
revoke all on function public.ritual_require_keeper()         from public, anon, authenticated;

revoke all on function public.ritual_add_prompt(text)         from public, anon;
revoke all on function public.ritual_edit_prompt(uuid, text)  from public, anon;
revoke all on function public.ritual_approve_prompt(uuid)     from public, anon;
revoke all on function public.ritual_unschedule_prompt(uuid)  from public, anon;
revoke all on function public.ritual_reject_prompt(uuid)      from public, anon;
grant execute on function public.ritual_add_prompt(text)        to authenticated;
grant execute on function public.ritual_edit_prompt(uuid, text) to authenticated;
grant execute on function public.ritual_approve_prompt(uuid)    to authenticated;
grant execute on function public.ritual_unschedule_prompt(uuid) to authenticated;
grant execute on function public.ritual_reject_prompt(uuid)     to authenticated;

revoke all on function public.ritual_next_unlock() from public;
grant execute on function public.ritual_next_unlock() to anon, authenticated;

-- ── 5. Private drafts ──────────────────────────────────────────────────────
-- One draft per writer per prompt. Owner-only. Erased with the account (FK
-- cascade from profiles); sealed on "Seal my writing" by the client
-- (src/lib/sealCollect.js, payload v3).
create table public.ritual_drafts (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  prompt_id  uuid not null references public.ritual_prompts(id) on delete restrict,
  content    text not null check (
               regexp_count(content, '\S+') between 1 and 500
               and char_length(content) <= 6000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (author_id, prompt_id)
);
create index ritual_drafts_prompt_id_idx on public.ritual_drafts (prompt_id);

create trigger ritual_drafts_set_updated_at
  before update on public.ritual_drafts
  for each row execute function public.touch_profile_updated_at();

alter table public.ritual_drafts enable row level security;

create policy ritual_drafts_owner_read on public.ritual_drafts
  for select to authenticated
  using (author_id = (select auth.uid()));
create policy ritual_drafts_owner_insert on public.ritual_drafts
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and not public.is_banned(author_id)
    and exists (select 1 from public.ritual_prompts p
                where p.id = prompt_id and p.status = 'scheduled' and p.goes_live_at <= now()));
create policy ritual_drafts_owner_update on public.ritual_drafts
  for update to authenticated
  using (author_id = (select auth.uid()))
  with check (
    author_id = (select auth.uid())
    and not public.is_banned(author_id)
    and exists (select 1 from public.ritual_prompts p
                where p.id = prompt_id and p.status = 'scheduled' and p.goes_live_at <= now()));
create policy ritual_drafts_owner_delete on public.ritual_drafts
  for delete to authenticated
  using (author_id = (select auth.uid()));

revoke all on public.ritual_drafts from anon;

-- ── 6. Stories written for a prompt ────────────────────────────────────────
alter table public.books
  add column prompt_id uuid references public.ritual_prompts(id) on delete restrict;
create index books_prompt_id_idx on public.books (prompt_id) where prompt_id is not null;

-- The books INSERT/UPDATE policies only check the author, and the FK ignores RLS,
-- so without this a writer could tag a story to a pending or future prompt (ids are
-- public via get_transparency_log): an "early" response, or an FK that blocks a
-- keeper's reject. Only a released prompt can be newly attached.
create function public.books_check_prompt_released()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.prompt_id is not null
     and (tg_op = 'INSERT' or new.prompt_id is distinct from old.prompt_id)
     and not exists (select 1 from public.ritual_prompts p
                     where p.id = new.prompt_id and p.status = 'scheduled' and p.goes_live_at <= now()) then
    raise exception 'prompt_not_released' using errcode = 'HW014';
  end if;
  return new;
end $$;

create trigger books_prompt_released
  before insert or update of prompt_id on public.books
  for each row execute function public.books_check_prompt_released();

revoke all on function public.books_check_prompt_released() from public, anon, authenticated;

-- ── 7. Share: a draft becomes a normal story, atomically ───────────────────
-- SECURITY INVOKER on purpose: the insert passes through exactly the same books
-- INSERT policy (author = caller, not banned) and triggers (rate limit) as
-- PublishStory. The client then calls moderate-content, as PublishStory does.
create function public.share_ritual_draft(p_draft_id uuid, p_title text)
returns uuid
language plpgsql security invoker
set search_path = ''
as $$
declare
  v_draft public.ritual_drafts;
  v_title text := btrim(coalesce(p_title, ''));
  v_book  uuid;
begin
  if char_length(v_title) not between 1 and 200 then
    raise exception 'bad_title' using errcode = 'HW013';
  end if;
  select * into v_draft from public.ritual_drafts
  where id = p_draft_id and author_id = auth.uid();
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;

  insert into public.books (title, lede, content, author_id, version, prompt_id)
  values (v_title,
          left(regexp_replace(btrim(v_draft.content), '\s+', ' ', 'g'), 160),
          v_draft.content, auth.uid(), 1, v_draft.prompt_id)
  returning id into v_book;

  delete from public.ritual_drafts where id = v_draft.id;
  return v_book;
end $$;

revoke all on function public.share_ritual_draft(uuid, text) from public, anon;
grant execute on function public.share_ritual_draft(uuid, text) to authenticated;

notify pgrst, 'reload schema';
