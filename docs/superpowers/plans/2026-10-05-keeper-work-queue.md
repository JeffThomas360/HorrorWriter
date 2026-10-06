# Keeper Work Queue Implementation Plan (PR 1 of 3 for Content Warnings)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A general keeper inbox (`keeper_tasks`) where any feature can drop work for the keeper, with an Admin "Work queue" tab, an Overview count, and one built-in task type (`manual` to-dos) so it works and is testable before any TypeSafe code exists.

**Architecture:** One Postgres table with a `type`, an optional target and a jsonb payload. Writes go only through keeper-checked `SECURITY DEFINER` functions that log to `mod_actions` (same pattern as the Midnight Ritual keeper tools). A client registry maps each task type to its label, description and actions, so the tab renders any task and a new type is one registry entry plus one server handler.

**Tech Stack:** Postgres/Supabase migrations and RLS, React islands, TanStack Query, vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-05-content-warnings-design.md` (section "Keeper work queue (general)"). Plans for PR 2 (tags backend) and PR 3 (front end) come after this one lands, so they can build on its real, verified interfaces.

## Global Constraints

- Merging a migration to `main` applies it to production. Rehearse it first inside `begin; … rollback;` via `npx supabase db query --linked -f <file>`. Never use the MCP `apply_migration` tool.
- Migration filename is numbered and later than `20260930000000`: use `20261005000000_keeper_tasks.sql`.
- New functions are private by default. Every client-callable function needs an explicit `GRANT EXECUTE ... TO authenticated` and a row in `scripts/sql/verify-grants.sql`. After the migration, `verify-grants.sql` must return **zero rows**.
- After a schema change run `NOTIFY pgrst, 'reload schema';` (it is the last line of the migration).
- Keeper gate is `mod_can('configure', 'all')`. No client INSERT/UPDATE/DELETE policy on the table.
- `supabase` may be null: guard before querying (`need()` pattern from `ritualAdmin.js`).
- Hooks go before early returns in island components.
- Colors: ember (`--color-ember`) for anything interactive or small; blood only for display type, borders, fills.
- Claude commits and opens the PR; Jeff reviews and merges. After code changes, state `npm run test:unit` and `npm run build` for Jeff.
- One deliverable per PR. Work on branch `feat/content-warnings` (already holds the spec) or a branch cut from it.

## Review Focus

- **Double-create:** two callers creating a task with the same `dedupe_key` get one task and the same id, never an error.
- **Resolved never reopens:** creating a task whose `dedupe_key` belongs to a resolved or dismissed task returns that old id and does not reopen it.
- **Race:** resolving an already-resolved task fails with `not_open`; the UI refreshes and says so.
- **Non-keepers:** a moderator who is not a keeper, and anonymous, cannot read or write any task.
- **Unknown task type** (a future type whose registry entry is missing): the tab shows it plainly with Snooze only, never crashes.
- **Snooze bounds:** a snooze in the past, or over 30 days, is rejected.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20261005000000_keeper_tasks.sql` | table, RLS, internal helpers, keeper RPCs, grants |
| `scripts/sql/rehearse-keeper-tasks.sql` | rolled-back rehearsal that exercises every function |
| `scripts/sql/verify-grants.sql` | allowlist rows for the three new keeper RPCs |
| `src/lib/keeperTasks.js` | pure: registry, describe, actions, sort, filter, counts |
| `src/lib/keeperTasks.test.js` | tests for the above |
| `src/lib/keeperTaskApi.js` | Supabase calls and friendly errors |
| `src/lib/keeperTaskApi.test.js` | tests with a mocked client |
| `src/components/admin/WorkQueueTab.jsx` | the tab |
| `src/components/admin/WorkQueueTab.test.jsx` | tab tests |
| `src/pages-react/Admin.jsx` | add the tab |
| `src/components/admin/AdminOverviewTab.jsx` (+ test) | open-task count card |
| `src/components/admin/AuditTab.jsx` | labels for the three new audit actions |

---

### Task 1: Database — table, functions, grants, rehearsal

**Files:**
- Create: `supabase/migrations/20261005000000_keeper_tasks.sql`
- Create: `scripts/sql/rehearse-keeper-tasks.sql`
- Modify: `scripts/sql/verify-grants.sql` (allowlist, after the Midnight Ritual block)

**Interfaces:**
- Produces (SQL, all in `public`):
  - table `keeper_tasks`
  - `create_keeper_task(p_type text, p_dedupe_key text, p_target_type text default null, p_target_id uuid default null, p_payload jsonb default '{}', p_priority smallint default 0) returns uuid` — `service_role` only
  - `close_keeper_tasks_for(p_type text, p_target_id uuid) returns integer` — `service_role` only
  - `resolve_keeper_task(p_id uuid, p_action text, p_note text default null) returns void` — keeper
  - `snooze_keeper_task(p_id uuid, p_until timestamptz) returns void` — keeper
  - `keeper_add_task(p_title text, p_body text default null) returns uuid` — keeper
  - internal `keeper_task_require_keeper()`, `keeper_task_apply_action(public.keeper_tasks, text, text) returns text`
  - Error messages (via `raise exception`): `not_allowed` (42501), `not_found` (P0002), `not_open` (HW011), `unknown_action` (HW012), `bad_snooze` (22023), `bad_title` (22023)
  - `mod_actions.action` values: `keeper_task_added`, `keeper_task_resolved`, `keeper_task_snoozed`

