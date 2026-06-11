# Moderation Phase 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the moderation foundation — roles/capabilities gating, two server-side Keeper RPCs (assign role, edit badge), public moderator badges, and a tabbed Keeper Terminal with Registry + Badges tabs — so a Keeper can delegate roles and the rest of the suite has a base to build on.

**Architecture:** The real gate is always server-side: RLS + two `SECURITY DEFINER` RPCs that self-check the caller is a Keeper and write an audit row atomically. A pure JS capability helper (`modCan`) mirrors the SQL `mod_can` matrix for UI gating only. The Keeper Terminal is a single gated route that renders capability-filtered tabs; unauthorized visitors get a disguised 404, never a redirect.

**Tech Stack:** React 19 + react-router-dom 7, Supabase JS (`rpc`, `from`), `@tanstack/react-query` (badge cache), Vitest (new — pure-logic unit tests), Playwright (E2E).

**Spec:** [2026-06-10-moderation-suite-addendum.md](../specs/2026-06-10-moderation-suite-addendum.md) + [2026-06-08-moderation-suite-design.md](../specs/2026-06-08-moderation-suite-design.md)

**Execution note:** Do this on a feature branch (e.g. `feat/moderation-phase-1`), not `main`. The DB bootstrap (`beetlebub` → Keeper) is already done and logged; do **not** reset the DB during this phase (that would wipe it). Schema changes here are an **incremental migration applied on top** (via `mcp supabase apply_migration` or `supabase db push`), not a baseline edit + reset.

---

## File structure

| File | Responsibility |
|---|---|
| `vitest.config.js` | Vitest config (new) |
| `src/lib/moderation.js` | Pure capability logic: `isMod`, `modCan` (mirrors SQL `mod_can`) |
| `src/lib/moderation.test.js` | Vitest unit tests for the matrix |
| `supabase/migrations/<ts>_mod_phase1_rpcs.sql` | `set_mod_role`, `set_role_badge` RPCs |
| `src/lib/modActions.js` | Supabase IO: `searchUsers`, `assignRole`, `revokeRole`, `getRoleBadges`, `setRoleBadge` |
| `src/lib/useModBadges.js` | react-query hook caching `mod_role_badges` |
| `src/components/ModBadge.jsx` | Renders a role's emoji+label badge |
| `src/components/ProfileHead.jsx` | (modify) render `<ModBadge>` |
| `src/pages/Moderation.jsx` | Keeper Terminal shell + access gate + tabs |
| `src/components/mod/RegistryTab.jsx` | User search + assign/revoke roles |
| `src/components/mod/BadgesTab.jsx` | Edit emoji↔role mapping |
| `src/App.jsx` | (modify) mount `/moderation` route |
| `src/components/Nav.jsx` | (modify) gate `[Terminal]` link on `mod_role` |
| `src/style.css` | (modify) `.mod-badge`, terminal/tab styles |
| `tests/moderation.spec.js` | E2E: gate, badges, registry, badges tab |
| `tests/mocks.js` | (modify) drop stale cruft; add mod mocks |

---

## Task 1: Add Vitest unit-test tooling

**Files:** Create `vitest.config.js`; modify `package.json`.

- [ ] **Step 1: Install Vitest**

Run: `npm install -D vitest@^2`
Expected: added to devDependencies, no errors.

- [ ] **Step 2: Create `vitest.config.js`**

```js
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
})
```

- [ ] **Step 3: Add scripts to `package.json`**

In the `"scripts"` block add:
```json
    "test:unit": "vitest run",
    "test:unit:watch": "vitest"
```

- [ ] **Step 4: Smoke test the runner**

Create `src/lib/_smoke.test.js`:
```js
import { test, expect } from 'vitest'
test('vitest runs', () => { expect(1 + 1).toBe(2) })
```
Run: `npm run test:unit`
Expected: 1 passed. Then delete `src/lib/_smoke.test.js`.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.js
git commit -m "test: add vitest for pure-logic unit tests"
```

---

## Task 2: Capability helper `src/lib/moderation.js`

Pure functions mirroring the SQL `public.mod_can(action, area)` matrix (baseline `00000000000000_baseline.sql`). UI gating only — server RLS/RPCs are the real gate.

**Files:** Create `src/lib/moderation.js`, `src/lib/moderation.test.js`.

- [ ] **Step 1: Write the failing test** — `src/lib/moderation.test.js`

```js
import { test, expect, describe } from 'vitest'
import { isMod, modCan } from './moderation'

const keeper    = { mod_role: 'keeper',    mod_scope: 'all' }
const warden    = { mod_role: 'warden',    mod_scope: 'all' }
const modForum  = { mod_role: 'moderator', mod_scope: 'forum' }
const sentLib   = { mod_role: 'sentinel',  mod_scope: 'library' }
const normal    = { mod_role: null,        mod_scope: 'all' }

