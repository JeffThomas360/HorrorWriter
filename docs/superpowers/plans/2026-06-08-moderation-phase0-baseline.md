# Moderation Phase 0 — Consolidated Clean-Reset Baseline (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the drifted 24-migration history with ONE clean, consolidated schema baseline that rebuilds the entire current app schema minus the moderation cruft, plus the complete *structural* moderation data model (roles, standing, `mod_status`, new tables, read-side RLS helpers), then wipe-and-rebuild the database from it — leaving the existing app fully functional.

**Architecture:** Develop and validate the baseline entirely on a **local Supabase stack** (`supabase start`), where `db reset` is safe and repeatable. The baseline is produced by *dumping the current remote schema* (which captures the drift-resolved truth, including auth/storage/passkey objects we won't hand-author), then applying a precise set of edits: strip `is_admin`/`hidden`/`approved`/`moderation_flags` and their triggers; add the new role/standing columns, `mod_status`, five new tables, and the `mod_can()`/`content_visible()` RLS helpers. Frontend code that referenced the dropped identifiers is reconciled so `npm run build` and the (Supabase-mocked) Playwright suite stay green. Only after local validation do we perform the gated, destructive remote reset.

**Tech Stack:** Supabase CLI (local Postgres via Docker), Postgres 15 + RLS, `@supabase/supabase-js` (Node integration test), React 19 / Vite 7 frontend, Playwright (mocked E2E, frontend-only regression guard).

**Behavioral functions are intentionally deferred.** This phase ships the *structural* schema and the *read-side* helpers only. Write-side behavior (filter trigger, ban insert-guards, report auto-hide, urgent email, notification delivery) is added in its own later-phase migration alongside the UI that uses it. The five new tables are created empty with their RLS; later phases add their triggers/functions.

---

## Pre-flight decision (resolve at execution start)

**Remote reset mechanism.** Two ways to apply the pristine baseline to a clean database:

- **(A) In-place reset of the existing linked project `bmvvugrfnuedjlucmlbw` (recommended).** Keeps the project ref, Edge Functions, function secrets, Cloudflare env vars, and Supabase Auth redirect URLs — least reconfiguration (honors low-friction). Achieved by dropping all `public`-schema objects, clearing the migration history table, and pushing the single baseline.
- **(B) Fresh Supabase project.** Maximally pristine (zero chance of residual drift) but requires re-pointing `VITE_SUPABASE_URL`/`ANON_KEY` (local + Cloudflare), re-deploying all 4 Edge Functions, re-setting their secrets, and re-adding Auth redirect URLs.

This plan implements **(A)**. If the operator prefers (B), Tasks 1–7 are identical (they target local + the baseline file); only Task 8 changes (create project + re-point env instead of in-place drop). Confirm the choice before Task 8.

> ⚠️ **Task 8 is destructive and irreversible.** It permanently deletes all remote data. This is pre-authorized (data is disposable, per the design decision), but the step still requires an explicit "proceed" at execution time.

---

## File structure

| Path | Responsibility | Action |
|---|---|---|
| `supabase/migrations/` (all 24 existing `.sql`) | Old drifted history | **Archive** (move to `supabase/migrations_archive/`) |
| `supabase/migrations/00000000000000_baseline.sql` | The single consolidated schema | **Create** |
| `supabase/seed.sql` | Local-only seed (test users/content for dev) | **Create** (optional dev aid) |
| `scripts/verify-baseline.mjs` | Node integration test: asserts objects + RLS behavior against a DB | **Create** |
| `src/components/AuthContext.jsx` | Profile fetch — select `mod_role` not `is_admin` | **Modify** |
| `src/lib/profile.js` | Profile column list (if it enumerates columns) | **Modify (verify)** |
| `src/components/Nav.jsx:34` | Mod-link gate `is_admin` → `mod_role` | **Modify** |
| `src/pages/Moderation.jsx` | Old admin terminal built on dropped schema | **Delete** (rebuilt in later phases) |
| `src/App.jsx:21,53` | Lazy import + `/moderation` route | **Modify** (remove until Phase 1) |
| `src/pages/ThreadView.jsx:~150-175` | Old `moderation_flags` insert (report path) | **Remove** (replaced by ReportModal in Phase 2) |
| `src/pages/ReadStory.jsx:~120-140` | Old `moderation_flags` insert (report path) | **Remove** (replaced by ReportModal in Phase 2) |
| `CLAUDE.md` | Schema/table docs | **Update** (reflect new model) |
| `package.json` | Add `verify:baseline` script | **Modify** |

---

## Task 1: Stand up a local Supabase stack and capture the current remote schema

**Files:** none yet (environment + generated dump).

- [ ] **Step 1: Confirm tooling is present**

Run:
```powershell
supabase --version
docker --version
node --version
```
Expected: a Supabase CLI version prints, Docker is installed and running, Node 20.x. If Docker isn't running, start Docker Desktop before continuing.

- [ ] **Step 2: Confirm the project is linked**

Run:
```powershell
supabase projects list
```
Expected: project `bmvvugrfnuedjlucmlbw` appears with a ● in the linked column. If not linked:
```powershell
supabase link --project-ref bmvvugrfnuedjlucmlbw
```

- [ ] **Step 3: Dump the current remote schema (drift-resolved source of truth)**

Run:
```powershell
supabase db dump --linked -f supabase/_remote_dump.sql
supabase db dump --linked --schema auth,storage -f supabase/_remote_dump_authstorage.sql
```
Expected: two files written. `_remote_dump.sql` contains the `public` schema DDL (profiles, books, threads, posts, book_comments, categories, passkey_credentials, webauthn_challenges, all functions/triggers/policies). These dumps are **scratch inputs** — they will NOT be committed (add `supabase/_remote_dump*.sql` to `.gitignore` in Step 4).

- [ ] **Step 4: Ignore the scratch dumps**

Add to `.gitignore`:
```
supabase/_remote_dump*.sql
```

- [ ] **Step 5: Start the local stack (proves Docker + CLI work before we build)**

Run:
```powershell
supabase start
```
Expected: local services boot; the command prints local `API URL` (`http://127.0.0.1:54321`), `DB URL`, `anon key`, and `service_role key`. **Record the local anon key and service_role key** — Task 6's integration test needs them.

- [ ] **Step 6: Commit the gitignore change**

```powershell
git add .gitignore
git commit -m "chore: ignore scratch supabase schema dumps"
```

---

## Task 2: Create the consolidated baseline from the dump (faithful reproduction, cruft removed)

**Files:**
- Create: `supabase/migrations/00000000000000_baseline.sql`

The baseline is built in two halves: this task reproduces the *current* schema minus moderation cruft; Task 3 adds the new moderation model. Work on the local stack so each edit is validated by `supabase db reset`.

- [ ] **Step 1: Seed the baseline file from the public-schema dump**

Copy the body of `supabase/_remote_dump.sql` into `supabase/migrations/00000000000000_baseline.sql`. Then delete these dump artifacts from the top of the file if present (the CLI sometimes emits them): `SET` statements are fine to keep; remove any `CREATE SCHEMA public` ownership noise only if `supabase db reset` later errors on it (validated in Step 6).

- [ ] **Step 2: Remove the `moderation_flags` table and its trigger/function**

In the baseline file, delete:
- the entire `CREATE TABLE ... moderation_flags ...` block and its indexes,
- every `CREATE POLICY ... ON public.moderation_flags ...`,
- the `handle_new_flag()` function definition,
- the `on_flag_created` trigger.

- [ ] **Step 3: Remove the `is_admin` column and the screening insert trigger**

In the baseline file:
- In the `profiles` table definition, delete the `is_admin boolean ...` column line.
- Delete the `check_requires_screening()` function and the four `check_*_screening` triggers (`check_book_screening`, `check_thread_screening`, `check_post_screening`, `check_comment_screening`). (Screening is re-implemented behaviorally in a later phase.)

- [ ] **Step 4: Remove the `hidden` and `approved` columns from all content tables**

In the baseline file, in each of `books`, `threads`, `posts`, `book_comments`:
- delete the `hidden boolean ...` column line,
- delete the `approved boolean ...` column line.

- [ ] **Step 5: Replace the content SELECT policies with simple owner/public placeholders (temporary)**

The dumped content SELECT policies reference `is_admin`/`hidden`/`approved` and won't compile. For each content table replace its SELECT policy with a plain public-read placeholder for now (Task 3 swaps these for the `content_visible()` versions):
```sql
-- books (repeat pattern for threads, posts, book_comments)
drop policy if exists "Public books are viewable by everyone." on public.books;
create policy "books_select_tmp" on public.books for select using (true);
```
> This placeholder exists only between Steps here and Task 3 Step 6; it is removed there.

- [ ] **Step 6: Ensure cross-schema objects the public dump omits are present**

A `--schema public` dump does NOT capture the trigger attached to `auth.users` that calls `public.handle_new_user()`, nor `create extension` lines if the extensions live elsewhere. Confirm the baseline contains BOTH:
```sql
-- near the top of the baseline, before objects that use gen_random_uuid():
create extension if not exists pgcrypto with schema extensions;

-- after handle_new_user() is defined:
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```
If either is missing from the dump, add it. (Source of truth for the trigger: archived `20240428000000_init_profiles.sql`.)

- [ ] **Step 7: Validate the reproduction on local**

Run:
```powershell
supabase db reset
```
Expected: `Applying migration 00000000000000_baseline.sql...` completes with **no errors** and the seed (if any) runs. If it errors, the message names the offending line — fix it in the baseline and re-run. Iterate until reset is clean. (A missing `pgcrypto`/extension surfaces here as a `gen_random_uuid() does not exist` error.)

- [ ] **Step 8: Commit the reproduction half**

```powershell
git add supabase/migrations/00000000000000_baseline.sql
git commit -m "refactor(db): consolidated baseline — faithful reproduction, moderation cruft removed"
```

---

## Task 3: Add the moderation data model to the baseline

**Files:**
- Modify: `supabase/migrations/00000000000000_baseline.sql`

Append all of the following to the **end** of the baseline file, then re-validate with `supabase db reset`.

- [ ] **Step 1: Add role & standing columns to `profiles`**

```sql
-- ── Moderation: roles & user standing ─────────────────────────────
alter table public.profiles
  add column mod_role  text     check (mod_role in ('sentinel','moderator','warden','keeper')),
  add column mod_scope text     not null default 'all' check (mod_scope in ('all','forum','library')),
  add column requires_screening boolean not null default false,
  add column is_shadowbanned     boolean not null default false,
  add column banned_until        timestamptz,
  add column ban_reason          text;
```
> Note: if `requires_screening` / `is_shadowbanned` already survived in the dump's `profiles` block, delete those two lines from this ALTER to avoid "column already exists". Validated in Step 9.

- [ ] **Step 2: Add `mod_status` to every content table**

```sql
alter table public.books         add column mod_status text not null default 'live' check (mod_status in ('live','screening','hidden'));
alter table public.threads       add column mod_status text not null default 'live' check (mod_status in ('live','screening','hidden'));
alter table public.posts         add column mod_status text not null default 'live' check (mod_status in ('live','screening','hidden'));
alter table public.book_comments add column mod_status text not null default 'live' check (mod_status in ('live','screening','hidden'));

create index idx_books_modstatus         on public.books(mod_status)         where mod_status <> 'live';
create index idx_threads_modstatus       on public.threads(mod_status)       where mod_status <> 'live';
create index idx_posts_modstatus         on public.posts(mod_status)         where mod_status <> 'live';
create index idx_book_comments_modstatus on public.book_comments(mod_status) where mod_status <> 'live';
```

- [ ] **Step 3: Capability helper `mod_can(action, area)`**

```sql
-- Maps a content target_type to its moderation area.
create or replace function public.mod_area(p_target_type text)
returns text language sql immutable as $$
  select case
    when p_target_type in ('story','critique') then 'library'
    when p_target_type in ('thread','post')    then 'forum'
    else 'all'
  end;
$$;

-- True if the CURRENT user may perform p_action in p_area.
-- Keepers can do anything; wardens/keepers are always scope='all'.
create or replace function public.mod_can(p_action text, p_area text)
returns boolean language sql stable security definer set search_path = public as $$
  with me as (
    select mod_role as r, mod_scope as s
    from public.profiles
    where id = (select auth.uid())
  )
  select coalesce((
    select case
      when r = 'keeper' then true
      when r is null    then false
      when not (s = 'all' or s = p_area or p_area = 'all') then false
      else case p_action
        when 'view_hidden'   then r in ('sentinel','moderator','warden')
        when 'handle_report' then r in ('sentinel','moderator','warden')
        when 'hide'          then r in ('sentinel','moderator','warden')
        when 'screen'        then r in ('moderator','warden')
        when 'shadowban'     then r in ('warden')
        when 'ban'           then r in ('warden')
        when 'read_audit'    then r in ('warden')
        else false  -- 'assign_role','configure' => keeper-only (handled above)
      end
    end
    from me
  ), false);
$$;
```

- [ ] **Step 4: Content visibility helper**

```sql
-- A content row is visible if it's live & author not shadowbanned,
-- OR the viewer is the author, OR the viewer may view hidden content here.
create or replace function public.content_visible(p_status text, p_author uuid, p_area text)
returns boolean language sql stable security definer set search_path = public as $$
  select
    ( p_status = 'live'
      and not coalesce((select is_shadowbanned from public.profiles where id = p_author), false) )
    or (select auth.uid()) = p_author
    or public.mod_can('view_hidden', p_area);
$$;
```

- [ ] **Step 5: New moderation tables**

```sql
-- Reports (content / user / site / appeal)
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles(id) on delete set null,
  target_type text not null check (target_type in ('story','critique','thread','post','user','site','appeal')),
  target_id   uuid,
  category    text not null check (category in ('harassment','spam','urgent','other')),
  details     text,
  status      text not null default 'open' check (status in ('open','actioned','dismissed')),
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  resolution  text,
  created_at  timestamptz not null default timezone('utc', now())
);
create index idx_reports_status on public.reports(status) where status = 'open';
create index idx_reports_target on public.reports(target_type, target_id);

-- Append-only audit log
create table public.mod_actions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action   text not null,
  target_type    text,
  target_id      uuid,
  target_user_id uuid references public.profiles(id) on delete set null,
  reason   text,
  metadata jsonb,
  created_at timestamptz not null default timezone('utc', now())
);
create index idx_mod_actions_created on public.mod_actions(created_at desc);

-- Closed-loop notifications
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind  text not null,
  title text not null,
  body  text,
  read_at    timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);
create index idx_notifications_user_unread on public.notifications(user_id) where read_at is null;

-- Keeper-configurable role badges
create table public.mod_role_badges (
  role  text primary key check (role in ('sentinel','moderator','warden','keeper')),
  emoji text not null,
  label text not null
);

-- Keeper-editable submission filter rules
create table public.filter_rules (
  id uuid primary key default gen_random_uuid(),
  kind    text not null check (kind in ('phrase','max_links','duplicate','new_account_flood')),
  value   text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);
```

- [ ] **Step 6: Final content SELECT policies (replace the Task 2 placeholders)**

```sql
drop policy if exists "books_select_tmp" on public.books;
create policy "books_select" on public.books for select
  using (public.content_visible(mod_status, author_id, 'library'));

drop policy if exists "threads_select_tmp" on public.threads;
create policy "threads_select" on public.threads for select
  using (public.content_visible(mod_status, author_id, 'forum'));

drop policy if exists "posts_select_tmp" on public.posts;
create policy "posts_select" on public.posts for select
  using (public.content_visible(mod_status, author_id, 'forum'));

drop policy if exists "book_comments_select_tmp" on public.book_comments;
create policy "book_comments_select" on public.book_comments for select
  using (public.content_visible(mod_status, author_id, 'library'));
```

- [ ] **Step 7: Moderator UPDATE policies on content (so mods can set `mod_status`)**

```sql
create policy "books_mod_update" on public.books for update
  using (public.mod_can('hide','library') or public.mod_can('screen','library'));
create policy "threads_mod_update" on public.threads for update
  using (public.mod_can('hide','forum') or public.mod_can('screen','forum'));
create policy "posts_mod_update" on public.posts for update
  using (public.mod_can('hide','forum') or public.mod_can('screen','forum'));
create policy "book_comments_mod_update" on public.book_comments for update
  using (public.mod_can('hide','library') or public.mod_can('screen','library'));
```

- [ ] **Step 8: RLS for the new tables**

```sql
alter table public.reports         enable row level security;
alter table public.mod_actions     enable row level security;
alter table public.notifications   enable row level security;
alter table public.mod_role_badges enable row level security;
alter table public.filter_rules    enable row level security;

-- reports: reporter sees own; mods see those in their area; anyone authed can file
create policy "reports_select" on public.reports for select using (
  reporter_id = (select auth.uid())
  or public.mod_can('handle_report', public.mod_area(target_type))
);
create policy "reports_insert" on public.reports for insert with check (
  reporter_id = (select auth.uid())
);
create policy "reports_update" on public.reports for update using (
  public.mod_can('handle_report', public.mod_area(target_type))
);

-- mod_actions: append-only; readable by warden+; insertable by any current mod as themselves
create policy "mod_actions_select" on public.mod_actions for select using (
  public.mod_can('read_audit','all')
);
create policy "mod_actions_insert" on public.mod_actions for insert with check (
  actor_id = (select auth.uid())
  and (select mod_role from public.profiles where id = (select auth.uid())) is not null
);

-- notifications: owner reads & marks read; INSERTs come only from SECURITY DEFINER
-- functions (added in later phases), so no client insert policy.
create policy "notifications_select" on public.notifications for select using (
  user_id = (select auth.uid())
);
create policy "notifications_update" on public.notifications for update using (
  user_id = (select auth.uid())
);

-- badges: world-readable; only keeper writes
create policy "badges_select" on public.mod_role_badges for select using (true);
create policy "badges_write"  on public.mod_role_badges for all
  using (public.mod_can('configure','all'))
  with check (public.mod_can('configure','all'));

-- filter rules: keeper only (read + write)
create policy "filters_all" on public.filter_rules for all
  using (public.mod_can('configure','all'))
  with check (public.mod_can('configure','all'));
```

- [ ] **Step 9: Seed badge defaults (and re-confirm category seed survived the dump)**

```sql
insert into public.mod_role_badges (role, emoji, label) values
  ('keeper',   '🗝️', 'Keeper'),
  ('warden',   '🕯️', 'Warden'),
  ('moderator','👁️', 'Moderator'),
  ('sentinel', '🔦', 'Sentinel')
on conflict (role) do nothing;
```
Confirm the dump already re-seeds the 5 `categories` rows; if the dump captured data-less DDL only, add the original seed from `20240514000001_forum_schema.sql` here.

- [ ] **Step 10: Validate the whole baseline on local**

Run:
```powershell
supabase db reset
```
Expected: clean apply, no errors. Fix any duplicate-column / missing-object errors inline (most common: `requires_screening`/`is_shadowbanned` already present from the dump — remove from Step 1's ALTER).

- [ ] **Step 11: Commit**

```powershell
git add supabase/migrations/00000000000000_baseline.sql
git commit -m "feat(db): add moderation data model to baseline (roles, mod_status, tables, RLS helpers)"
```

---

## Task 4: Archive the old migrations

**Files:**
- Move: `supabase/migrations/2024*..2026*.sql` → `supabase/migrations_archive/`

- [ ] **Step 1: Move every dated migration except the baseline out of the migrations folder**

```powershell
New-Item -ItemType Directory -Force supabase/migrations_archive | Out-Null
Get-ChildItem supabase/migrations/*.sql |
  Where-Object { $_.Name -ne '00000000000000_baseline.sql' } |
  Move-Item -Destination supabase/migrations_archive/
```
Expected: `supabase/migrations/` now contains only `00000000000000_baseline.sql`; all 24 dated files are under `migrations_archive/`.

- [ ] **Step 2: Verify a clean reset still works with only the baseline present**

Run:
```powershell
supabase db reset
```
Expected: clean apply of the single baseline.

- [ ] **Step 3: Commit**

```powershell
git add supabase/migrations supabase/migrations_archive
git commit -m "chore(db): archive pre-baseline migration history"
```

---

## Task 5: Write the baseline verification integration test

**Files:**
- Create: `scripts/verify-baseline.mjs`
- Modify: `package.json` (add `verify:baseline` script)

This is the real schema test (the Playwright suite can't see the DB). It runs against any Supabase URL via env vars and asserts both *structure* and *RLS behavior*.

- [ ] **Step 1: Add the npm script**

In `package.json` `"scripts"`, add:
```json
"verify:baseline": "node scripts/verify-baseline.mjs"
```

- [ ] **Step 2: Write the verification script**

Create `scripts/verify-baseline.mjs`:
```js
// Verifies the consolidated baseline: structural objects + core RLS behavior.
// Usage: SUPABASE_URL=... SUPABASE_SERVICE_KEY=... SUPABASE_ANON_KEY=... npm run verify:baseline
import { createClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_KEY
const ANON = process.env.SUPABASE_ANON_KEY
if (!URL || !SERVICE || !ANON) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_KEY / SUPABASE_ANON_KEY')
  process.exit(1)
}

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } })
const anon = createClient(URL, ANON, { auth: { persistSession: false } })

let failures = 0
const ok = (name) => console.log(`  ✓ ${name}`)
const bad = (name, detail) => { failures++; console.error(`  ✗ ${name} — ${detail}`) }

async function expectColumns() {
  // Structural: these selects fail if columns/tables are missing.
  const checks = [
    ['profiles.mod_role/mod_scope/banned_until', () => svc.from('profiles').select('id, mod_role, mod_scope, requires_screening, is_shadowbanned, banned_until, ban_reason').limit(1)],
    ['books.mod_status',         () => svc.from('books').select('id, mod_status').limit(1)],
    ['threads.mod_status',       () => svc.from('threads').select('id, mod_status').limit(1)],
    ['posts.mod_status',         () => svc.from('posts').select('id, mod_status').limit(1)],
    ['book_comments.mod_status', () => svc.from('book_comments').select('id, mod_status').limit(1)],
    ['reports table',            () => svc.from('reports').select('id').limit(1)],
    ['mod_actions table',        () => svc.from('mod_actions').select('id').limit(1)],
    ['notifications table',      () => svc.from('notifications').select('id').limit(1)],
    ['mod_role_badges table',    () => svc.from('mod_role_badges').select('role').limit(1)],
    ['filter_rules table',       () => svc.from('filter_rules').select('id').limit(1)],
  ]
  for (const [name, run] of checks) {
    const { error } = await run()
    error ? bad(name, error.message) : ok(name)
  }
  // Dropped objects must be gone:
  const { error: flagsErr } = await svc.from('moderation_flags').select('id').limit(1)
  flagsErr ? ok('moderation_flags dropped') : bad('moderation_flags dropped', 'table still exists')
  const { error: adminErr } = await svc.from('profiles').select('is_admin').limit(1)
  adminErr ? ok('profiles.is_admin dropped') : bad('profiles.is_admin dropped', 'column still exists')
}

async function expectBadgeSeed() {
  const { data, error } = await svc.from('mod_role_badges').select('role')
  if (error) return bad('badge seed', error.message)
  const roles = (data || []).map(r => r.role).sort().join(',')
  roles === 'keeper,moderator,sentinel,warden'
    ? ok('badge seed (4 roles)')
    : bad('badge seed (4 roles)', `got: ${roles}`)
}

async function expectRlsHidesNonLive() {
  // Insert a profile + a hidden book via service role (bypasses RLS),
  // then confirm the ANON client cannot see the hidden row but can see a live one.
  const uid = crypto.randomUUID()
  await svc.from('profiles').insert({ id: uid, handle: `rls-${uid.slice(0,8)}`, display_name: 'RLS Test' })
  const live = await svc.from('books').insert({ author_id: uid, title: 'LIVE', mod_status: 'live' }).select('id').single()
  const hidden = await svc.from('books').insert({ author_id: uid, title: 'HIDDEN', mod_status: 'hidden' }).select('id').single()

  const { data: anonRows } = await anon.from('books').select('id, mod_status').in('id', [live.data.id, hidden.data.id])
  const ids = (anonRows || []).map(r => r.id)
  ids.includes(live.data.id) ? ok('anon sees live content') : bad('anon sees live content', 'live row missing')
  !ids.includes(hidden.data.id) ? ok('anon cannot see hidden content') : bad('anon cannot see hidden content', 'hidden row leaked')

  // cleanup
  await svc.from('books').delete().in('id', [live.data.id, hidden.data.id])
  await svc.from('profiles').delete().eq('id', uid)
}

console.log('Verifying baseline schema + RLS...')
await expectColumns()
await expectBadgeSeed()
await expectRlsHidesNonLive()
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
```

- [ ] **Step 3: Run it against the LOCAL stack and watch it pass**

Use the local keys printed by `supabase start` (Task 1 Step 5):
```powershell
$env:SUPABASE_URL='http://127.0.0.1:54321'
$env:SUPABASE_SERVICE_KEY='<local service_role key>'
$env:SUPABASE_ANON_KEY='<local anon key>'
npm run verify:baseline
```
Expected: every line prints `✓` and the script ends with `ALL CHECKS PASSED` (exit 0). If any `✗`, fix the baseline (Task 3) and re-run `supabase db reset` then this script.

- [ ] **Step 4: Commit**

```powershell
git add scripts/verify-baseline.mjs package.json
git commit -m "test(db): baseline verification — structure + RLS visibility"
```

---

## Task 6: Reconcile the frontend with the new schema

**Files:**
- Modify: `src/components/AuthContext.jsx`, `src/lib/profile.js`, `src/components/Nav.jsx`, `src/App.jsx`, `src/pages/ThreadView.jsx`, `src/pages/ReadStory.jsx`
- Delete: `src/pages/Moderation.jsx`

Goal: `npm run build` succeeds and the (mocked) Playwright suite stays green, with zero references to dropped identifiers.

- [ ] **Step 1: Find every remaining reference to dropped identifiers**

Run a search for `is_admin`, `moderation_flags`, `\.hidden`, `\.approved` across `src/`. Expected hits: `AuthContext.jsx`/`profile.js` (profile select), `Nav.jsx:34`, `App.jsx:21,53`, `ThreadView.jsx`, `ReadStory.jsx`, `Moderation.jsx`. Use the list to drive the steps below; there should be **no** references left after this task.

- [ ] **Step 2: Update the profile fetch to select `mod_role` instead of `is_admin`**

In whichever of `AuthContext.jsx` / `lib/profile.js` builds the profile `.select(...)`: if it enumerates columns, replace `is_admin` with `mod_role, mod_scope`. If it uses `select('*')`, no change is needed (the new columns come through automatically) — verify which it is and edit only if columns are listed.

- [ ] **Step 3: Gate the mod nav link on `mod_role`**

In `src/components/Nav.jsx:34`, change:
```jsx
{profile?.is_admin && (
```
to:
```jsx
{profile?.mod_role && (
```
> The link target (`/moderation`) is removed in Step 5; until later phases rebuild the terminal, this block renders no usable link. To avoid a dead link, also comment out the link's `to`/contents or wrap the whole block in `{false && (...)}` with a `// TODO(phase1): restore mod terminal link` note. Choose the wrap-in-`false` approach so the markup is preserved for Phase 1.

- [ ] **Step 4: Delete the old moderation terminal**

```powershell
Remove-Item src/pages/Moderation.jsx
```

- [ ] **Step 5: Remove the route + lazy import**

In `src/App.jsx`: delete line 21 (`const Moderation = lazy(...)`) and line 53 (the `<Route path="moderation" ...>`). Add a `// TODO(phase1): mount rebuilt Keeper Terminal route` comment where the route was.

- [ ] **Step 6: Remove the old `moderation_flags` report paths**

In `src/pages/ThreadView.jsx` and `src/pages/ReadStory.jsx`, remove the handler(s) that `.from('moderation_flags').insert(...)` and the button(s) that call them. Leave a `// TODO(phase2): ReportModal trigger` comment at each former button site. (The unified `ReportModal` lands in Phase 2.)

- [ ] **Step 7: Verify the build compiles**

Run:
```powershell
npm run build
```
Expected: build succeeds with no "is not defined" / missing-import errors. Fix any dangling imports (e.g., an unused `supabase` import) until clean.

- [ ] **Step 8: Verify the mocked frontend suite still passes**

Run:
```powershell
npx playwright test
```
Expected: all existing specs pass (they mock Supabase, so they validate frontend behavior only). If a spec referenced the old moderation UI, update that spec to match the removed surface (note it in the commit). 

- [ ] **Step 9: Commit**

```powershell
git add -A
git commit -m "refactor(ui): reconcile frontend with new schema; remove pre-baseline moderation surface"
```

---

## Task 7: Final local end-to-end smoke

**Files:** none (validation only).

- [ ] **Step 1: Point the dev app at the local stack**

Create/append `.env.local` (do not commit secrets) with the local values from `supabase start`:
```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<local anon key>
```
> Restore the real remote values after Task 8. Note the prior contents before overwriting.

- [ ] **Step 2: Seed a local test user + Keeper and exercise the app**

Using the service-role key, insert a profile and promote it to keeper, then run the app:
```powershell
$env:SUPABASE_URL='http://127.0.0.1:54321'; $env:SUPABASE_SERVICE_KEY='<local service_role key>'; $env:SUPABASE_ANON_KEY='<local anon key>'
npm run verify:baseline   # re-confirm green
npm run dev
```
Manually: load the site, open Library and Forum (they should render against the local DB without console errors about missing columns). This confirms the app runs on the new schema. Record any runtime error and fix before proceeding.

- [ ] **Step 3: Restore `.env.local` to the remote values**

Put `.env.local` back to the real `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` captured in Step 1.

---

## Task 8: ⚠️ Destructive remote reset + push the baseline (GATED)

**Files:** none (remote DB operation).

> **STOP.** Confirm the Pre-flight mechanism choice (A in-place vs B fresh project) and get an explicit "proceed" before running anything in this task. This permanently deletes all remote data.

**Mechanism A — in-place reset of `bmvvugrfnuedjlucmlbw`:**

- [ ] **Step 1: Drop all `public`-schema objects and clear migration history on remote**

Run this SQL against the linked remote DB (via `supabase db execute` or the SQL editor). It drops and recreates `public`, re-grants default access, and clears the recorded history so the single baseline is the only migration:
```sql
drop schema public cascade;
create schema public;
grant usage on schema public to anon, authenticated, service_role;
grant all on schema public to postgres, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
delete from supabase_migrations.schema_migrations;
```
Expected: success. (Auth/storage schemas are untouched, preserving the auth users table and storage config; the baseline recreates the `public` app schema and re-attaches the `handle_new_user` trigger to `auth.users`.)

- [ ] **Step 2: Push the consolidated baseline to remote**

```powershell
supabase db push
```
Expected: `Applying migration 00000000000000_baseline.sql...` against the linked project, completing with no errors.

- [ ] **Step 3: Re-run the verification against REMOTE**

Use the **remote** URL + keys (anon from `.env.local`; service key from the Supabase dashboard → Project Settings → API):
```powershell
$env:SUPABASE_URL='https://bmvvugrfnuedjlucmlbw.supabase.co'
$env:SUPABASE_SERVICE_KEY='<remote service_role key>'
$env:SUPABASE_ANON_KEY='<remote anon key>'
npm run verify:baseline
```
Expected: `ALL CHECKS PASSED` against remote.

---

## Task 9: Seed the first Keeper and finalize

**Files:** Modify `CLAUDE.md`.

- [ ] **Step 1: Promote the owner account to Keeper**

After signing into the deployed/remote app once (so an `auth.users` + `profiles` row exists for `orig.beetlebub@gmail.com`), run against remote:
```sql
update public.profiles
set mod_role = 'keeper', mod_scope = 'all'
where handle = (select handle from public.profiles
                where id = (select id from auth.users where email = 'orig.beetlebub@gmail.com'));
```
Expected: 1 row updated. (If the owner hasn't signed in yet, defer this step until they have.)

- [ ] **Step 2: Update CLAUDE.md schema docs**

In `CLAUDE.md` → "Database tables": remove the `moderation_flags`/`is_admin` description, add the new tables (`reports`, `mod_actions`, `notifications`, `mod_role_badges`, `filter_rules`) and note the `mod_role`/`mod_scope`/`mod_status` model and the single consolidated baseline migration. Note that pre-baseline migrations now live in `supabase/migrations_archive/`.

- [ ] **Step 3: Commit and stop the local stack**

```powershell
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for consolidated baseline + moderation schema"
supabase stop
```

- [ ] **Step 4: Phase 0 complete**

The database is rebuilt from one clean baseline; the app builds and runs on it; the moderation data model + read-side RLS are in place (empty); the first Keeper exists. Behavioral functions and UI follow in Phase 1+.

---

## Self-review notes (coverage vs spec §12 / §13 Phase 0)

- Consolidated baseline replacing tangled history ✓ (Tasks 2–4)
- Drop `is_admin`/`hidden`/`approved`/`moderation_flags` ✓ (Task 2)
- New columns `mod_role`/`mod_scope`/standing/`mod_status` ✓ (Task 3 S1–S2)
- New tables `reports`/`mod_actions`/`notifications`/`mod_role_badges`/`filter_rules` created empty ✓ (Task 3 S5)
- Read-side helpers `mod_can()`/`content_visible()` + final RLS ✓ (Task 3 S3–S8)
- Badge seed ✓ (Task 3 S9)
- Faithful reproduction of non-moderation schema (auth/storage/passkeys/RPC/realtime/rate-limit) ✓ via dump (Task 2 S1)
- App still works (build + mocked E2E + local smoke) ✓ (Tasks 6–7)
- Clean reset performed ✓ (Task 8)
- First Keeper seeded ✓ (Task 9)
- Behavioral write-side functions intentionally deferred to later phases (documented at top).