- [ ] **Step 1: Write the migration**

```sql
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
```

- [ ] **Step 2: Add the allowlist rows to `scripts/sql/verify-grants.sql`**

Insert after the `ritual_next_unlock` / `authenticated` row, before the closing `)` of `allow`. Note the previous last row has no trailing comma today, so add one to it.

```sql
  ('ritual_next_unlock',       'authenticated', 'next weekly unlock time for the home countdown'),
  -- Keeper work queue (20261005000000). Keeper RPCs: each calls
  -- keeper_task_require_keeper() = mod_can(configure, all) and logs to mod_actions.
  ('resolve_keeper_task',      'authenticated', 'keeper RPC, mod_can(configure, all)'),
  ('snooze_keeper_task',       'authenticated', 'keeper RPC, mod_can(configure, all)'),
  ('keeper_add_task',          'authenticated', 'keeper RPC, mod_can(configure, all)')
```

(`create_keeper_task` and `close_keeper_tasks_for` are `service_role` only, which the check does not list, so they need no row.)

- [ ] **Step 3: Write the rehearsal**

`scripts/sql/rehearse-keeper-tasks.sql`. It runs the migration's behavior inside a transaction that is rolled back. It assumes the migration file's SQL has been run first in the same transaction, so concatenate: the command in Step 4 does that.

```sql
-- Rehearsal for 20261005000000_keeper_tasks.sql. Runs AFTER the migration body,
-- in the same transaction, and ends in ROLLBACK. Every `do` block raises on
-- failure, so a clean run means every check passed.

do $$
declare keeper uuid; a uuid; b uuid; t uuid; n int;
begin
  select id into keeper from public.profiles where mod_role = 'keeper' limit 1;
  if keeper is null then raise exception 'rehearsal needs a keeper profile'; end if;

  -- dedupe: same key twice -> same id, one row
  a := public.create_keeper_task('manual', 'rehearsal:k1', null, null, '{"title":"x"}'::jsonb, 0::smallint);
  b := public.create_keeper_task('manual', 'rehearsal:k1', null, null, '{"title":"y"}'::jsonb, 0::smallint);
  if a is distinct from b then raise exception 'dedupe returned two ids'; end if;
  select count(*) into n from public.keeper_tasks where dedupe_key = 'rehearsal:k1';
  if n <> 1 then raise exception 'dedupe made % rows', n; end if;

  -- act as the keeper
  perform set_config('request.jwt.claims', json_build_object('sub', keeper, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into n from public.keeper_tasks;
  if n < 1 then raise exception 'keeper cannot read tasks'; end if;

  -- resolve, then a second resolve must fail not_open
  perform public.resolve_keeper_task(a, 'done', 'rehearsal');
  begin
    perform public.resolve_keeper_task(a, 'done');
    raise exception 'second resolve should have failed';
  exception when sqlstate 'HW011' then null; end;

  -- resolved task is not reopened by a repeat create
  reset role;
  b := public.create_keeper_task('manual', 'rehearsal:k1');
  if b is distinct from a then raise exception 'repeat create returned a different id'; end if;
  if (select status from public.keeper_tasks where id = a) <> 'resolved' then
    raise exception 'resolved task was reopened';
  end if;

  -- unknown action
  perform set_config('request.jwt.claims', json_build_object('sub', keeper, 'role', 'authenticated')::text, true);
  set local role authenticated;
  t := public.keeper_add_task('Rehearsal to-do', 'body');
  begin
    perform public.resolve_keeper_task(t, 'nonsense');
    raise exception 'unknown action should have failed';
  exception when sqlstate 'HW012' then null; end;

  -- snooze bounds
  begin perform public.snooze_keeper_task(t, now() - interval '1 hour'); raise exception 'past snooze accepted';
  exception when sqlstate '22023' then null; end;
  begin perform public.snooze_keeper_task(t, now() + interval '31 days'); raise exception '31-day snooze accepted';
  exception when sqlstate '22023' then null; end;
  perform public.snooze_keeper_task(t, now() + interval '1 day');

  -- bad title
  begin perform public.keeper_add_task('   '); raise exception 'blank title accepted';
  exception when sqlstate '22023' then null; end;

  -- auto-close
  reset role;
  perform public.create_keeper_task('rehearsal_type', 'rehearsal:k2', 'story', gen_random_uuid(), '{}'::jsonb, 0::smallint);
  update public.keeper_tasks set target_id = '00000000-0000-0000-0000-000000000001' where dedupe_key = 'rehearsal:k2';
  if public.close_keeper_tasks_for('rehearsal_type', '00000000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'auto-close did not close exactly one';
  end if;
end $$;

-- A non-keeper must be refused everything.
do $$
declare plain uuid;
begin
  select id into plain from public.profiles where mod_role is null limit 1;
  if plain is null then return; end if;  -- no ordinary profile to test with
  perform set_config('request.jwt.claims', json_build_object('sub', plain, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.keeper_add_task('nope'); raise exception 'non-keeper add accepted';
  exception when sqlstate '42501' then null; end;
  if (select count(*) from public.keeper_tasks) <> 0 then raise exception 'non-keeper can read tasks'; end if;
end $$;

select 'rehearsal passed' as result;
```

- [ ] **Step 4: Rehearse the migration (does not apply it)**

Run from PowerShell, in the repo root:

