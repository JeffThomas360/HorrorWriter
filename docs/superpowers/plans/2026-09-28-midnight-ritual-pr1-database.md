# Midnight Ritual — PR 1 (Database) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the database layer for the Midnight Ritual, plus sealing of drafts on account
deletion. Nothing visible to visitors changes in this PR.

**Architecture:**

- **One migration** adds:
  - `ritual_prompts`, whose writes go only through keeper-gated `SECURITY DEFINER` functions that
    log to `mod_actions`
  - `ritual_drafts`, owner-only under RLS
  - `books.prompt_id`
  - a `SECURITY INVOKER` share function that turns a draft into a story under the caller's own RLS
- **Schedule:** slots are Fridays 03:00 `America/New_York`, computed in SQL.
- **Seals:** the client-side seal format moves to v3 and carries ritual drafts.

**Tech Stack:**

- Postgres 17 (Supabase), plpgsql, RLS
- Vitest (jsdom) for the JS
- SQL behaviour scripts run with `npx supabase db query --linked -f`, inside `begin … rollback`

**Spec:** `docs/superpowers/specs/2026-09-28-midnight-ritual-design.md`

## Global Constraints

- **Weekly slot:** Friday 03:00 `America/New_York`.
- **Word cap:** 500 words, counted as `\S+` tokens, and ≤ 6000 characters.
- **Prompt body:** 10–400 characters after trimming.
- **Released prompt** = `status = 'scheduled' AND goes_live_at <= now()`. Released prompts are
  immutable (no edit, un-schedule or delete).
- **Grants and the allowlist:**
  - Every new function gets explicit `REVOKE`/`GRANT`.
  - Each new client-callable `SECURITY DEFINER` function is added to the allowlist in
    `scripts/sql/verify-grants.sql`, with its reason.
  - `verify-grants.sql` must return zero rows.
- **Keeper check:** `public.mod_can('configure','all')`.
- **Audit:** `mod_actions(actor_id, action, target_type, target_id, reason, metadata)`, with
  `target_type = 'ritual_prompt'`.