describe('isMod', () => {
  test('true only when a role is set', () => {
    expect(isMod(keeper)).toBe(true)
    expect(isMod(normal)).toBe(false)
    expect(isMod(null)).toBe(false)
    expect(isMod(undefined)).toBe(false)
  })
})

describe('modCan', () => {
  test('normal user can do nothing', () => {
    expect(modCan(normal, 'hide', 'forum')).toBe(false)
    expect(modCan(normal, 'view_hidden', 'all')).toBe(false)
  })
  test('keeper can do everything', () => {
    expect(modCan(keeper, 'assign_role', 'all')).toBe(true)
    expect(modCan(keeper, 'configure', 'all')).toBe(true)
    expect(modCan(keeper, 'ban', 'library')).toBe(true)
  })
  test('only keeper assigns roles / configures', () => {
    expect(modCan(warden, 'assign_role', 'all')).toBe(false)
    expect(modCan(warden, 'configure', 'all')).toBe(false)
  })
  test('warden can ban/shadowban/read_audit but not assign', () => {
    expect(modCan(warden, 'ban', 'all')).toBe(true)
    expect(modCan(warden, 'shadowban', 'all')).toBe(true)
    expect(modCan(warden, 'read_audit', 'all')).toBe(true)
  })
  test('moderator can screen+hide in scope, not ban', () => {
    expect(modCan(modForum, 'screen', 'forum')).toBe(true)
    expect(modCan(modForum, 'hide', 'forum')).toBe(true)
    expect(modCan(modForum, 'ban', 'forum')).toBe(false)
  })
  test('scoped role blocked outside its area', () => {
    expect(modCan(modForum, 'hide', 'library')).toBe(false)
    expect(modCan(sentLib, 'hide', 'forum')).toBe(false)
    expect(modCan(sentLib, 'hide', 'library')).toBe(true)
  })
  test('sentinel cannot screen', () => {
    expect(modCan(sentLib, 'screen', 'library')).toBe(false)
  })
  test("area 'all' request satisfied by any scope", () => {
    expect(modCan(modForum, 'view_hidden', 'all')).toBe(true)
  })
})
```

- [ ] **Step 2: Run, verify it fails**

Run: `npm run test:unit`
Expected: FAIL — `moderation.js` has no exports / file missing.

- [ ] **Step 3: Implement `src/lib/moderation.js`**

```js
// Pure mirror of SQL public.mod_can(action, area) for UI gating ONLY.
// The real gate is server-side RLS + SECURITY DEFINER RPCs. Keep this matrix
// in sync with 00000000000000_baseline.sql (function mod_can).

// action -> roles permitted (before scope check). Keeper short-circuits true.
const MATRIX = {
  view_hidden:   ['sentinel', 'moderator', 'warden'],
  handle_report: ['sentinel', 'moderator', 'warden'],
  hide:          ['sentinel', 'moderator', 'warden'],
  screen:        ['moderator', 'warden'],
  shadowban:     ['warden'],
  ban:           ['warden'],
  read_audit:    ['warden'],
  assign_role:   [],   // keeper-only (handled by short-circuit)
  configure:     [],   // keeper-only
}

/** True when the profile holds any moderation role. */
export function isMod(profile) {
  return !!profile?.mod_role
}

/**
 * Can this profile perform `action` in `area` ('all' | 'forum' | 'library')?
 * Mirrors the SQL helper exactly.
 */