```powershell
$f = Join-Path $env:TEMP 'keeper-tasks-rehearsal.sql'
"begin;`n" + (Get-Content supabase/migrations/20261005000000_keeper_tasks.sql -Raw) + "`n" + (Get-Content scripts/sql/rehearse-keeper-tasks.sql -Raw) + "`nrollback;" | Set-Content $f -Encoding utf8
npx supabase db query --linked -f $f
```

Expected: the result shows `rehearsal passed`. Any `raise exception` message means a failure; fix the migration and rerun. Then confirm nothing leaked:

```powershell
npx supabase db query --linked "select to_regclass('public.keeper_tasks') is null as table_absent"
```

Expected: `table_absent = true` (the rollback worked, the migration is NOT applied yet).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261005000000_keeper_tasks.sql scripts/sql/rehearse-keeper-tasks.sql scripts/sql/verify-grants.sql
git commit -m "feat(queue): keeper_tasks table and keeper RPCs"
```

---

### Task 2: Client registry and pure helpers

**Files:**
- Create: `src/lib/keeperTasks.js`
- Test: `src/lib/keeperTasks.test.js`

**Interfaces:**
- Produces:
  - `TASK_TYPES: Record<string, { label: string, describe(task): string, detail(task): string|null, link(task): string|null, actions: {id:string, label:string, danger?:boolean}[] }>`
  - `typeInfo(type): entry` (falls back to an "Unknown task" entry with no actions)
  - `describeTask(task): string`, `actionsFor(task): action[]`
  - `isSnoozed(task, now = new Date()): boolean`
  - `sortTasks(tasks): task[]` (priority desc, then `created_at` asc; does not mutate)
  - `visibleTasks(tasks, { type = 'all', showSnoozed = false, now = new Date() } = {}): task[]`
  - `openCount(tasks, now = new Date()): number` (open and not snoozed)
  - `countsByType(tasks, now = new Date()): Record<string, number>` (open and not snoozed)
  - A task is `{ id, type, status, priority, snoozed_until, created_at, payload, target_type, target_id }`.

- [ ] **Step 1: Write the failing tests**

```js
import { describe, it, expect } from 'vitest'
import {
  TASK_TYPES, typeInfo, describeTask, actionsFor, isSnoozed,
  sortTasks, visibleTasks, openCount, countsByType,
} from './keeperTasks'

const NOW = new Date('2026-10-10T12:00:00Z')
const task = (over = {}) => ({
  id: 't', type: 'manual', status: 'open', priority: 0, snoozed_until: null,
  created_at: '2026-10-01T00:00:00Z', payload: { title: 'Buy domain' }, ...over,
})

describe('registry', () => {
  it('knows the manual type: label, description, Done and Dismiss', () => {
    expect(TASK_TYPES.manual.label).toBe('To-do')
    expect(describeTask(task())).toBe('Buy domain')
    expect(actionsFor(task()).map((a) => a.id)).toEqual(['done', 'dismiss'])
  })
  it('shows an unknown type plainly, with no actions, and never throws', () => {
    const t = task({ type: 'from_the_future', payload: {} })
    expect(typeInfo('from_the_future').label).toBe('Unknown task')
    expect(describeTask(t)).toBe('from_the_future')
    expect(actionsFor(t)).toEqual([])
  })
  it('copes with a missing payload', () => {
    expect(describeTask(task({ payload: null }))).toBe('Untitled task')
  })
})

describe('isSnoozed', () => {
  it('is true only while snoozed_until is in the future', () => {
    expect(isSnoozed(task({ snoozed_until: '2026-10-11T00:00:00Z' }), NOW)).toBe(true)
    expect(isSnoozed(task({ snoozed_until: '2026-10-10T11:00:00Z' }), NOW)).toBe(false)
    expect(isSnoozed(task(), NOW)).toBe(false)
  })
})

describe('sortTasks', () => {
  it('puts high priority first, then oldest first, without mutating', () => {
    const a = task({ id: 'a', created_at: '2026-10-03T00:00:00Z' })
    const b = task({ id: 'b', created_at: '2026-10-01T00:00:00Z' })
    const c = task({ id: 'c', priority: 1, created_at: '2026-10-05T00:00:00Z' })
    const input = [a, b, c]
    expect(sortTasks(input).map((t) => t.id)).toEqual(['c', 'b', 'a'])
    expect(input.map((t) => t.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('visibleTasks / counts', () => {
  const tasks = [
    task({ id: 'open' }),
    task({ id: 'snoozed', snoozed_until: '2026-10-12T00:00:00Z' }),
    task({ id: 'other', type: 'tag_review' }),
    task({ id: 'done', status: 'resolved' }),
  ]
  it('hides resolved and snoozed by default', () => {
    expect(visibleTasks(tasks, { now: NOW }).map((t) => t.id).sort()).toEqual(['open', 'other'])
  })
  it('can show snoozed ones, and filter by type', () => {
    expect(visibleTasks(tasks, { now: NOW, showSnoozed: true }).map((t) => t.id).sort()).toEqual(['open', 'other', 'snoozed'])
    expect(visibleTasks(tasks, { now: NOW, type: 'tag_review' }).map((t) => t.id)).toEqual(['other'])
  })
  it('counts only open, un-snoozed tasks', () => {
    expect(openCount(tasks, NOW)).toBe(2)
    expect(countsByType(tasks, NOW)).toEqual({ manual: 1, tag_review: 1 })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/keeperTasks.test.js`