- **No UPDATE/INSERT/DELETE policies on `ritual_prompts`.** Mirror `site_settings`.
- **Deletions are real deletes** (Jeff's deletion policy).
- **Never use MCP `apply_migration`.** The migration applies on merge via the Supabase GitHub
  integration. Before the PR, rehearse it inside `begin … rollback` against `--linked`.
- **The migration ends with `notify pgrst, 'reload schema';`.**
- **Migration file:** `supabase/migrations/20260930000000_midnight_ritual.sql`, since the latest
  existing one is `20260929000000`.
- **Rehearsal combines** each test script with the migration, using the helper in Task 1.
- **`npx` from PowerShell must be prefixed with `cmd /c`.**

## Review Focus

1. **Crossing daylight-saving time.** A slot computed across the 2026-11-01 fall-back must stay at
   03:00 New York (08:00 UTC after, 07:00 UTC before). *Pinned in Task 2's slot assertions.*
2. **Two approvals in a row, then un-scheduling the first.** The second must move into the first
   free slot, and the unique slot constraint must not fire mid-repack. *Pinned in Task 2
   (deferrable unique plus repack assertions).*
3. **A share that fails partway** (empty title) must leave the draft exactly as it was. *Pinned in
   Task 3.*
4. **A restored v2 seal (no `rituals` key), and a v3 seal whose draft's prompt the writer already
   has a draft for.** The first must restore normally; the second must be skipped, not throw.
   *Pinned in Task 5.*
5. **A banned member, and a draft aimed at a future (unreleased) prompt.** Both must be refused by
   the database, not just the UI. *Pinned in Task 3.*

---

## File structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20260930000000_midnight_ritual.sql` (create) | Tables, RLS, `books.prompt_id`, all functions, grants |
| `scripts/sql/test-rituals.sql` (create) | Behaviour test for everything in the migration (rolls back) |
| `scripts/sql/rehearse.ps1` (create) | Runs a test script with a not-yet-merged migration spliced in after `begin;` |
| `scripts/sql/verify-grants.sql` (modify) | Allowlist the six new client-callable definer functions |
| `scripts/sql/test-delete-member.sql` (modify) | Drafts are erased with the account |
| `src/lib/sealCollect.js` (modify) | Seal payload v3: `rituals`, `STORY_FIELDS += prompt_id` |
| `src/lib/sealCollect.test.js` (modify) | v3 tests; v2 still restores |
| `src/components/SealedWritingPrompt.jsx` (modify) | "N private drafts are back" line |
| `src/components/SealedWritingPrompt.test.jsx` (modify) | Test for that line |

**Deviation from the spec:** `ritual_list_queue()` is dropped. The keeper SELECT policy already
lets the admin tab read pending and future rows directly, so a function would only duplicate it.

---

### Task 1: Rehearsal helper and failing test skeleton

**Files:**
- Create: `scripts/sql/rehearse.ps1`
- Create: `scripts/sql/test-rituals.sql` (skeleton; filled in by Tasks 2 and 3)

**Interfaces:**
- Produces: `powershell -File scripts/sql/rehearse.ps1 -Test <sql> -Migration <sql>`. It prints
  the query result and exits non-zero on an SQL error.

- [ ] **Step 1: Write the helper**

```powershell
# scripts/sql/rehearse.ps1
# Runs a behaviour test against the LINKED (production) project with a not-yet-merged
# migration spliced in right after the test's own `begin;`. The test ends in `rollback;`,
# so nothing is kept. Use before opening a PR that carries a migration.
param(
  [Parameter(Mandatory)] [string] $Test,
  [Parameter(Mandatory)] [string] $Migration
)
$ErrorActionPreference = 'Stop'
$testSql = Get-Content -Raw $Test
$migSql  = Get-Content -Raw $Migration
if ($testSql -notmatch '(?m)^begin;\r?$') { throw "$Test has no line 'begin;' to splice after" }
if ($testSql -notmatch '(?m)^rollback;\r?\s*$') { throw "$Test does not end in rollback; refusing to run" }
$combined = [regex]::new('(?m)^begin;\r?$').Replace($testSql, "begin;`n$migSql`n", 1)
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("rehearse-" + [guid]::NewGuid() + ".sql")
Set-Content -Encoding utf8NoBOM -Path $tmp -Value $combined
try {
  cmd /c "npx supabase db query --linked -f `"$tmp`""
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally { Remove-Item $tmp -ErrorAction SilentlyContinue }
```

- [ ] **Step 2: Write the test skeleton, which references the not-yet-existing table**

```sql
-- scripts/sql/test-rituals.sql
-- Behaviour test for 20260930000000_midnight_ritual.sql. Rolls back; nothing is kept.
-- Success = final row 'ALL PASS'. Any failure raises 'FAIL: ...'.
-- After merge:  npx supabase db query --linked -f scripts/sql/test-rituals.sql
-- Before merge: powershell -File scripts/sql/rehearse.ps1 -Test scripts/sql/test-rituals.sql -Migration supabase/migrations/20260930000000_midnight_ritual.sql
begin;

do $$ begin
  if to_regclass('public.ritual_prompts') is null then raise exception 'FAIL: ritual_prompts missing'; end if;
end $$;

-- @@TASK2@@
-- @@TASK3@@

select 'ALL PASS' as result;
rollback;
```

(The `@@TASK2@@` / `@@TASK3@@` lines are literal markers that Tasks 2 and 3 replace with test
blocks. They are SQL comments, so the file runs as is.)

- [ ] **Step 3: Run it without a migration to see it fail**

Run: `cmd /c "npx supabase db query --linked -f scripts/sql/test-rituals.sql"`
Expected: an error containing `FAIL: ritual_prompts missing`.

- [ ] **Step 4: Commit**

```bash
git add scripts/sql/rehearse.ps1 scripts/sql/test-rituals.sql
git commit -m "test(ritual): rehearsal helper and failing behaviour-test skeleton"
```

---

### Task 2: Prompts table, slot schedule and keeper functions

**Files:**
- Create: `supabase/migrations/20260930000000_midnight_ritual.sql` (prompts part)
- Modify: `scripts/sql/test-rituals.sql` (replace `-- @@TASK2@@`)
- Modify: `scripts/sql/verify-grants.sql` (allowlist)

**Interfaces:**
- Produces, as SQL functions:
  - `public.ritual_slot_after(timestamptz) → timestamptz`
  - `public.ritual_add_prompt(p_body text) → uuid`
  - `public.ritual_edit_prompt(p_id uuid, p_body text) → void`
  - `public.ritual_approve_prompt(p_id uuid) → timestamptz` (the slot)
  - `public.ritual_unschedule_prompt(p_id uuid) → void`
  - `public.ritual_reject_prompt(p_id uuid) → void`
  - `public.ritual_next_unlock() → timestamptz`
- **Errors:**

  | errcode | message | meaning |
  |---|---|---|
  | `42501` | `not_allowed` | caller is not a keeper |
  | `P0002` | `not_found` | no such prompt |
  | `HW010` | `released` | the prompt is released and locked |
  | `HW011` | `not_pending` | the action needs a pending prompt |
  | `HW012` | `not_scheduled` | the action needs a scheduled prompt |

- [ ] **Step 1: Write the failing tests.** Replace `-- @@TASK2@@` in `test-rituals.sql` with:

```sql
-- ── Setup (as postgres) ────────────────────────────────────────────────────
insert into auth.users (id, email, aud, role, instance_id) values
  ('00000000-0000-4000-8000-00000000e101', 'ritual-keeper@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-4000-8000-00000000e102', 'ritual-a@example.test',      'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-4000-8000-00000000e103', 'ritual-b@example.test',      'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-4000-8000-00000000e104', 'ritual-banned@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
update public.profiles set mod_role = 'keeper' where id = '00000000-0000-4000-8000-00000000e101';
update public.profiles set banned_until = now() + interval '1 day' where id = '00000000-0000-4000-8000-00000000e104';

-- One released prompt (R) and one pending prompt (P1), inserted directly.
insert into public.ritual_prompts (id, body, status, goes_live_at, source) values
  ('00000000-0000-4000-8000-0000000f0001', 'A released prompt, for testing only.', 'scheduled', now() - interval '1 day', 'keeper'),
  ('00000000-0000-4000-8000-0000000f0002', 'A pending prompt, for testing only.',  'pending',   null,                     'ai');

-- ── Slots: Fridays 03:00 America/New_York, across DST ──────────────────────
do $$ begin
  -- Thu 1 Oct 2026 12:00 UTC -> Fri 2 Oct 03:00 EDT = 07:00 UTC
  if public.ritual_slot_after('2026-10-01 12:00+00') <> '2026-10-02 07:00+00' then
    raise exception 'FAIL: slot after Thu 1 Oct is %', public.ritual_slot_after('2026-10-01 12:00+00'); end if;
  -- Exactly on a slot -> the NEXT week
  if public.ritual_slot_after('2026-10-02 07:00+00') <> '2026-10-09 07:00+00' then
    raise exception 'FAIL: a slot boundary must roll to next week'; end if;
  -- Fri 2 Oct 02:59 EDT -> same day 03:00
  if public.ritual_slot_after('2026-10-02 06:59+00') <> '2026-10-02 07:00+00' then
    raise exception 'FAIL: just before 03:00 should give the same day'; end if;
  -- Across fall-back (1 Nov 2026): Fri 30 Oct slot -> Fri 6 Nov 03:00 EST = 08:00 UTC
  if public.ritual_slot_after('2026-10-30 07:00+00') <> '2026-11-06 08:00+00' then
    raise exception 'FAIL: DST fall-back slot is %', public.ritual_slot_after('2026-10-30 07:00+00'); end if;
end $$;

-- ── anon sees only released prompts ────────────────────────────────────────
set local role anon;
do $$ begin
  if (select count(*) from public.ritual_prompts where id in ('00000000-0000-4000-8000-0000000f0001','00000000-0000-4000-8000-0000000f0002')) <> 1 then
    raise exception 'FAIL: anon must see the released prompt and not the pending one'; end if;
  if public.ritual_next_unlock() is not null then
    raise exception 'FAIL: next unlock should be null with nothing scheduled ahead'; end if;
end $$;
reset role;

-- ── a non-keeper can't manage prompts ──────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000e102","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  begin
    perform public.ritual_add_prompt('A prompt from someone who is not a keeper.');
    raise exception 'FAIL: non-keeper added a prompt';
  exception when insufficient_privilege then null; end;
  if exists (select 1 from public.ritual_prompts where id = '00000000-0000-4000-8000-0000000f0002') then
    raise exception 'FAIL: non-keeper can read a pending prompt'; end if;
end $$;
reset role;

-- ── the keeper queue: add, approve, pack, unschedule, lock, reject ─────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000e101","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  p2 uuid; s1 timestamptz; s2 timestamptz;
begin
  p2 := public.ritual_add_prompt('  A keeper-written prompt for the test.  ');
  if (select body from public.ritual_prompts where id = p2) <> 'A keeper-written prompt for the test.' then
    raise exception 'FAIL: added prompt body not trimmed'; end if;

  s1 := public.ritual_approve_prompt('00000000-0000-4000-8000-0000000f0002');
  s2 := public.ritual_approve_prompt(p2);
  if s1 <> public.ritual_slot_after(now()) then raise exception 'FAIL: first approval should take the first free slot'; end if;
  if s2 <> public.ritual_slot_after(s1) then raise exception 'FAIL: second approval should take the following slot'; end if;

  -- Un-scheduling the first moves the second up into its slot.
  perform public.ritual_unschedule_prompt('00000000-0000-4000-8000-0000000f0002');
  if (select goes_live_at from public.ritual_prompts where id = p2) <> s1 then
    raise exception 'FAIL: later prompt did not move up after unschedule'; end if;
  if (select status from public.ritual_prompts where id = '00000000-0000-4000-8000-0000000f0002') <> 'pending' then
    raise exception 'FAIL: unscheduled prompt is not pending'; end if;

  -- A released prompt is locked.
  begin
    perform public.ritual_edit_prompt('00000000-0000-4000-8000-0000000f0001', 'Trying to change a released prompt.');
    raise exception 'FAIL: edited a released prompt';
  exception when sqlstate 'HW010' then null; end;
  begin
    perform public.ritual_unschedule_prompt('00000000-0000-4000-8000-0000000f0001');
    raise exception 'FAIL: unscheduled a released prompt';
  exception when sqlstate 'HW010' then null; end;
  -- Only pending prompts can be rejected.
  begin
    perform public.ritual_reject_prompt(p2);
    raise exception 'FAIL: rejected a scheduled prompt';
  exception when sqlstate 'HW011' then null; end;

  perform public.ritual_edit_prompt('00000000-0000-4000-8000-0000000f0002', 'An edited pending prompt for the test.');
  perform public.ritual_reject_prompt('00000000-0000-4000-8000-0000000f0002');
  if exists (select 1 from public.ritual_prompts where id = '00000000-0000-4000-8000-0000000f0002') then
    raise exception 'FAIL: rejected prompt was not deleted'; end if;

  if (select count(*) from public.mod_actions
      where actor_id = '00000000-0000-4000-8000-00000000e101' and target_type = 'ritual_prompt') < 6 then
    raise exception 'FAIL: keeper actions were not all audited'; end if;
end $$;
reset role;

-- anon: the scheduled-but-future prompt stays invisible; its unlock time does not.
set local role anon;
do $$ begin
  if exists (select 1 from public.ritual_prompts where goes_live_at > now()) then
    raise exception 'FAIL: anon can read a future prompt'; end if;
  if public.ritual_next_unlock() <> public.ritual_slot_after(now()) then
    raise exception 'FAIL: next unlock is wrong'; end if;
end $$;
reset role;

-- ── grants ─────────────────────────────────────────────────────────────────
do $$ begin
  if has_function_privilege('anon', 'public.ritual_add_prompt(text)', 'execute') then
    raise exception 'FAIL: anon can call ritual_add_prompt'; end if;
  if has_function_privilege('authenticated', 'public.ritual_slot_after(timestamptz)', 'execute')
     or has_function_privilege('authenticated', 'public.ritual_repack()', 'execute') then
    raise exception 'FAIL: internal ritual helpers are client-callable'; end if;
end $$;
```

- [ ] **Step 2: Run to verify it fails**

Run: `cmd /c "npx supabase db query --linked -f scripts/sql/test-rituals.sql"`
Expected: an error containing `FAIL: ritual_prompts missing`. There's no migration yet.

- [ ] **Step 3: Write the migration's prompts part.** Create
`supabase/migrations/20260930000000_midnight_ritual.sql`:

```sql
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

-- @@DRAFTS@@

notify pgrst, 'reload schema';
```

(`-- @@DRAFTS@@` is a literal marker that Task 3 replaces.)

- [ ] **Step 4: Allowlist the new definer functions.** In `scripts/sql/verify-grants.sql`, add
these lines after the `('set_role_badge', …)` line. Put a comma after `set_role_badge`'s
closing parenthesis, and none after the last new line:

```sql
  -- Midnight Ritual (20260930000000). Keeper RPCs: each calls ritual_require_keeper()
  -- = mod_can(configure, all) and logs to mod_actions.
  ('ritual_add_prompt',        'authenticated', 'keeper RPC, mod_can(configure, all)'),
  ('ritual_edit_prompt',       'authenticated', 'keeper RPC, mod_can(configure, all)'),
  ('ritual_approve_prompt',    'authenticated', 'keeper RPC, mod_can(configure, all)'),
  ('ritual_unschedule_prompt', 'authenticated', 'keeper RPC, mod_can(configure, all)'),
  ('ritual_reject_prompt',     'authenticated', 'keeper RPC, mod_can(configure, all)'),
  -- Public by design: the next unlock TIME, never the prompt text.
  ('ritual_next_unlock',       'anon',          'next weekly unlock time for the home countdown'),
  ('ritual_next_unlock',       'authenticated', 'next weekly unlock time for the home countdown')
```

- [ ] **Step 5: Rehearse to verify the prompt tests pass**

Run: `powershell -File scripts/sql/rehearse.ps1 -Test scripts/sql/test-rituals.sql -Migration supabase/migrations/20260930000000_midnight_ritual.sql`
Expected: a result row `"result": "ALL PASS"`.

- **If `update profiles set mod_role` is refused** by a guard trigger: the self-escalation guard
  from `20260924000000` compares against `auth.uid()`, which is null here, so it shouldn't be.
  If it is, set `select set_config('app.allow_role_change','on',true)` or whatever that
  migration's bypass is. Read the migration; don't guess.
- **If `set local role` is refused** for the CLI login role: prefix the file with
  `set local role postgres;` right after `begin;`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260930000000_midnight_ritual.sql scripts/sql/test-rituals.sql scripts/sql/verify-grants.sql
git commit -m "feat(ritual): prompts table, weekly slot schedule, keeper functions"
```

---

### Task 3: Drafts, `books.prompt_id` and sharing

**Files:**
- Modify: `supabase/migrations/20260930000000_midnight_ritual.sql` (replace `-- @@DRAFTS@@`)
- Modify: `scripts/sql/test-rituals.sql` (replace `-- @@TASK3@@`)

**Interfaces:**
- Consumes: `ritual_prompts` and the released-read RLS from Task 2.
- Produces:
  - table `public.ritual_drafts(id, author_id, prompt_id, content, created_at, updated_at)`,
    UNIQUE (`author_id`, `prompt_id`)
  - column `public.books.prompt_id uuid null`
  - `public.share_ritual_draft(p_draft_id uuid, p_title text) → uuid` (the new book id). Errors:
    `HW013 bad_title`, `P0002 not_found`.

- [ ] **Step 1: Write the failing tests.** Replace `-- @@TASK3@@` with:

```sql
-- ── Drafts: owner-only, released prompts only, 500 words, bans ─────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000e102","role":"authenticated"}', true);
set local role authenticated;
do $$
declare d uuid;
begin
  insert into public.ritual_drafts (prompt_id, content)
  values ('00000000-0000-4000-8000-0000000f0001', 'The mirror blinked first, and I pretended not to notice.')
  returning id into d;
  if (select author_id from public.ritual_drafts where id = d) <> '00000000-0000-4000-8000-00000000e102' then
    raise exception 'FAIL: draft author was not defaulted to the caller'; end if;

  -- An unknown prompt id can't be drafted to (RLS `exists` fails first -> 42501).
  begin
    insert into public.ritual_drafts (prompt_id, content)
    values (gen_random_uuid(), 'Aimed at a prompt that does not exist.');
    raise exception 'FAIL: drafted to an unknown prompt';
  exception when insufficient_privilege or foreign_key_violation then null; end;

  -- 501 words is refused.
  begin
    update public.ritual_drafts set content = repeat('word ', 501) where id = d;
    raise exception 'FAIL: 501-word draft accepted';
  exception when check_violation then null; end;

  -- A second draft for the same prompt is refused.
  begin
    insert into public.ritual_drafts (prompt_id, content)
    values ('00000000-0000-4000-8000-0000000f0001', 'A second draft for the same prompt.');
    raise exception 'FAIL: two drafts for one prompt';
  exception when unique_violation then null; end;
end $$;
reset role;

-- Writer B can't see or change writer A's draft.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000e103","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  if exists (select 1 from public.ritual_drafts) then raise exception 'FAIL: B can read A''s draft'; end if;
  update public.ritual_drafts set content = 'hijacked' where true;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: B changed A''s draft'; end if;
end $$;
reset role;

-- A banned member can't draft.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000e104","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  begin
    insert into public.ritual_drafts (prompt_id, content)
    values ('00000000-0000-4000-8000-0000000f0001', 'Written while banned.');
    raise exception 'FAIL: banned member drafted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- The unreleased-prompt rule, tested with the real future prompt the keeper block
-- scheduled. Its id is read as postgres (writers can't see it) and handed over in a GUC.
select set_config('test.future_prompt',
  (select id::text from public.ritual_prompts where goes_live_at > now() order by goes_live_at limit 1), true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000e103","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  if nullif(current_setting('test.future_prompt', true), '') is null then
    raise exception 'FAIL: test setup expected a future prompt from the keeper block'; end if;
  begin
    insert into public.ritual_drafts (prompt_id, content)
    values (current_setting('test.future_prompt')::uuid, 'Writing before the unlock.');
    raise exception 'FAIL: drafted to a future prompt';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- ── Share: atomic, becomes a normal story ──────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000e102","role":"authenticated"}', true);
set local role authenticated;
do $$
declare d uuid; b uuid;
begin
  select id into d from public.ritual_drafts limit 1;

  begin
    perform public.share_ritual_draft(d, '   ');
    raise exception 'FAIL: shared with a blank title';
  exception when sqlstate 'HW013' then null; end;
  if not exists (select 1 from public.ritual_drafts where id = d) then
    raise exception 'FAIL: failed share lost the draft'; end if;

  b := public.share_ritual_draft(d, '  The Blink  ');
  if not exists (select 1 from public.books where id = b and title = 'The Blink'
                 and prompt_id = '00000000-0000-4000-8000-0000000f0001'
                 and author_id = '00000000-0000-4000-8000-00000000e102'
                 and content like 'The mirror blinked first%' and lede <> '') then
    raise exception 'FAIL: shared story is wrong'; end if;
  if exists (select 1 from public.ritual_drafts where id = d) then
    raise exception 'FAIL: draft still exists after sharing'; end if;
end $$;
reset role;

-- A released prompt with a story attached can't be deleted.
do $$ begin
  begin
    delete from public.ritual_prompts where id = '00000000-0000-4000-8000-0000000f0001';
    raise exception 'FAIL: deleted a prompt that has a story';
  exception when foreign_key_violation then null; end;
end $$;
```

- [ ] **Step 2: Rehearse to verify it fails**

Run: `powershell -File scripts/sql/rehearse.ps1 -Test scripts/sql/test-rituals.sql -Migration supabase/migrations/20260930000000_midnight_ritual.sql`
Expected: an error that `relation "public.ritual_drafts" does not exist`.

- [ ] **Step 3: Implement.** Replace `-- @@DRAFTS@@` in the migration with:

```sql
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
```


- [ ] **Step 4: Rehearse to verify it passes**

Run: `powershell -File scripts/sql/rehearse.ps1 -Test scripts/sql/test-rituals.sql -Migration supabase/migrations/20260930000000_midnight_ritual.sql`
Expected: `"result": "ALL PASS"`.

- [ ] **Step 5: Rehearse the grant check with the migration applied**

Run: `powershell -File scripts/sql/rehearse.ps1 -Test <tmp>` where `<tmp>` is `verify-grants.sql`
wrapped as `begin;` + file + `rollback;`. Write that wrapper to the scratchpad; don't commit it.
Expected: `"rows": []`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260930000000_midnight_ritual.sql scripts/sql/test-rituals.sql
git commit -m "feat(ritual): private drafts, books.prompt_id, atomic share"
```

---

### Task 4: Drafts are erased with the account

**Files:**
- Modify: `scripts/sql/test-delete-member.sql`

- [ ] **Step 1: Add the failing assertion.**
  - After the `insert into public.mod_notes …` statement (line 31), add:

```sql
-- A released prompt and a private ritual draft for the leaver (20260930000000).
insert into public.ritual_prompts (id, body, status, goes_live_at, source) values
  ('00000000-0000-4000-8000-0000000f00d1', 'A prompt the leaver drafted to, for testing.', 'scheduled', now() - interval '1 day', 'keeper');
insert into public.ritual_drafts (author_id, prompt_id, content) values
  ('00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-0000000f00d1', 'A private draft that must go with the account.');
```

  - Inside the main assertion block, after the `series survived` check, add:

```sql
  if exists (select 1 from public.ritual_drafts where author_id = '00000000-0000-4000-8000-00000000d001'
             or content = 'A private draft that must go with the account.') then
    raise exception 'FAIL: ritual draft survived account erasure'; end if;
```

- [ ] **Step 2: Run without the migration to see it fail**

Run: `cmd /c "npx supabase db query --linked -f scripts/sql/test-delete-member.sql"`
Expected: an error that `relation "public.ritual_prompts" does not exist`.

- [ ] **Step 3: Rehearse with the migration to see it pass**

Run: `powershell -File scripts/sql/rehearse.ps1 -Test scripts/sql/test-delete-member.sql -Migration supabase/migrations/20260930000000_midnight_ritual.sql`
Expected: `"result": "ALL PASS"`. The FK cascade does the erasing; no trigger change is needed.

- [ ] **Step 4: Commit**

```bash
git add scripts/sql/test-delete-member.sql
git commit -m "test(delete-member): ritual drafts are erased with the account"
```

---

### Task 5: Seal payload v3 carries ritual drafts

**Files:**
- Modify: `src/lib/sealCollect.js`
- Test: `src/lib/sealCollect.test.js`

**Interfaces:**
- Produces:
  - `buildPayload(books, series, seriesBooks, profile, drafts = [])` returns `{ v: 3, identity,
    stories, series, rituals: [{ prompt_id, content, created_at, updated_at }] }`.
  - `planRestore(...)` returns `{ missingStories, missingSeries, missingDrafts, missing, empty }`.
  - `restoreWriting(...)` returns `{ stories, series, drafts, skipped }`.
  - Accepted payload versions: 1, 2 and 3.

- [ ] **Step 1: Write the failing tests.** In `sealCollect.test.js`:

  **(a) Extend the fake client.** Add these options to `fakeRestoreClient`:
  `existingDrafts = []` and `conflictingDraftPromptIds = []`. Add `ritual_drafts: []` to the
  `inserted` object, and add this branch before the `profiles` branch:

```js
      if (table === 'ritual_drafts') {
        return {
          select: () => ({ eq: () => Promise.resolve({ data: existingDrafts, error: null }) }),
          insert: (row) => {
            if (conflictingDraftPromptIds.includes(row.prompt_id)) {
              return { then: (resolve) => resolve({ error: { code: '23505', message: 'duplicate key' } }) }
            }
            inserted.ritual_drafts.push({ id: `ritual_drafts-${++n}`, ...row })
            return { then: (resolve) => resolve({ error: null }) }
          },
        }
      }
```

  **(b) Update the existing expectations to the new shapes:**
  - `is versioned` now expects `toBe(3)`.
  - Both "unrecognized payload version" tests use `v: 4` instead of `v: 3`.
  - Every `restoreWriting` result `toEqual` gains `drafts: 0`. For example,
    `{ stories: 1, series: 1, skipped: 0 }` becomes
    `{ stories: 1, series: 1, drafts: 0, skipped: 0 }`. There are 6 occurrences.
  - Every `planRestore` result `toEqual` gains `missingDrafts: 0`. There are 4 occurrences.

  **(c) In `collectWriting`'s `makeSupabase`**, add a `ritual_drafts` branch that returns
  `{ select: () => ({ eq: () => Promise.resolve({ data: drafts, error: null }) }) }`, where
  `drafts` is a new option defaulting to `[]`. Then add these tests:

```js
describe('seal v3: ritual drafts', () => {
  const draft = { prompt_id: 'p1', content: 'The mirror blinked first.', created_at: 't1', updated_at: 't2', id: 'd1', author_id: 'u' }

  it('buildPayload carries drafts with only allowlisted fields', () => {
    const p = buildPayload([], [], [], null, [draft])
    expect(p.rituals).toEqual([{ prompt_id: 'p1', content: 'The mirror blinked first.', created_at: 't1', updated_at: 't2' }])
  })

  it('buildPayload keeps a story\'s prompt link', () => {
    const p = buildPayload([{ id: 'b1', title: 'T', mod_status: 'live', prompt_id: 'p1' }], [], [], null)
    expect(p.stories[0].prompt_id).toBe('p1')
  })

  it('restores drafts and reports them', async () => {
    const client = fakeRestoreClient()
    const result = await restoreWriting(client, 'new-user', { v: 3, stories: [], series: [], rituals: [{ prompt_id: 'p1', content: 'C', created_at: 't1', updated_at: 't2', author_id: 'attacker', id: 'x' }] })
    expect(result).toEqual({ stories: 0, series: 0, drafts: 1, skipped: 0 })
    expect(client.inserted.ritual_drafts[0]).toEqual({ id: expect.any(String), prompt_id: 'p1', content: 'C', created_at: 't1', updated_at: 't2', author_id: 'new-user' })
  })

  it('skips a draft whose prompt the writer already has a draft for', async () => {
    const client = fakeRestoreClient({ existingDrafts: [{ prompt_id: 'p1' }] })
    const result = await restoreWriting(client, 'new-user', { v: 3, stories: [], series: [], rituals: [{ prompt_id: 'p1', content: 'C', created_at: 't1', updated_at: 't2' }] })
    expect(result).toEqual({ stories: 0, series: 0, drafts: 0, skipped: 1 })
    expect(client.inserted.ritual_drafts).toEqual([])
  })

  it('treats a duplicate-key race on insert as skipped, not an error', async () => {
    const client = fakeRestoreClient({ conflictingDraftPromptIds: ['p1'] })
    const result = await restoreWriting(client, 'new-user', { v: 3, stories: [], series: [], rituals: [{ prompt_id: 'p1', content: 'C', created_at: 't1', updated_at: 't2' }] })
    expect(result).toEqual({ stories: 0, series: 0, drafts: 0, skipped: 1 })
  })

  it('planRestore counts missing drafts, and a drafts-only seal is not empty', async () => {
    const plan = await planRestore(fakeRestoreClient(), 'new-user', { v: 3, stories: [], series: [], rituals: [{ prompt_id: 'p1', content: 'C' }] })
    expect(plan).toEqual({ missingStories: 0, missingSeries: 0, missingDrafts: 1, missing: true, empty: false })
  })

  it('a v2 payload (no rituals) still restores', async () => {
    const client = fakeRestoreClient()
    const result = await restoreWriting(client, 'new-user', { v: 2, stories: [], series: [] })
    expect(result).toEqual({ stories: 0, series: 0, drafts: 0, skipped: 0 })
  })
})
```

  And in the `collectWriting` describe:

```js
  it('collects the member\'s ritual drafts', async () => {
    const supabase = makeSupabase({ drafts: [{ prompt_id: 'p1', content: 'C', created_at: 't1', updated_at: 't2' }] })
    const payload = await collectWriting(supabase, 'user-1')
    expect(payload.rituals).toHaveLength(1)
    expect(supabase.from).toHaveBeenCalledWith('ritual_drafts')
  })
```

- [ ] **Step 2: Run to verify they fail**

Run: `cmd /c "npx vitest run src/lib/sealCollect.test.js"`
Expected: FAIL. Among other failures, `rituals` is undefined and the version is 2.

- [ ] **Step 3: Implement in `src/lib/sealCollect.js`**

```js
// What goes into a sealed bundle. Moderation-removed ('hidden') stories never do.
const STORY_FIELDS = ['title', 'lede', 'content', 'cover', 'badge', 'mod_status', 'created_at', 'updated_at', 'version', 'prompt_id']
// Private Midnight Ritual drafts (20260930000000). Sealed so a returning writer gets their notebook back.
const RITUAL_FIELDS = ['prompt_id', 'content', 'created_at', 'updated_at']

export const PAYLOAD_VERSION = 3

export function buildPayload(books, series, seriesBooks, profile, drafts = []) {
  const kept = books.filter((b) => b.mod_status !== 'hidden')
  const keptIds = new Set(kept.map((b) => b.id))
  return {
    v: PAYLOAD_VERSION,
    identity: profile ? { handle: profile.handle ?? null, display_name: profile.display_name ?? null } : null,
    stories: kept.map((b) => ({ key: b.id, ...Object.fromEntries(STORY_FIELDS.map((f) => [f, b[f] ?? null])) })),
    series: series.map((s) => ({
      title: s.title,
      description: s.description ?? null,
      created_at: s.created_at,
      parts: seriesBooks
        .filter((sb) => sb.series_id === s.id && keptIds.has(sb.book_id))
        .map((sb) => ({ story_key: sb.book_id, sort_order: sb.sort_order })),
    })),
    rituals: drafts.map((d) => Object.fromEntries(RITUAL_FIELDS.map((f) => [f, d[f] ?? null]))),
  }
}
```

Then make these changes:

- **`collectWriting`:** add a fourth query to the `Promise.all`:

```js
    supabase.from('ritual_drafts').select(RITUAL_FIELDS.join(', ')).eq('author_id', userId),
```

  Destructure it as `drafts`, add `if (drafts.error) throw drafts.error`, and pass
  `drafts.data ?? []` as the fifth argument to `buildPayload`.

- **`checkPayloadVersion`:** `if (![1, 2, 3].includes(payload.v)) throw new Error('unsupported-payload')`

- **Add** below `readExistingSeries`:

```js
async function readExistingDraftPrompts(supabase, userId) {
  const { data, error } = await supabase.from('ritual_drafts').select('prompt_id').eq('author_id', userId)
  if (error) throw error
  return new Set((data ?? []).map((d) => d.prompt_id))
}
```

- **`planRestore`:** after computing `missingSeries`, add:

```js
  const rituals = payload.rituals ?? []
  const draftPrompts = rituals.length ? await readExistingDraftPrompts(supabase, userId) : new Set()
  const missingDrafts = rituals.filter((d) => d?.prompt_id && !draftPrompts.has(d.prompt_id)).length
  return {
    missingStories,
    missingSeries,
    missingDrafts,
    missing: missingStories + missingSeries + missingDrafts > 0,
    empty: stories.length === 0 && seriesTitles.size === 0 && rituals.length === 0,
  }
```

- **`restoreWriting`:** before `return`, add:

```js
  // Drafts last: one per prompt, so an existing draft for the same prompt wins
  // (never overwritten), and a unique-key race on insert counts as skipped.
  let drafts = 0
  const rituals = payload.rituals ?? []
  const draftPrompts = rituals.length ? await readExistingDraftPrompts(supabase, userId) : new Set()
  for (const d of rituals) {
    if (!d?.prompt_id || draftPrompts.has(d.prompt_id)) {
      skipped++
      continue
    }
    const row = Object.fromEntries(RITUAL_FIELDS.filter((f) => f in d).map((f) => [f, d[f]]))
    const { error } = await supabase.from('ritual_drafts').insert({ ...row, author_id: userId })
    if (error && error.code !== '23505') throw error
    if (error) {
      skipped++
      continue
    }
    draftPrompts.add(d.prompt_id)
    drafts++
  }
```

  and change the return to `return { stories, series, drafts, skipped }`. Update the JSDoc
  above `restoreWriting` with one line: "Ritual drafts are skipped when a draft for the same
  prompt already exists."

- [ ] **Step 4: Run to verify they pass**

Run: `cmd /c "npx vitest run src/lib/sealCollect.test.js"`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sealCollect.js src/lib/sealCollect.test.js
git commit -m "feat(seal): payload v3 carries Midnight Ritual drafts; v1/v2 still restore"
```

---

### Task 6: Restore message mentions drafts

**Files:**
- Modify: `src/components/SealedWritingPrompt.jsx:176-186`
- Test: `src/components/SealedWritingPrompt.test.jsx`

- [ ] **Step 1: Write the failing test.** Append it after the `uses singular story/series
counts` test:

```js
test('mentions restored private ritual drafts', async () => {
  invoke.mockImplementation(async (name, opts) => opts?.method === 'DELETE'
    ? { data: { removed: true }, error: null }
    : { data: { waiting: true, bundle: 'AQID', sealed_at: SEALED_AT }, error: null })
  unsealWriting.mockResolvedValue({ v: 3, stories: [], series: [], rituals: [] })
  restoreWriting.mockResolvedValue({ stories: 1, series: 0, drafts: 2, skipped: 0 })
  render(<SealedWritingPrompt />)
  fireEvent.change(await screen.findByLabelText(/recovery code/i), { target: { value: 'pale-hound' } })
  fireEvent.click(screen.getByRole('button', { name: /unseal/i }))
  expect(await screen.findByText(/2 private ritual drafts are back/i)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cmd /c "npx vitest run src/components/SealedWritingPrompt.test.jsx"`
Expected: FAIL, because the text can't be found.

- [ ] **Step 3: Implement.** In `SealedWritingPrompt.jsx`, directly after
`const lines = []` (line 177), add:

```js
    if (done.counts?.drafts > 0) {
      lines.push(`${done.counts.drafts === 1 ? '1 private ritual draft is' : `${done.counts.drafts} private ritual drafts are`} back.`)
    }
```

- [ ] **Step 4: Run to verify it passes**

Run: `cmd /c "npx vitest run src/components/SealedWritingPrompt.test.jsx"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/SealedWritingPrompt.jsx src/components/SealedWritingPrompt.test.jsx
git commit -m "feat(seal-ui): restore message counts private ritual drafts"
```

---

### Task 7: Full verification, then push and PR

- [ ] **Step 1: Full unit suite**

Run: `npm run test:unit`
Expected: every test file passes: the 364 existing tests plus 9 new (8 in `sealCollect.test.js`,
1 in `SealedWritingPrompt.test.jsx`).

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 3: Final rehearsals, all against `--linked`, all rolled back**

```powershell
powershell -File scripts/sql/rehearse.ps1 -Test scripts/sql/test-rituals.sql       -Migration supabase/migrations/20260930000000_midnight_ritual.sql
powershell -File scripts/sql/rehearse.ps1 -Test scripts/sql/test-delete-member.sql -Migration supabase/migrations/20260930000000_midnight_ritual.sql
```

Expected: `ALL PASS` from both. Also rerun the wrapped verify-grants check from Task 3 Step 5,
expecting `rows: []`.

Then confirm production is untouched:
`cmd /c "npx supabase db query --linked ""select to_regclass('public.ritual_prompts') t"""`
should return null.

- [ ] **Step 4: Push and open the PR**

```bash
git push -u origin feat/ritual-db
gh pr create --base main --title "feat(ritual): Midnight Ritual database (PR 1 of 3)" --body-file <scratchpad body>
```

The body must:

- say that **merging applies the migration to production**
- list the rehearsals run and their results
- note that **nothing is visible to visitors**
- state the post-merge steps:
  - run `scripts/sql/test-rituals.sql` and `scripts/sql/verify-grants.sql` directly
  - confirm `schema_migrations` has `20260930000000`

It ends with the Claude Code attribution line.

- [ ] **Step 5:** Wait for `vitest` and Workers Builds to go green. Report to Jeff. **Do not
merge** until Jeff says so for this PR.
