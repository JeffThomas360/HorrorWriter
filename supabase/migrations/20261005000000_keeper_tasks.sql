-- Keeper work queue (PR 1 of 3 for content warnings).
-- Spec: docs/superpowers/specs/2026-10-05-content-warnings-design.md
--
-- One inbox for anything that needs the keeper and is not already covered by
-- Reports, Appeals, Support or Storms. A task has a type, an optional target and
-- a jsonb payload. Writes go only through the functions below, which check the
-- keeper gate and log to mod_actions -- there are deliberately no
-- INSERT/UPDATE/DELETE policies (same pattern as site_settings and ritual_prompts).
--
-- Adding a task type later: (1) a registry entry in src/lib/keeperTasks.js,
-- (2) a branch in keeper_task_apply_action() below, (3) a call to
-- create_keeper_task() from wherever the work arises.

-- ── 1. Table ───────────────────────────────────────────────────────────────
create table public.keeper_tasks (
  id            uuid primary key default gen_random_uuid(),
  type          text not null check (char_length(type) between 1 and 60),
  target_type   text,
  target_id     uuid,                      -- no FK: the queue outlives its target
  payload       jsonb not null default '{}'::jsonb,
  priority      smallint not null default 0 check (priority in (0, 1)),
  status        text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  -- Unique across ALL statuses. A new problem should use a new key (include a
  -- generation such as the target's updated_at), and a resolved task is never
  -- reopened by a repeat call. Discourse shipped the reopening bug.
  dedupe_key    text not null,
  snoozed_until timestamptz,
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz,
  resolved_by   uuid references public.profiles(id) on delete set null,
  resolution    text,
  constraint keeper_tasks_dedupe_key_unique unique (dedupe_key),
  constraint keeper_tasks_resolved_consistent check ((status = 'open') = (resolved_at is null))
);

create index keeper_tasks_open_idx
  on public.keeper_tasks (priority desc, created_at)
  where status = 'open';

alter table public.keeper_tasks enable row level security;

create policy keeper_tasks_keeper_read on public.keeper_tasks
  for select to authenticated
  using (public.mod_can('configure', 'all'));

revoke insert, update, delete on public.keeper_tasks from anon, authenticated;

-- ── 2. Internal helpers ────────────────────────────────────────────────────
create function public.keeper_task_require_keeper()
returns void
language plpgsql stable
set search_path = ''
as $$
begin
  if not coalesce(public.mod_can('configure', 'all'), false) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
end $$;

-- Per-type action handlers. Returns the task's new status ('resolved' or
-- 'dismissed'). Add one `when` branch per task type. An action a type does not
-- define raises unknown_action, so the client registry and this function can
-- never silently disagree.
create function public.keeper_task_apply_action(p_task public.keeper_tasks, p_action text, p_note text)
returns text
language plpgsql security definer
set search_path = ''
as $$
begin
  case p_task.type
    when 'manual' then
      if p_action = 'done' then return 'resolved'; end if;
      if p_action = 'dismiss' then return 'dismissed'; end if;
    else
      null;
  end case;
  raise exception 'unknown_action' using errcode = 'HW012';
end $$;

-- ── 3. System functions (service_role only) ────────────────────────────────
create function public.create_keeper_task(
  p_type        text,
  p_dedupe_key  text,
  p_target_type text     default null,
  p_target_id   uuid     default null,
  p_payload     jsonb    default '{}'::jsonb,
  p_priority    smallint default 0
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  insert into public.keeper_tasks (type, dedupe_key, target_type, target_id, payload, priority)
  values (p_type, p_dedupe_key, p_target_type, p_target_id, coalesce(p_payload, '{}'::jsonb), coalesce(p_priority, 0))
  on conflict (dedupe_key) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.keeper_tasks where dedupe_key = p_dedupe_key;
  end if;
  return v_id;
end $$;

create function public.close_keeper_tasks_for(p_type text, p_target_id uuid)
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare v_n integer;
begin
  update public.keeper_tasks
     set status = 'resolved', resolved_at = now(), resolved_by = null,
         resolution = 'auto: condition cleared'
   where type = p_type and target_id = p_target_id and status = 'open';
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ── 4. Keeper functions ────────────────────────────────────────────────────
create function public.resolve_keeper_task(p_id uuid, p_action text, p_note text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_task   public.keeper_tasks;
  v_status text;
begin
  perform public.keeper_task_require_keeper();
  select * into v_task from public.keeper_tasks where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_task.status <> 'open' then raise exception 'not_open' using errcode = 'HW011'; end if;

  v_status := public.keeper_task_apply_action(v_task, p_action, p_note);

  update public.keeper_tasks
     set status = v_status,
         resolved_at = now(),
         resolved_by = auth.uid(),
         resolution = p_action || coalesce(': ' || nullif(btrim(p_note), ''), '')
   where id = p_id;

  insert into public.mod_actions (actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'keeper_task_resolved', 'keeper_task', p_id,
          jsonb_build_object('type', v_task.type, 'action', p_action));
end $$;

create function public.snooze_keeper_task(p_id uuid, p_until timestamptz)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare v_task public.keeper_tasks;
begin
  perform public.keeper_task_require_keeper();
  if p_until is null or p_until <= now() or p_until > now() + interval '30 days' then
    raise exception 'bad_snooze' using errcode = '22023';
  end if;
  select * into v_task from public.keeper_tasks where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_task.status <> 'open' then raise exception 'not_open' using errcode = 'HW011'; end if;
  update public.keeper_tasks set snoozed_until = p_until where id = p_id;
  insert into public.mod_actions (actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'keeper_task_snoozed', 'keeper_task', p_id,
          jsonb_build_object('type', v_task.type, 'until', p_until));
end $$;

create function public.keeper_add_task(p_title text, p_body text default null)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  perform public.keeper_task_require_keeper();
  if char_length(btrim(coalesce(p_title, ''))) not between 1 and 120 then
    raise exception 'bad_title' using errcode = '22023';
  end if;
  insert into public.keeper_tasks (type, dedupe_key, payload)
  values ('manual', 'manual:' || gen_random_uuid()::text,
          jsonb_build_object('title', btrim(p_title), 'body', nullif(btrim(coalesce(p_body, '')), '')))
  returning id into v_id;
  insert into public.mod_actions (actor_id, action, target_type, target_id)
  values (auth.uid(), 'keeper_task_added', 'keeper_task', v_id);
  return v_id;
end $$;

-- ── 5. Grants ──────────────────────────────────────────────────────────────
revoke all on function public.keeper_task_require_keeper() from public, anon, authenticated;
revoke all on function public.keeper_task_apply_action(public.keeper_tasks, text, text) from public, anon, authenticated;

revoke all on function public.create_keeper_task(text, text, text, uuid, jsonb, smallint) from public, anon, authenticated;
grant execute on function public.create_keeper_task(text, text, text, uuid, jsonb, smallint) to service_role;
revoke all on function public.close_keeper_tasks_for(text, uuid) from public, anon, authenticated;
grant execute on function public.close_keeper_tasks_for(text, uuid) to service_role;

revoke all on function public.resolve_keeper_task(uuid, text, text) from public, anon;
revoke all on function public.snooze_keeper_task(uuid, timestamptz)  from public, anon;
revoke all on function public.keeper_add_task(text, text)            from public, anon;
grant execute on function public.resolve_keeper_task(uuid, text, text) to authenticated;
grant execute on function public.snooze_keeper_task(uuid, timestamptz)  to authenticated;
grant execute on function public.keeper_add_task(text, text)            to authenticated;

notify pgrst, 'reload schema';