Expected: FAIL, "Cannot find module './keeperTasks'".

- [ ] **Step 3: Implement**

```js
/**
 * Keeper work queue registry and pure helpers.
 *
 * To add a task type: add an entry to TASK_TYPES here, add a `when` branch to
 * keeper_task_apply_action() in a new migration, and call create_keeper_task()
 * from wherever the work arises. The tab renders any task from this registry.
 * The server rejects an action a type does not define, so the two stay in step.
 */

export const TASK_TYPES = {
  manual: {
    label: 'To-do',
    describe: (t) => t.payload?.title || 'Untitled task',
    detail: (t) => t.payload?.body ?? null,
    link: () => null,
    actions: [
      { id: 'done', label: 'Done' },
      { id: 'dismiss', label: 'Dismiss' },
    ],
  },
}

const UNKNOWN = {
  label: 'Unknown task',
  describe: (t) => t.type,
  detail: () => null,
  link: () => null,
  actions: [],
}

export const typeInfo = (type) => TASK_TYPES[type] ?? UNKNOWN
export const describeTask = (t) => typeInfo(t.type).describe(t)
export const actionsFor = (t) => typeInfo(t.type).actions

export function isSnoozed(task, now = new Date()) {
  return Boolean(task.snoozed_until) && new Date(task.snoozed_until) > now
}

export function sortTasks(tasks) {
  return [...tasks].sort(
    (a, b) => (b.priority ?? 0) - (a.priority ?? 0) || new Date(a.created_at) - new Date(b.created_at),
  )
}

export function visibleTasks(tasks, { type = 'all', showSnoozed = false, now = new Date() } = {}) {
  return tasks.filter(
    (t) => t.status === 'open'
      && (type === 'all' || t.type === type)
      && (showSnoozed || !isSnoozed(t, now)),
  )
}

export const openCount = (tasks, now = new Date()) => visibleTasks(tasks, { now }).length

export function countsByType(tasks, now = new Date()) {
  const out = {}
  for (const t of visibleTasks(tasks, { now })) out[t.type] = (out[t.type] ?? 0) + 1
  return out
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/keeperTasks.test.js`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/keeperTasks.js src/lib/keeperTasks.test.js
git commit -m "feat(queue): task registry and pure helpers"
```

---

### Task 3: API wrapper

**Files:**
- Create: `src/lib/keeperTaskApi.js`
- Test: `src/lib/keeperTaskApi.test.js`

**Interfaces:**
- Consumes: `supabase` from `../supabaseClient`; RPC and error names from Task 1.
- Produces:
  - `keeperTaskErrorMessage(error): string`
  - `fetchOpenTasks(): Promise<task[]>` (all `status = 'open'` rows, including snoozed; the tab filters)
  - `resolveTask(id, action, note?): Promise<void>`
  - `snoozeTask(id, days: 1|7): Promise<void>` (computes `until` from `new Date()`)
  - `addManualTask(title, body?): Promise<string>` (new id)

- [ ] **Step 1: Write the failing tests**

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpc = vi.fn()
const selectChain = { select: vi.fn(), eq: vi.fn(), order: vi.fn() }
let selectResult = { data: [], error: null }
const from = vi.fn(() => {
  selectChain.select.mockReturnValue(selectChain)
  selectChain.eq.mockReturnValue(selectChain)
  selectChain.order.mockResolvedValue(selectResult)
  return selectChain
})
vi.mock('../supabaseClient', () => ({ supabase: { rpc: (...a) => rpc(...a), from: (...a) => from(...a) } }))

const api = await import('./keeperTaskApi')

beforeEach(() => { rpc.mockReset(); from.mockClear(); selectResult = { data: [], error: null } })

describe('errors', () => {
  it('turns server error names into plain sentences', () => {
    expect(api.keeperTaskErrorMessage({ message: 'not_open' })).toMatch(/no longer open/i)
    expect(api.keeperTaskErrorMessage({ message: 'not_allowed' })).toMatch(/only keepers/i)
    expect(api.keeperTaskErrorMessage({ message: 'bad_title' })).toMatch(/1 and 120/)
    expect(api.keeperTaskErrorMessage(null)).toBe('Something went wrong.')
    expect(api.keeperTaskErrorMessage({ message: 'odd' })).toBe('odd')
  })
})

describe('calls', () => {
  it('fetchOpenTasks reads open rows', async () => {
    selectResult = { data: [{ id: '1' }], error: null }
    expect(await api.fetchOpenTasks()).toEqual([{ id: '1' }])
    expect(from).toHaveBeenCalledWith('keeper_tasks')
    expect(selectChain.eq).toHaveBeenCalledWith('status', 'open')
  })
  it('resolveTask calls the RPC with the action and note', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    await api.resolveTask('t1', 'done', 'ok')
    expect(rpc).toHaveBeenCalledWith('resolve_keeper_task', { p_id: 't1', p_action: 'done', p_note: 'ok' })
  })
  it('snoozeTask sends a date N days ahead', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    const before = Date.now()
    await api.snoozeTask('t1', 7)
    const { p_until } = rpc.mock.calls[0][1]
    const ms = new Date(p_until).getTime() - before
    expect(ms).toBeGreaterThan(6.9 * 86400000)
    expect(ms).toBeLessThan(7.1 * 86400000)
  })
  it('addManualTask returns the new id', async () => {
    rpc.mockResolvedValue({ data: 'new-id', error: null })
    expect(await api.addManualTask('Do a thing', 'details')).toBe('new-id')
    expect(rpc).toHaveBeenCalledWith('keeper_add_task', { p_title: 'Do a thing', p_body: 'details' })
  })
  it('throws a friendly error when the RPC fails', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'not_open' } })
    await expect(api.resolveTask('t1', 'done')).rejects.toThrow(/no longer open/i)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/keeperTaskApi.test.js`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```js
import { supabase } from '../supabaseClient'

/**
 * Keeper work queue calls. Every write is a keeper RPC from
 * 20261005000000_keeper_tasks.sql that checks mod_can('configure','all') and
 * logs to mod_actions; this file only shapes requests and errors.
 */

const MESSAGES = {
  not_open: 'That task is no longer open. The list has been refreshed.',
  not_found: 'That task no longer exists. The list has been refreshed.',
  unknown_action: "That action isn't available for this task.",
  not_allowed: 'Only keepers can use the work queue.',
  bad_snooze: 'Snooze must be between now and 30 days from now.',
  bad_title: 'A title must be between 1 and 120 characters.',
}

export function keeperTaskErrorMessage(error) {
  if (!error) return 'Something went wrong.'
  return MESSAGES[error.message] ?? error.message ?? 'Something went wrong.'
}

function need() {
  if (!supabase) throw new Error('Supabase not configured')
  return supabase
}

async function call(fn, args) {
  const { data, error } = await need().rpc(fn, args)
  if (error) throw new Error(keeperTaskErrorMessage(error))
  return data
}

export async function fetchOpenTasks() {
  const { data, error } = await need()
    .from('keeper_tasks')
    .select('id, type, target_type, target_id, payload, priority, status, snoozed_until, created_at')
    .eq('status', 'open')
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return data ?? []
}

export const resolveTask = async (id, action, note = null) => {
  await call('resolve_keeper_task', { p_id: id, p_action: action, p_note: note })
}

export const snoozeTask = async (id, days) => {
  const until = new Date(Date.now() + days * 86400000).toISOString()
  await call('snooze_keeper_task', { p_id: id, p_until: until })
}

export const addManualTask = (title, body = null) => call('keeper_add_task', { p_title: title, p_body: body })
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/keeperTaskApi.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/keeperTaskApi.js src/lib/keeperTaskApi.test.js
git commit -m "feat(queue): keeper task API wrapper"
```