export function modCan(profile, action, area = 'all') {
  const role = profile?.mod_role
  if (!role) return false
  if (role === 'keeper') return true
  const allowed = MATRIX[action]
  if (!allowed || !allowed.includes(role)) return false
  const scope = profile.mod_scope || 'all'
  // permitted when scope is global, the request is global, or scope matches area
  return scope === 'all' || area === 'all' || scope === area
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npm run test:unit`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/moderation.js src/lib/moderation.test.js
git commit -m "feat(mod): add modCan capability helper mirroring SQL matrix"
```

---

## Task 3: Phase-1 Keeper RPCs (DB migration)

Two `SECURITY DEFINER` RPCs that self-check Keeper, mutate, and audit-log atomically. Needed because the `profiles` UPDATE RLS only allows self-updates, so cross-user role changes must go through a controlled function.

**Files:** Create `supabase/migrations/20260610010000_mod_phase1_rpcs.sql`.

- [ ] **Step 1: Write the migration**

```sql
-- Moderation Phase 1 RPCs (2026-06-10). Keeper-only, SECURITY DEFINER,
-- each writes a public.mod_actions audit row atomically.

create or replace function public.set_mod_role(p_target uuid, p_role text, p_scope text default 'all')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := (select auth.uid());
  v_actor_role text;
  v_old_role text;
  v_scope text;
  v_found boolean;
begin
  select mod_role into v_actor_role from public.profiles where id = v_actor;
  if v_actor_role is distinct from 'keeper' then
    raise exception 'Only a Keeper may assign roles' using errcode = '42501';
  end if;
  if p_target = v_actor then
    raise exception 'You cannot change your own role' using errcode = '42501';
  end if;
  if p_role is not null and p_role not in ('sentinel','moderator','warden') then
    raise exception 'Invalid role: %', p_role using errcode = '22023';
  end if;
  v_scope := coalesce(p_scope, 'all');
  if v_scope not in ('all','forum','library') then
    raise exception 'Invalid scope: %', v_scope using errcode = '22023';
  end if;
  if p_role is null or p_role = 'warden' then
    v_scope := 'all';  -- wardens & cleared roles are always global
  end if;

  select mod_role, true into v_old_role, v_found from public.profiles where id = p_target;
  if not coalesce(v_found, false) then
    raise exception 'No such user' using errcode = 'P0002';
  end if;

  update public.profiles set mod_role = p_role, mod_scope = v_scope where id = p_target;

  insert into public.mod_actions (actor_id, action, target_type, target_user_id, metadata)
  values (
    v_actor,
    case when p_role is null then 'revoke_role' else 'assign_role' end,
    'user', p_target,
    jsonb_build_object('old_role', v_old_role, 'new_role', p_role, 'scope', v_scope)
  );
end;
$$;

create or replace function public.set_role_badge(p_role text, p_emoji text, p_label text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := (select auth.uid());
  v_actor_role text;
  v_found boolean;
begin
  select mod_role into v_actor_role from public.profiles where id = v_actor;
  if v_actor_role is distinct from 'keeper' then
    raise exception 'Only a Keeper may edit badges' using errcode = '42501';
  end if;
  if p_role not in ('sentinel','moderator','warden','keeper') then
    raise exception 'Invalid role: %', p_role using errcode = '22023';
  end if;

  update public.mod_role_badges set emoji = p_emoji, label = p_label where role = p_role
  returning true into v_found;
  if not coalesce(v_found, false) then
    raise exception 'No such badge role' using errcode = 'P0002';
  end if;

  insert into public.mod_actions (actor_id, action, target_type, metadata)
  values (v_actor, 'edit_badge', 'badge',
          jsonb_build_object('role', p_role, 'emoji', p_emoji, 'label', p_label));
end;
$$;

revoke all on function public.set_mod_role(uuid, text, text)   from public, anon;
revoke all on function public.set_role_badge(text, text, text) from public, anon;
grant execute on function public.set_mod_role(uuid, text, text)   to authenticated;
grant execute on function public.set_role_badge(text, text, text) to authenticated;
```

- [ ] **Step 2: Apply the migration to remote**

Apply via the Supabase MCP `apply_migration` (name `mod_phase1_rpcs`, the SQL above) **or** `supabase db push`. Do NOT use `db reset` (it wipes the live Keeper bootstrap).

- [ ] **Step 3: Verify behavior (transactional SQL test, rolls back)**

Run this via the Supabase MCP `execute_sql`. It creates two throwaway users, exercises both the unauthorized and authorized paths, asserts, then ROLLBACKs so nothing persists. (If an `auth.users` NOT-NULL column is missing in this Postgres version, add it to the INSERT — `id`, `email`, `aud`, `role` cover current Supabase.)

```sql
do $$
declare
  k uuid := '00000000-0000-0000-0000-0000000000k1';
  t uuid := '00000000-0000-0000-0000-0000000000t1';
  v_role text; v_scope text; v_audit int; v_blocked boolean := false;
begin
  insert into auth.users (id, email, aud, role)
  values (k,'k@test','authenticated','authenticated'),
         (t,'t@test','authenticated','authenticated');
  -- handle_new_user trigger has created profiles; promote k to keeper
  update public.profiles set mod_role='keeper' where id = k;

  -- Case 1: non-keeper (t) calling must be blocked
  perform set_config('request.jwt.claims', json_build_object('sub', t::text, 'role','authenticated')::text, true);
  begin
    perform public.set_mod_role(k, 'moderator', 'forum');
  exception when others then v_blocked := true;
  end;
  if not v_blocked then raise exception 'TEST FAIL: non-keeper was allowed'; end if;

  -- Case 2: keeper (k) assigning moderator/forum to t succeeds
  perform set_config('request.jwt.claims', json_build_object('sub', k::text, 'role','authenticated')::text, true);
  perform public.set_mod_role(t, 'moderator', 'forum');
  select mod_role, mod_scope into v_role, v_scope from public.profiles where id = t;
  if v_role <> 'moderator' or v_scope <> 'forum' then raise exception 'TEST FAIL: role not set (% / %)', v_role, v_scope; end if;
  select count(*) into v_audit from public.mod_actions where action='assign_role' and target_user_id=t;
  if v_audit <> 1 then raise exception 'TEST FAIL: audit row missing'; end if;

  raise notice 'TEST PASS: set_mod_role authz + audit OK';
  raise exception 'ROLLBACK_SENTINEL';  -- force rollback, leave DB untouched
exception when others then
  if sqlerrm <> 'ROLLBACK_SENTINEL' then raise; end if;
  raise notice 'rolled back cleanly';
end $$;
```
Expected: notices `TEST PASS…` then `rolled back cleanly`; no rows persist (re-query `mod_actions` count is unchanged).

- [ ] **Step 4: Re-run security advisors**

Use Supabase MCP `get_advisors` type `security`. Expected: no NEW findings beyond the known/accepted set (the two new functions appear only as `authenticated_security_definer_function_executable`, which is intentional for guarded RPCs — same as `create_thread_with_post`; `anon` must NOT appear for them).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260610010000_mod_phase1_rpcs.sql
git commit -m "feat(mod): add set_mod_role + set_role_badge keeper RPCs"
```

---

## Task 4: Client IO `src/lib/modActions.js` + badge hook

**Files:** Create `src/lib/modActions.js`, `src/lib/useModBadges.js`.

- [ ] **Step 1: Implement `src/lib/modActions.js`**

```js
import { supabase } from '../supabaseClient'

/** Search profiles by handle substring (for the Registry). */
export async function searchUsers(query) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase
    .from('profiles')
    .select('id, handle, display_name, avatar_url, mod_role, mod_scope')
    .ilike('handle', `%${query}%`)
    .order('handle')
    .limit(20)
  if (error) throw new Error(error.message)
  return data ?? []
}