---

### Task 4: The Work queue tab

**Files:**
- Create: `src/components/admin/WorkQueueTab.jsx`
- Test: `src/components/admin/WorkQueueTab.test.jsx`

**Interfaces:**
- Consumes: `fetchOpenTasks`, `resolveTask`, `snoozeTask`, `addManualTask` (Task 3); `visibleTasks`, `sortTasks`, `countsByType`, `typeInfo`, `describeTask`, `actionsFor`, `isSnoozed` (Task 2).
- Produces: default export `WorkQueueTab` (no props); query keys `['admin','keeper-tasks']`.

- [ ] **Step 1: Write the failing tests**

```jsx
import { render, screen, fireEvent, cleanup, within, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { test, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

let rows = []
const api = {
  fetchOpenTasks: vi.fn(async () => rows),
  resolveTask: vi.fn(async () => {}),
  snoozeTask: vi.fn(async () => {}),
  addManualTask: vi.fn(async () => 'new-id'),
}
vi.mock('../../lib/keeperTaskApi', () => api)

const WorkQueueTab = (await import('./WorkQueueTab')).default

const NOW = new Date('2026-10-10T12:00:00Z')
const task = (id, over = {}) => ({
  id, type: 'manual', status: 'open', priority: 0, snoozed_until: null,
  created_at: '2026-10-01T00:00:00Z', payload: { title: `Task ${id}` }, ...over,
})

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={qc}><WorkQueueTab /></QueryClientProvider>)
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  rows = []
  Object.values(api).forEach((f) => f.mockClear())
})
afterEach(() => { cleanup(); vi.useRealTimers() })

test('an empty queue says so plainly', async () => {
  renderTab()
  expect(await screen.findByText(/nothing waiting/i)).toBeInTheDocument()
})

test('lists tasks with their type and offers the type\'s actions', async () => {
  rows = [task('a')]
  renderTab()
  const card = await screen.findByRole('listitem')
  expect(within(card).getByText('Task a')).toBeInTheDocument()
  expect(within(card).getByText('To-do')).toBeInTheDocument()
  expect(within(card).getByRole('button', { name: 'Done' })).toBeInTheDocument()
  expect(within(card).getByRole('button', { name: 'Dismiss' })).toBeInTheDocument()
})

test('resolving a task calls the API with its action', async () => {
  rows = [task('a')]
  renderTab()
  fireEvent.click(await screen.findByRole('button', { name: 'Done' }))
  await waitFor(() => expect(api.resolveTask).toHaveBeenCalledWith('a', 'done'))
})

test('snoozing offers 1 and 7 days', async () => {
  rows = [task('a')]
  renderTab()
  fireEvent.click(await screen.findByRole('button', { name: /snooze 7 days/i }))
  await waitFor(() => expect(api.snoozeTask).toHaveBeenCalledWith('a', 7))
  expect(screen.getByRole('button', { name: /snooze 1 day/i })).toBeInTheDocument()
})

test('snoozed tasks are hidden until "show snoozed" is ticked', async () => {
  rows = [task('a'), task('b', { snoozed_until: '2026-10-12T00:00:00Z' })]
  renderTab()
  await screen.findByText('Task a')
  expect(screen.queryByText('Task b')).toBeNull()
  fireEvent.click(screen.getByLabelText(/show snoozed/i))
  expect(await screen.findByText('Task b')).toBeInTheDocument()
})

test('an unknown task type renders plainly, with Snooze but no actions', async () => {
  rows = [task('x', { type: 'from_the_future', payload: {} })]
  renderTab()
  const card = await screen.findByRole('listitem')
  expect(within(card).getByText('Unknown task')).toBeInTheDocument()
  expect(within(card).getByRole('button', { name: /snooze 1 day/i })).toBeInTheDocument()
  expect(within(card).queryByRole('button', { name: 'Done' })).toBeNull()
})

test('the type filter narrows the list', async () => {
  rows = [task('a'), task('t', { type: 'tag_review', payload: {} })]
  renderTab()
  await screen.findByText('Task a')
  fireEvent.change(screen.getByLabelText(/filter by type/i), { target: { value: 'manual' } })
  expect(screen.getByText('Task a')).toBeInTheDocument()
  expect(screen.queryByText('tag_review')).toBeNull()
})

test('adding a to-do needs a title, then calls the API', async () => {
  renderTab()
  await screen.findByText(/nothing waiting/i)
  const add = screen.getByRole('button', { name: /add to-do/i })
  expect(add).toBeDisabled()
  fireEvent.change(screen.getByLabelText(/to-do title/i), { target: { value: 'Renew domain' } })
  expect(add).not.toBeDisabled()
  fireEvent.click(add)
  await waitFor(() => expect(api.addManualTask).toHaveBeenCalledWith('Renew domain', null))
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/admin/WorkQueueTab.test.jsx`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```jsx
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { fetchOpenTasks, resolveTask, snoozeTask, addManualTask } from '../../lib/keeperTaskApi'
import {
  visibleTasks, sortTasks, countsByType, typeInfo, describeTask, actionsFor, isSnoozed, TASK_TYPES,
} from '../../lib/keeperTasks'

/**
 * Keeper work queue. Renders any task from the registry in src/lib/keeperTasks.js.
 * Every write is a keeper RPC that checks the gate and logs to mod_actions; this
 * component only decides what to offer.
 */

export const TASKS_KEY = ['admin', 'keeper-tasks']

const FIELD = 'bg-[var(--color-void)] border border-[var(--color-line)] px-3 py-2 text-sm text-[var(--color-bone)] focus:border-[var(--color-ember)] outline-none'
const btn = 'font-mono text-xs uppercase px-3 py-1 border border-[var(--color-line-hi)] text-[var(--color-bone)] hover:border-[var(--color-bone)] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed'

function TaskCard({ task, busy, onAction, onSnooze }) {
  const info = typeInfo(task.type)
  const detail = info.detail(task)
  const href = info.link(task)
  const snoozed = isSnoozed(task)
  return (
    <li className={`card-surface border p-4 flex flex-col gap-2 ${task.priority === 1 ? 'border-[var(--color-blood)]' : 'border-[var(--color-line-hi)]'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-ash)]">{info.label}</span>
        {task.priority === 1 && <span className="font-mono text-[10px] uppercase text-[var(--color-ember)]">High priority</span>}
        {snoozed && <span className="font-mono text-[10px] uppercase text-[var(--color-ash)]">Snoozed until {new Date(task.snoozed_until).toLocaleDateString()}</span>}
        <span className="ml-auto font-mono text-[10px] text-[var(--color-ash)]">{new Date(task.created_at).toLocaleDateString()}</span>
      </div>
      <p className="font-serif text-sm text-[var(--color-bone)]">{describeTask(task)}</p>
      {detail && <p className="text-xs text-[var(--color-ash)] font-serif whitespace-pre-wrap">{detail}</p>}
      {href && <a href={href} className="self-start text-xs underline text-[var(--color-ember)]">Open</a>}
      <div className="flex flex-wrap items-center gap-2">
        {actionsFor(task).map((a) => (
          <button key={a.id} type="button" className={btn} disabled={busy} onClick={() => onAction(task.id, a.id)}>{a.label}</button>
        ))}
        <span className="flex-1" />
        <button type="button" className={btn} disabled={busy} onClick={() => onSnooze(task.id, 1)}>Snooze 1 day</button>
        <button type="button" className={btn} disabled={busy} onClick={() => onSnooze(task.id, 7)}>Snooze 7 days</button>
      </div>
    </li>
  )
}

export default function WorkQueueTab() {
  const queryClient = useQueryClient()
  const { data: tasks = [], isLoading, error } = useQuery({ queryKey: TASKS_KEY, queryFn: fetchOpenTasks })
  const [type, setType] = useState('all')
  const [showSnoozed, setShowSnoozed] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin', 'keeper-tasks'] })
  const onError = (e) => { toast.error(e.message); refresh() }

  const act = useMutation({
    mutationFn: ({ id, action }) => resolveTask(id, action),
    onSuccess: () => { toast.success('Done'); refresh() },
    onError,
  })
  const snooze = useMutation({
    mutationFn: ({ id, days }) => snoozeTask(id, days),
    onSuccess: () => { toast.success('Snoozed'); refresh() },
    onError,
  })
  const add = useMutation({
    mutationFn: () => addManualTask(title.trim(), body.trim() || null),
    onSuccess: () => { toast.success('Added'); setTitle(''); setBody(''); refresh() },
    onError,
  })

  const busy = act.isPending || snooze.isPending
  const counts = countsByType(tasks)
  const types = [...new Set([...Object.keys(TASK_TYPES), ...tasks.map((t) => t.type)])]
  const shown = sortTasks(visibleTasks(tasks, { type, showSnoozed }))

  if (isLoading) return <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-ash)] animate-pulse">Reading the queue…</p>
  if (error) return <p className="text-sm text-[var(--color-ember)]">{error.message}</p>

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <label className="font-mono text-xs uppercase text-[var(--color-ash)]">
          <span className="sr-only">Filter by type</span>
          <select aria-label="Filter by type" value={type} onChange={(e) => setType(e.target.value)} className={FIELD}>
            <option value="all">All types</option>
            {types.map((t) => (
              <option key={t} value={t}>{typeInfo(t).label} ({counts[t] ?? 0})</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-[var(--color-ash)] cursor-pointer">
          <input type="checkbox" checked={showSnoozed} onChange={(e) => setShowSnoozed(e.target.checked)} />
          Show snoozed
        </label>
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-[var(--color-ash)] font-serif italic">Nothing waiting. The queue is quiet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              busy={busy}
              onAction={(id, action) => act.mutate({ id, action })}
              onSnooze={(id, days) => snooze.mutate({ id, days })}
            />
          ))}
        </ul>
      )}

      <form
        className="card-surface border border-[var(--color-line-hi)] p-4 flex flex-col gap-2"
        onSubmit={(e) => { e.preventDefault(); if (title.trim()) add.mutate() }}
      >
        <span className="font-mono text-xs uppercase tracking-widest text-[var(--color-ash)]">Add a to-do</span>
        <input aria-label="To-do title" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className={FIELD} />
        <textarea aria-label="To-do details" rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Details (optional)" className={FIELD} />
        <button type="submit" className={`${btn} self-start`} disabled={!title.trim() || add.isPending}>Add to-do</button>
      </form>
    </div>
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/components/admin/WorkQueueTab.test.jsx`
Expected: PASS. If the "unknown task type" test fails because `queryByText('tag_review')` also matches the filter `<option>`, the option text is `To-do (…)`/`Unknown task (…)`, so it will not; if it does, tighten the assertion to `screen.queryByRole('listitem', { name: /tag_review/ })`.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/WorkQueueTab.jsx src/components/admin/WorkQueueTab.test.jsx
git commit -m "feat(queue): Work queue tab"
```