/** Keeper-only: assign (or with role=null, revoke) a moderation role. */
export async function assignRole(targetId, role, scope = 'all') {
  if (!supabase) throw new Error('Supabase not configured')
  const { error } = await supabase.rpc('set_mod_role', {
    p_target: targetId, p_role: role, p_scope: scope,
  })
  if (error) throw new Error(error.message)
}

export async function revokeRole(targetId) {
  return assignRole(targetId, null, 'all')
}

/** Public read of the emoji↔role map. */
export async function getRoleBadges() {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase
    .from('mod_role_badges')
    .select('role, emoji, label')
  if (error) throw new Error(error.message)
  return data ?? []
}

/** Keeper-only: edit a role's badge. */
export async function setRoleBadge(role, emoji, label) {
  if (!supabase) throw new Error('Supabase not configured')
  const { error } = await supabase.rpc('set_role_badge', {
    p_role: role, p_emoji: emoji, p_label: label,
  })
  if (error) throw new Error(error.message)
}
```

- [ ] **Step 2: Implement `src/lib/useModBadges.js`**

```js
import { useQuery } from '@tanstack/react-query'
import { getRoleBadges } from './modActions'

/** Cached emoji↔role map; rarely changes, so long staleTime. */
export function useModBadges() {
  return useQuery({
    queryKey: ['mod_role_badges'],
    queryFn: getRoleBadges,
    staleTime: 1000 * 60 * 30,
  })
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/modActions.js src/lib/useModBadges.js
git commit -m "feat(mod): client wrappers for role/badge RPCs + badge hook"
```

---

## Task 5: Public moderator badges

**Files:** Create `src/components/ModBadge.jsx`; modify `src/components/ProfileHead.jsx`, `src/style.css`, `tests/mocks.js`, `tests/moderation.spec.js`.

- [ ] **Step 1: Implement `src/components/ModBadge.jsx`**

```jsx
import { useModBadges } from '../lib/useModBadges'

/** Read-only role badge shown on public profiles. Renders nothing for
 *  normal users or before the badge map loads. */
export default function ModBadge({ role }) {
  const { data: badges } = useModBadges()
  if (!role) return null
  const badge = badges?.find((b) => b.role === role)
  if (!badge) return null
  return (
    <span className="mod-badge" title={`${badge.label} · site moderator`}>
      <span aria-hidden="true">{badge.emoji}</span> {badge.label}
    </span>
  )
}
```

- [ ] **Step 2: Render it in `src/components/ProfileHead.jsx`**

Add the import at top:
```jsx
import ModBadge from './ModBadge'
```
Replace the `<h3>` line with the heading + badge:
```jsx
        <h3>
          {profile.display_name || profile.handle}
          <ModBadge role={profile.mod_role} />
        </h3>
```

- [ ] **Step 3: Add CSS in `src/style.css`** (append near profile styles)

```css
.mod-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 10px;
  padding: 2px 8px;
  font-family: var(--ui);
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--gold);
  border: 1px solid rgba(211, 162, 74, 0.4);
  border-radius: var(--r-pill);
  vertical-align: middle;
}
```

- [ ] **Step 4: Add the failing E2E** — create `tests/moderation.spec.js`

```js
import { test, expect } from '@playwright/test'
import { setupSupabaseMocks } from './mocks'