---

### Task 5: Wire it into Admin, the Overview and the Audit labels

**Files:**
- Modify: `src/pages-react/Admin.jsx` (import; `tabs` array at ~line 61; panel render at ~line 148)
- Modify: `src/components/admin/AdminOverviewTab.jsx` (new query and card)
- Modify: `src/components/admin/AdminOverviewTab.test.jsx` (mock + two tests)
- Modify: `src/components/admin/AuditTab.jsx` (`ACTION_LABEL`)

**Interfaces:**
- Consumes: `WorkQueueTab` (Task 4); `fetchOpenTasks` (Task 3); `openCount` (Task 2).
- Produces: nothing later tasks rely on.

- [ ] **Step 1: Write the failing Overview tests**

In `AdminOverviewTab.test.jsx`, add this mock beside the others (before the dynamic import):

```jsx
let openTasks = []
let tasksFail = false
vi.mock('../../lib/keeperTaskApi', () => ({
  fetchOpenTasks: vi.fn(async () => {
    if (tasksFail) throw new Error('read failed')
    return openTasks
  }),
}))
```

In `beforeEach` add `openTasks = []; tasksFail = false`. Append:

```jsx
test('shows how many work-queue tasks are waiting, and links to the queue', async () => {
  openTasks = [
    { id: '1', type: 'manual', status: 'open', snoozed_until: null, created_at: '2026-10-01T00:00:00Z' },
    { id: '2', type: 'manual', status: 'open', snoozed_until: null, created_at: '2026-10-02T00:00:00Z' },
  ]
  const nav = renderIt()
  expect(await screen.findByText(/2 tasks waiting/i)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /open the work queue/i }))
  expect(nav).toHaveBeenCalledWith('queue')
})

test('says nothing when the queue is empty or the read fails', async () => {
  renderIt()
  await screen.findByText(/site stats/i)
  await new Promise((r) => setTimeout(r, 0))
  expect(screen.queryByText(/waiting/i)).toBeNull()
  cleanup()
  tasksFail = true
  renderIt()
  await screen.findByText(/site stats/i)
  await new Promise((r) => setTimeout(r, 0))
  expect(screen.queryByText(/waiting/i)).toBeNull()
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/components/admin/AdminOverviewTab.test.jsx`
Expected: the two new tests FAIL (no "tasks waiting" text); the existing four still pass.

- [ ] **Step 3: Implement the Overview card**

In `AdminOverviewTab.jsx` add imports:

```jsx
import { fetchOpenTasks } from '../../lib/keeperTaskApi'
import { openCount } from '../../lib/keeperTasks'
```