test.describe('Moderation — public badges', () => {
  test('a moderator profile shows their role badge', async ({ page }) => {
    await setupSupabaseMocks(page)
    // profiles GET by handle returns a warden (see mocks.js handle branch)
    await page.goto('/u/warden_wendy')
    await expect(page.getByText(/Warden/i)).toBeVisible()
  })
})
```

- [ ] **Step 5: Update `tests/mocks.js`** so the by-handle profile lookup can return a moderator and the badge map is served. In `setupSupabaseMocks`, replace the `handle=ilike.` branch body and add a `mod_role_badges` route:

```js
      if (url.includes('handle=ilike.') || url.includes('handle=eq.')) {
        route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify([{
            id: 'user-warden', handle: 'warden_wendy', display_name: 'Warden Wendy',
            avatar_url: null, mod_role: 'warden', mod_scope: 'all',
            created_at: '2026-06-01T00:00:00Z',
          }]),
        })
      } else {
```
And add (anywhere in `setupSupabaseMocks`):
```js
  await page.route('**/rest/v1/mod_role_badges*', async (route) => {
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify([
        { role: 'keeper', emoji: '🗝️', label: 'Keeper' },
        { role: 'warden', emoji: '🕯️', label: 'Warden' },
        { role: 'moderator', emoji: '👁️', label: 'Moderator' },
        { role: 'sentinel', emoji: '🔦', label: 'Sentinel' },
      ]),
    })
  })
```
Note: `getProfileByHandle` uses `.maybeSingle()` so it accepts a single-element array; keep the array form.

- [ ] **Step 6: Run E2E, verify pass**

Run: `npx playwright test moderation.spec.js --reporter=line`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/ModBadge.jsx src/components/ProfileHead.jsx src/style.css tests/moderation.spec.js tests/mocks.js
git commit -m "feat(mod): public moderator role badges on profiles"
```

---

## Task 6: Keeper Terminal route + access gate

**Files:** Create `src/pages/Moderation.jsx`; modify `src/App.jsx`, `src/components/Nav.jsx`, `src/style.css`, `tests/moderation.spec.js`, `tests/mocks.js`.

- [ ] **Step 1: Implement `src/pages/Moderation.jsx`** (shell + gate; tabs added in Tasks 7–8)

```jsx
import { useState } from 'react'
import { useAuth } from '../components/AuthContext'
import { isMod, modCan } from '../lib/moderation'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import RegistryTab from '../components/mod/RegistryTab'
import BadgesTab from '../components/mod/BadgesTab'

export default function Moderation() {
  useDocumentTitle('Keeper Terminal')
  const { profile, isLoading } = useAuth()
  const [tab, setTab] = useState('registry')

  if (isLoading) {
    return (
      <section className="surface active">
        <div className="status-panel"><p className="eyebrow">▸ Loading…</p></div>
      </section>
    )
  }

  // Disguised 404 for anyone without a moderation role (incl. signed-out).
  if (!isMod(profile)) {
    return (
      <section className="surface active">
        <div className="status-panel">
          <p className="eyebrow error">▸ 404 — page not found</p>
          <p className="status-panel-body">The page you’re looking for doesn’t exist.</p>
        </div>
      </section>
    )
  }

  const tabs = [
    modCan(profile, 'assign_role', 'all') && { id: 'registry', label: 'Registry' },
    modCan(profile, 'configure', 'all') && { id: 'badges', label: 'Badges' },
  ].filter(Boolean)

  // If the active tab isn't permitted, fall back to the first permitted one.
  const activeId = tabs.some((t) => t.id === tab) ? tab : tabs[0]?.id

  return (
    <section className="surface active mod-terminal">
      <p className="eyebrow">▸ Keeper Terminal</p>
      <h2 className="title">The <em>Terminal</em></h2>

      <div className="mod-tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={activeId === t.id}
            className={`mod-tab${activeId === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mod-tab-panel">
        {activeId === 'registry' && <RegistryTab profile={profile} />}
        {activeId === 'badges' && <BadgesTab />}
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Create placeholder tab components so the import resolves**

`src/components/mod/RegistryTab.jsx`:
```jsx
export default function RegistryTab() {
  return <p className="status-panel-body">Registry coming up.</p>
}
```
`src/components/mod/BadgesTab.jsx`:
```jsx
export default function BadgesTab() {
  return <p className="status-panel-body">Badges coming up.</p>
}
```

- [ ] **Step 3: Mount the route in `src/App.jsx`**

Add the lazy import with the others:
```jsx
const Moderation = lazy(() => import('./pages/Moderation'))
```
Replace the `{/* TODO(phase1): mount rebuilt Keeper Terminal route */}` line with:
```jsx
                <Route path="moderation" element={<Moderation />} />
```
(No `RequireAuth` wrapper — the gate handles signed-out as a disguised 404.)

- [ ] **Step 4: Gate the Nav link in `src/components/Nav.jsx`**

Add import:
```jsx
import { isMod } from '../lib/moderation'
```
Replace the `{/* TODO(phase1)… */}` + `{false && ( … )}` block with:
```jsx
        {isMod(profile) && (
          <NavLink to="/moderation" className={linkClass} style={{ color: 'var(--blood)' }}>
            [Terminal]
          </NavLink>
        )}
```

- [ ] **Step 5: Add terminal/tab CSS in `src/style.css`**

```css
.mod-tabs { display: flex; gap: 4px; flex-wrap: wrap; margin: 16px 0 24px; border-bottom: 1px solid var(--line-strong); }
.mod-tab {
  background: none; border: none; cursor: pointer;
  font-family: var(--ui); font-size: 13px; letter-spacing: 0.04em;
  padding: 8px 14px; color: var(--bone-dim); border-bottom: 2px solid transparent;
}
.mod-tab:hover { color: var(--bone); }
.mod-tab.active { color: var(--blood); border-bottom-color: var(--blood); }
```

- [ ] **Step 6: Add gate E2E to `tests/moderation.spec.js`**

```js
import { setupMockAuth, MOCK_SESSION } from './mocks'

test.describe('Moderation — terminal gate', () => {
  test('non-mod sees a disguised 404, no tabs', async ({ page }) => {
    await setupSupabaseMocks(page)            // MOCK_PROFILE has mod_role: null
    await setupMockAuth(page)
    await page.goto('/moderation')
    await expect(page.getByText(/404 — page not found/i)).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Registry' })).toHaveCount(0)
  })

  test('keeper sees the terminal with Registry + Badges tabs', async ({ page }) => {
    await setupSupabaseMocks(page, { mod_role: 'keeper' })  // see mocks change below
    await setupMockAuth(page)
    await page.goto('/moderation')
    await expect(page.getByRole('tab', { name: 'Registry' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Badges' })).toBeVisible()
  })
})
```

- [ ] **Step 7: Make the profile mock role configurable in `tests/mocks.js`**

Change the signature and the self-profile branch so the signed-in user's role can be overridden:
```js
export async function setupSupabaseMocks(page, opts = {}) {
  const selfProfile = { ...MOCK_PROFILE, mod_role: opts.mod_role ?? null, mod_scope: 'all' }
```
…and in the `profiles` GET `else` branch (the self lookup) return `selfProfile` instead of `MOCK_PROFILE`. Also add `mod_role: null, mod_scope: 'all'` to the exported `MOCK_PROFILE` object so non-mod paths are explicit.

- [ ] **Step 8: Run E2E, verify pass**

Run: `npx playwright test moderation.spec.js --reporter=line`
Expected: PASS (badge test + both gate tests).

- [ ] **Step 9: Commit**

```bash
git add src/pages/Moderation.jsx src/components/mod/ src/App.jsx src/components/Nav.jsx src/style.css tests/moderation.spec.js tests/mocks.js
git commit -m "feat(mod): keeper terminal route, access gate, gated nav link"
```

---

## Task 7: Registry tab — search + assign/revoke roles

**Files:** Modify `src/components/mod/RegistryTab.jsx`, `tests/moderation.spec.js`, `tests/mocks.js`, `src/style.css`.

- [ ] **Step 1: Implement `src/components/mod/RegistryTab.jsx`**

```jsx
import { useState } from 'react'
import { searchUsers, assignRole, revokeRole } from '../../lib/modActions'
import { useModBadges } from '../../lib/useModBadges'

const ROLES = ['sentinel', 'moderator', 'warden']
const SCOPES = ['all', 'forum', 'library']

export default function RegistryTab({ profile }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const { data: badges } = useModBadges()

  const onSearch = async (e) => {
    e.preventDefault()
    setError(null); setBusy(true)
    try { setResults(await searchUsers(q.trim())) }
    catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  const apply = async (id, role, scope) => {
    setError(null); setBusy(true)
    try {
      if (role === '') await revokeRole(id)
      else await assignRole(id, role, scope)
      setResults(await searchUsers(q.trim()))
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  return (
    <div className="mod-registry">
      <form onSubmit={onSearch} className="mod-search">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by handle…" aria-label="Search users" />
        <button type="submit" className="btn ghost" disabled={busy || !q.trim()}>▸ Search</button>
      </form>
      {error && <p className="form-err">{error}</p>}
      <ul className="mod-user-list">
        {results.map((u) => (
          <RegistryRow key={u.id} user={u} self={u.id === profile.id} badges={badges} onApply={apply} busy={busy} />
        ))}
      </ul>
    </div>
  )
}

function RegistryRow({ user, self, badges, onApply, busy }) {
  const [role, setRole] = useState(user.mod_role ?? '')
  const [scope, setScope] = useState(user.mod_scope ?? 'all')
  const badge = badges?.find((b) => b.role === user.mod_role)
  const scoped = role === 'sentinel' || role === 'moderator'
  return (
    <li className="mod-user-row">
      <span className="mod-user-handle">
        @{user.handle} {badge && <span title={badge.label}>{badge.emoji}</span>}
      </span>
      {self ? (
        <span className="mod-user-self">you (Keeper)</span>
      ) : (
        <span className="mod-user-controls">
          <select value={role} onChange={(e) => setRole(e.target.value)} aria-label={`Role for ${user.handle}`}>
            <option value="">— none —</option>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          {scoped && (
            <select value={scope} onChange={(e) => setScope(e.target.value)} aria-label={`Scope for ${user.handle}`}>
              {SCOPES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          <button type="button" className="btn ghost" disabled={busy} onClick={() => onApply(user.id, role, scope)}>Save</button>
        </span>
      )}
    </li>
  )
}
```

- [ ] **Step 2: Add E2E to `tests/moderation.spec.js`**

```js
test.describe('Moderation — registry', () => {
  test('keeper searches and assigns a role (calls set_mod_role)', async ({ page }) => {
    await setupSupabaseMocks(page, { mod_role: 'keeper' })
    await setupMockAuth(page)
    let rpcBody = null
    await page.route('**/rest/v1/rpc/set_mod_role*', async (route) => {
      rpcBody = JSON.parse(route.request().postData() || '{}')
      route.fulfill({ status: 204, contentType: 'application/json', body: '' })
    })
    await page.goto('/moderation')
    await page.getByLabel('Search users').fill('spooky')
    await page.getByRole('button', { name: /Search/i }).click()
    await expect(page.getByText('@spooky_newbie')).toBeVisible()
    await page.getByLabel(/Role for spooky_newbie/i).selectOption('moderator')
    await page.getByLabel(/Scope for spooky_newbie/i).selectOption('forum')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect.poll(() => rpcBody?.p_role).toBe('moderator')
    expect(rpcBody.p_scope).toBe('forum')
  })
})
```

- [ ] **Step 3: Ensure the user-search mock returns a candidate.** In `tests/mocks.js`, the `handle=ilike.` branch currently returns a warden for the badge test. Make it return BOTH a warden (for `/u/` lookups) and a searchable newbie is overkill; instead branch on the search used by Registry (`select=id,handle,...` with `limit`). Simplest: return an array with the newbie too:
```js
        route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify([
            { id: 'user-warden', handle: 'warden_wendy', display_name: 'Warden Wendy', avatar_url: null, mod_role: 'warden', mod_scope: 'all', created_at: '2026-06-01T00:00:00Z' },
            { id: 'user-newbie', handle: 'spooky_newbie', display_name: 'Spooky Newbie', avatar_url: null, mod_role: null, mod_scope: 'all', created_at: '2026-06-02T00:00:00Z' },
          ]),
        })
```
The `/u/warden_wendy` badge test uses `.maybeSingle()` → it reads the first row, still a warden, so that test stays green. The Registry list shows both rows; the test targets `spooky_newbie`.

- [ ] **Step 4: Add registry CSS in `src/style.css`**

```css
.mod-search { display: flex; gap: 8px; margin-bottom: 16px; }
.mod-search input { flex: 1; }
.mod-user-list { list-style: none; padding: 0; margin: 0; }
.mod-user-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 0; border-bottom: 1px solid rgba(243,236,217,.08); flex-wrap: wrap; }
.mod-user-controls { display: inline-flex; gap: 8px; align-items: center; }
.mod-user-self { color: var(--bone-dim); font-size: 13px; font-style: italic; }
```

- [ ] **Step 5: Run E2E, verify pass**

Run: `npx playwright test moderation.spec.js --reporter=line`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/mod/RegistryTab.jsx tests/moderation.spec.js tests/mocks.js src/style.css
git commit -m "feat(mod): registry tab — search + assign/revoke roles"
```

---

## Task 8: Badges tab — edit emoji↔role mapping

**Files:** Modify `src/components/mod/BadgesTab.jsx`, `tests/moderation.spec.js`.

- [ ] **Step 1: Implement `src/components/mod/BadgesTab.jsx`**

```jsx
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useModBadges } from '../../lib/useModBadges'
import { setRoleBadge } from '../../lib/modActions'