Add the query after the `futureRituals` query (undefined until loaded and on error, so a failed read never warns):

```jsx
  const { data: queueTasks } = useQuery({
    queryKey: ['admin', 'keeper-tasks'],
    queryFn: fetchOpenTasks,
    refetchInterval: 60_000,
  })
  const waiting = queueTasks ? openCount(queueTasks) : 0
```

Add this block directly above the `futureRituals` block in the JSX:

```jsx
      {waiting > 0 && (
        <div className="card-surface border border-[var(--color-ember)] p-4 flex flex-col gap-1">
          <span className="font-mono text-xs uppercase tracking-widest text-[var(--color-ember)]">▸ Work queue</span>
          <p className="text-sm text-[var(--color-bone)] font-serif">
            {waiting} {waiting === 1 ? 'task' : 'tasks'} waiting.
          </p>
          <button
            type="button"
            onClick={() => onNavigate?.('queue')}
            className="self-start mt-1 font-mono text-xs uppercase underline text-[var(--color-ash)] hover:text-[var(--color-bone)] cursor-pointer"
          >
            Open the work queue
          </button>
        </div>
      )}
```

- [ ] **Step 4: Wire the tab in `Admin.jsx`**

Add the import beside the other tab imports:

```jsx
import WorkQueueTab from '../components/admin/WorkQueueTab'
```

Add to `tabs`, right after Overview:

```jsx
    { id: 'queue',    label: 'Work queue', show: isKeeper },
```

Add to the panel, after the `overview` line:

```jsx
          {activeId === 'queue' && <WorkQueueTab />}
```

- [ ] **Step 5: Add audit labels**

In `AuditTab.jsx` `ACTION_LABEL`, after `ritual_prompt_rejected`:

```jsx
  keeper_task_added: 'added a work-queue to-do',
  keeper_task_resolved: 'resolved a work-queue task',
  keeper_task_snoozed: 'snoozed a work-queue task',
```

- [ ] **Step 6: Run the whole suite and build**

Run: `npm run test:unit`
Expected: all pass (the previous 418 plus the new tests).

Run: `npm run build`
Expected: completes without error.

- [ ] **Step 7: Commit**

```bash
git add src/pages-react/Admin.jsx src/components/admin/AdminOverviewTab.jsx src/components/admin/AdminOverviewTab.test.jsx src/components/admin/AuditTab.jsx
git commit -m "feat(queue): Work queue tab, Overview count and audit labels"
```

---

### Task 6: Ship it

**Files:** none new.

- [ ] **Step 1: Push and open the PR**

```bash
git push -u origin feat/content-warnings
gh pr create --base main --title "feat(queue): keeper work queue (PR 1 of 3 for content warnings)" --body "<what, evidence, rehearsal result, deploy steps, commands to run>"
```

The PR body must state: the migration rehearsal output (`rehearsal passed`), that `verify-grants.sql` must be run after merge and return zero rows, the commands for Jeff (`npm run test:unit`, `npm run build`), and that merging applies the migration to production.

- [ ] **Step 2: After Jeff merges — verify on production**

1. Run `scripts/sql/verify-grants.sql` in the Supabase SQL editor. Expected: **zero rows**.
2. Check the table exists: `select count(*) from public.keeper_tasks;` returns 0 for the keeper.
3. In Admin, open **Work queue**, add a to-do, snooze it 1 day, show snoozed, un-hide, mark it Done. Confirm Overview shows and clears "1 task waiting", and the Audit tab lists the three actions.
4. Delete the test to-do rows afterwards (Jeff runs the delete; Claude does not delete data).

---

## Self-review

**Spec coverage** (section "Keeper work queue (general)"):
- Table with all listed columns, dedupe over all statuses, no FK on target: Task 1.
- `create_keeper_task` idempotent and service_role only; `resolve_keeper_task`, `snooze_keeper_task`, `close_keeper_tasks_for`: Task 1.
- Keeper-only RLS, no client writes, explicit grants, `verify-grants.sql` zero rows: Task 1 and Task 6.
- Registry with label, description, link, actions; adding a type = one entry + one handler + a create call: Task 2 and the header comments.
- Tab with filter by type, counts per type, snooze 1 or 7 days, Overview count, no claiming: Tasks 4 and 5.
- The three first task types (`tag_review`, `tag_appeal`, `tag_check_failed`) are **intentionally not in this PR**. They need the tag tables and function, so they arrive in PR 2 (server handlers) and PR 3 (registry entries). This PR ships the `manual` type so the queue is useful and testable now.
- Existing queues untouched: yes.

**Placeholder scan:** none; every step has its code or command. The PR body in Task 6 lists required contents rather than prose, to be written at PR time from real results.

**Type consistency:** `resolveTask(id, action, note)` / `snoozeTask(id, days)` / `addManualTask(title, body)` match between Task 3, Task 4 and the tests. RPC arg names (`p_id`, `p_action`, `p_note`, `p_until`, `p_title`, `p_body`) match Task 1. Query key `['admin','keeper-tasks']` is shared by the tab and the Overview, so one cache feeds both and resolving a task refreshes the count. Error names match between SQL and `MESSAGES`.

**Review Focus coverage:** double-create, resolved-never-reopens, race (`not_open`), non-keepers, snooze bounds: Task 1 rehearsal. Unknown type: Task 2 and Task 4 tests.