export default function BadgesTab() {
  const { data: badges, isLoading } = useModBadges()
  const qc = useQueryClient()
  const [draft, setDraft] = useState({})       // role -> {emoji,label}
  const [busy, setBusy] = useState(null)        // role currently saving
  const [error, setError] = useState(null)

  if (isLoading) return <p className="status-panel-body">Loading badges…</p>

  const valueFor = (b) => draft[b.role] ?? { emoji: b.emoji, label: b.label }

  const save = async (role) => {
    const v = draft[role]; if (!v) return
    setError(null); setBusy(role)
    try {
      await setRoleBadge(role, v.emoji, v.label)
      await qc.invalidateQueries({ queryKey: ['mod_role_badges'] })
      setDraft((d) => { const n = { ...d }; delete n[role]; return n })
    } catch (err) { setError(err.message) }
    finally { setBusy(null) }
  }

  return (
    <div className="mod-badges">
      {error && <p className="form-err">{error}</p>}
      <ul className="mod-user-list">
        {(badges ?? []).map((b) => {
          const v = valueFor(b)
          const set = (patch) => setDraft((d) => ({ ...d, [b.role]: { ...v, ...patch } }))
          return (
            <li key={b.role} className="mod-user-row">
              <span className="mod-user-handle">{b.role}</span>
              <span className="mod-user-controls">
                <input value={v.emoji} onChange={(e) => set({ emoji: e.target.value })} aria-label={`Emoji for ${b.role}`} style={{ width: 56, textAlign: 'center' }} />
                <input value={v.label} onChange={(e) => set({ label: e.target.value })} aria-label={`Label for ${b.role}`} />
                <button type="button" className="btn ghost" disabled={busy === b.role || !draft[b.role]} onClick={() => save(b.role)}>Save</button>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
```

- [ ] **Step 2: Add E2E to `tests/moderation.spec.js`**

```js
test.describe('Moderation — badges tab', () => {
  test('keeper edits a badge label (calls set_role_badge)', async ({ page }) => {
    await setupSupabaseMocks(page, { mod_role: 'keeper' })
    await setupMockAuth(page)
    let rpcBody = null
    await page.route('**/rest/v1/rpc/set_role_badge*', async (route) => {
      rpcBody = JSON.parse(route.request().postData() || '{}')
      route.fulfill({ status: 204, contentType: 'application/json', body: '' })
    })
    await page.goto('/moderation')
    await page.getByRole('tab', { name: 'Badges' }).click()
    const label = page.getByLabel('Label for warden')
    await expect(label).toBeVisible()
    await label.fill('Lampbearer')
    await page.getByRole('button', { name: 'Save' }).first().click()
    await expect.poll(() => rpcBody?.p_role).toBe('warden')
    expect(rpcBody.p_label).toBe('Lampbearer')
  })
})
```
Note: the Badges save buttons share the name "Save"; `.first()` targets warden because the badge mock orders keeper, warden, … — if ordering differs, target by row. Safer alternative: scope to the row — `page.locator('li', { hasText: 'warden' }).getByRole('button', { name: 'Save' })`. Use that locator.

- [ ] **Step 3: Run E2E, verify pass**

Run: `npx playwright test moderation.spec.js --reporter=line`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/mod/BadgesTab.jsx tests/moderation.spec.js
git commit -m "feat(mod): badges tab — edit emoji/label mapping"
```

---

## Task 9: Stale-mock cleanup + full green + manual smoke

**Files:** Modify `tests/mocks.js`; verify whole suite.

- [ ] **Step 1: Remove pre-baseline cruft from `tests/mocks.js`**

Delete the now-defunct exports/routes that reference dropped schema:
- `MOCK_MODERATION_FLAGS` export and the `**/rest/v1/moderation_flags*` route.
- The `is_admin` field and `approved=eq.false` branches are pre-baseline; leave other tables’ `approved` branches only if a current test still relies on them — grep first: `git grep -n "approved=eq.false\|moderation_flags\|is_admin" tests/`. Remove dead ones; keep anything a passing test references.

- [ ] **Step 2: Run the full unit + E2E suite**

Run: `npm run test:unit && npx playwright test --reporter=line`
Expected: all unit tests pass; all Playwright tests pass (existing 29 + new moderation specs).

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: builds clean.

- [ ] **Step 4: Manual smoke against the live DB (optional but recommended)**

With your Keeper account signed in on the deployed site (after deploy), open `/moderation`: the `[Terminal]` link appears, Registry + Badges tabs render, search returns users, and a role assignment writes a `mod_actions` row (verify via Supabase MCP `execute_sql`: `select action, target_user_id, metadata from public.mod_actions order by created_at desc limit 3;`).

- [ ] **Step 5: Commit**

```bash
git add tests/mocks.js
git commit -m "test(mod): drop pre-baseline mock cruft; phase 1 suite green"
```

---

## Deploy (after the branch merges to main)

1. Apply the migration to remote if not already: it was applied in Task 3.
2. `npm run build && npx wrangler pages deploy dist --project-name horrorwriter`
3. (Edge functions unchanged this phase.)

---

## Out of scope for Phase 1 (later phases)

Reporting/inline takedown (Phase 2), bans/appeals (Phase 3), audit-log UI + reversible-hide UX + mod notes (Phase 4), auto-filter (Phase 5), terminal polish + Community Guidelines (Phase 6). The Registry intentionally exposes only role assignment now; ban/shadowban controls land in Phase 3.
