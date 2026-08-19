# Harassment & Attack Protection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship six independently-deployable PRs of prophylactic, mostly-automated trust & safety
infrastructure — guidelines, blocking, report-abuse hardening, automated pre-screening, a
cross-signal storm detector, and appeals — before the site has its first real user.

**Architecture:** Postgres/Supabase migrations extend the existing moderation primitives
(`mod_status`, `mod_can()`, `content_visible()`, `reports`/`mod_actions`/`notifications`) rather
than introducing parallel systems. Two new Supabase Edge Functions (Deno, raw `fetch`, matching the
existing `urgent-report-email` pattern) call OpenAI's free Moderation endpoint, Claude Haiku 4.5,
and Pushover. React components follow existing conventions: Tailwind `var(--color-*)` tokens,
`sonner` toasts, TanStack Query mutations, `src/lib/*.js` as the client-side RPC boundary.

**Tech Stack:** Astro 7 + React islands, Supabase (Postgres + Edge Functions), TanStack Query,
Tailwind v4, vitest.

**Spec:** `docs/superpowers/specs/2026-08-18-harassment-attack-protection-design.md`

## Global Constraints

- **Visibility-only.** No task may delete or alter content. Automated and human moderation actions
  only ever change `mod_status` (`live`/`screening`/`hidden`) or exclude signals from a *standing*
  computation — the underlying row is never touched.
- **Solo maintainer, low-maintenance.** No new always-on infrastructure (no cron workers, no queues)
  unless a task says otherwise. Prefer triggers/RPCs invoked by existing insert paths over polling.
- **Free/cheap tiers only, except where explicitly named.** The mobile push alert (Pushover, Task
  10) is a deliberate, named exception approved by Jeff — a $5 one-time per-platform cost, not a
  subscription. Every other new dependency (OpenAI Moderation endpoint, Claude Haiku 4.5) stays
  free or near-free (~$0.0005/call).
- **`SECURITY DEFINER` functions set `search_path` explicitly** (`SET search_path = public` or
  `SET search_path = ''` with fully-qualified names), matching every existing function in
  `00000000000000_baseline.sql`. Never omit this — it's the standard Postgres search-path-injection
  guard already used throughout this schema.
- **New migration files go in `supabase/migrations/`, named `YYYYMMDDHHMMSS_<description>.sql`**,
  timestamped after the most recent existing migration (`20260702000000_revoke_trigger_fn_execute.sql`
  is the latest as of this plan — use a later timestamp, e.g. `20260819000000_...`).
- **No new npm dependencies for anything an existing convention already covers.** Edge functions
  use raw Deno `fetch`, not SDKs (matches `urgent-report-email`). Client code uses the existing
  `supabase` client from `src/supabaseClient.js`, not a new wrapper.

---

## Known deviations from the spec, decided during planning

**PR5's alert channel is Pushover, not Twilio/SMS.** The spec named Twilio/SMS as an illustrative
example of the deliberate paid-dependency exception, not a requirement. Jeff chose Pushover instead
during planning: a $5 one-time per-platform cost rather than per-message SMS billing, with a
simpler single-POST API (Task 10). Functionally equivalent — immediate mobile alert, bypasses quiet
hours at high priority — just a different vendor and pricing model.

**Vote-velocity is deferred from PR5.** The spec named "reports + replies + vote-velocity" as PR5's
three input signals. There is no votes/critique-score table anywhere in this schema — `book_comments`
has no score column, and no `votes` table exists. Building against a table that doesn't exist would
violate this plan's no-placeholder rule. PR5 (Tasks 9–11) ships with **reports + replies velocity
only**. Vote-velocity is a documented extension point, blocked on the separate, not-yet-designed
"vote/engagement integrity" sub-project defining a voting mechanism in the first place.

**PR4's worst-tier auto-pull is deferred, not built.** The spec states the worst-tier auto-pull
(pulling content from feeds/search immediately, not just hiding it) is gated on resolving the
mandatory-reporting/legal question in the existing "Content safety flagging" backlog item, and that
this is "a hard dependency, not paperwork to skip." Task 7 (the classifier pipeline) therefore
treats every confirmed flag identically — `screening`, the same conservative action as every other
automated flag — and worst-tier detections additionally get a distinct, urgently-worded
`mod_actions` entry so Jeff sees them first in the queue. The auto-pull-from-feeds behavior itself
is **not implemented in this plan**; it is a small, well-isolated follow-up task once legal signs
off (see the note at the end of Task 7).

**Automated actions are distinguished from human actions by `mod_actions.actor_id IS NULL`.**
`mod_actions.actor_id` is already nullable (`on delete set null`). Task 6 introduces
`apply_automated_mod_status()`, a service-role-only RPC that always logs `actor_id = NULL`. This
single convention is what makes Task 12's appeal cool-off logic possible without new schema: an
appeal of an automated flag is trivially distinguishable from an appeal of Jeff's own direct action.

---

## PR1 — Feedback guidelines at point of posting

### Task 1: Guidelines component above every comment/reply/thread composer

**Files:**
- Create: `src/lib/communityGuidelines.js`
- Create: `src/components/CommunityGuidelines.jsx`
- Create: `src/components/CommunityGuidelines.test.js`
- Modify: `src/pages-react/ReadStory.jsx` (critique composer, ~line 267-279)
- Modify: `src/pages-react/ThreadView.jsx` (reply composer)
- Modify: `src/pages-react/CreateThread.jsx` (new-thread composer)

**Interfaces:**
- Produces: `GUIDELINES_TEXT` (named string export from `communityGuidelines.js`), `<CommunityGuidelines />` (default export, no props, renders a static block)

- [ ] **Step 1: Write the failing test**

```js
// src/components/CommunityGuidelines.test.js
import { render, screen } from '@testing-library/react'
import { test, expect, describe } from 'vitest'
import CommunityGuidelines from './CommunityGuidelines'
import { GUIDELINES_TEXT } from '../lib/communityGuidelines'

describe('CommunityGuidelines', () => {
  test('renders the guidelines heading and body text', () => {
    render(<CommunityGuidelines />)
    expect(screen.getByText(/before you post/i)).toBeInTheDocument()
    expect(screen.getByText(GUIDELINES_TEXT.split('\n')[0])).toBeInTheDocument()
  })

  test('is not dismissible — no close button', () => {
    render(<CommunityGuidelines />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- CommunityGuidelines`
Expected: FAIL — `Cannot find module './CommunityGuidelines'`

- [ ] **Step 3: Write the guidelines content**

```js
// src/lib/communityGuidelines.js
// Shown, unabridged, directly above every comment/reply/thread composer.
// Editable content — no code changes needed to update wording.
export const GUIDELINES_TEXT = `Critique the work, not the writer. Say what's not working and why — vague praise and vague put-downs both waste the author's time.
Harassment, hate speech, and personal attacks get content removed and can cost you your account.
Disagreement is fine. Cruelty isn't.`
```

- [ ] **Step 4: Write the component**

```jsx
// src/components/CommunityGuidelines.jsx
import { GUIDELINES_TEXT } from '../lib/communityGuidelines'

export default function CommunityGuidelines() {
  return (
    <div className="mb-4 border border-[#2d2d2a] bg-[var(--color-bg-primary)] px-4 py-3">
      <p className="font-mono text-xs uppercase tracking-wider text-[var(--color-text-secondary)] mb-2">
        Before you post
      </p>
      <div className="font-serif text-sm text-[var(--color-text-secondary)] leading-relaxed whitespace-pre-line">
        {GUIDELINES_TEXT}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test:unit -- CommunityGuidelines`
Expected: PASS

- [ ] **Step 6: Wire into the critique composer in ReadStory.jsx**

Find the comment form block (around line 269, `<h4 className="font-serif font-bold text-sm ...">Leave a critique</h4>`). Add the import at the top of the file (`import CommunityGuidelines from '../components/CommunityGuidelines'`) and render it directly above the `<MarkdownEditor>`:

```jsx
          <form onSubmit={handleCommentSubmit} className="mt-8 border-t border-[#2d2d2a] pt-8">
            <h4 className="font-serif font-bold text-sm text-[var(--color-text-primary)] mb-4 uppercase tracking-wide">
              Leave a critique
            </h4>
            <CommunityGuidelines />
            <div className="mb-4">
              <MarkdownEditor
```

- [ ] **Step 7: Wire into the reply composer in ThreadView.jsx and the new-thread composer in CreateThread.jsx**

Find each file's post/thread `<form>` block (the one containing the `MarkdownEditor` used for the reply/thread body) and add the same import + `<CommunityGuidelines />` placement immediately above the editor, matching Step 6's pattern.

- [ ] **Step 8: Manual verification**

Run `npm run dev`, open a story page, a thread page, and the new-thread page. Confirm the guidelines block renders above each composer, is not dismissible, and doesn't shift focus away from the textarea on load.

- [ ] **Step 9: Run full unit suite**

Run: `npm run test:unit`
Expected: all tests pass (existing count + 2 new)

- [ ] **Step 10: Commit**

```bash
git add src/lib/communityGuidelines.js src/components/CommunityGuidelines.jsx src/components/CommunityGuidelines.test.js src/pages-react/ReadStory.jsx src/pages-react/ThreadView.jsx src/pages-react/CreateThread.jsx
git commit -m "feat(safety): show community guidelines above every composer"
```

---

## PR2 — Blocking / muting

### Task 2: `user_blocks` table, RLS, and enforcement at both read and write time

**Files:**
- Create: `supabase/migrations/20260819000000_user_blocks.sql`

**Interfaces:**
- Produces: table `public.user_blocks(id, blocker_id, blocked_id, created_at)`; modified
  `public.content_visible(p_status, p_author, p_area)` (now also returns `false` when the current
  viewer has blocked `p_author`); two new INSERT `WITH CHECK` clauses on `book_comments` and `posts`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260819000000_user_blocks.sql

-- ── 1. user_blocks table ─────────────────────────────────────────────
create table public.user_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  constraint user_blocks_no_self_block check (blocker_id <> blocked_id),
  unique (blocker_id, blocked_id)
);
create index idx_user_blocks_blocker on public.user_blocks(blocker_id);
create index idx_user_blocks_blocked on public.user_blocks(blocked_id);

alter table public.user_blocks enable row level security;

-- A user can see and manage only their own block list. Being blocked is not
-- discoverable by the blocked party (avoids retaliation), so there's no
-- policy exposing rows where blocked_id = auth.uid().
create policy "user_blocks_select_own" on public.user_blocks for select
  using (blocker_id = (select auth.uid()));

create policy "user_blocks_insert_own" on public.user_blocks for insert
  with check (blocker_id = (select auth.uid()));

create policy "user_blocks_delete_own" on public.user_blocks for delete
  using (blocker_id = (select auth.uid()));

-- ── 2. Extend content_visible() to hide blocked authors' content ────────
-- Replaces the Step 4 function from 00000000000000_baseline.sql. Adds one
-- clause: a viewer who has blocked p_author never sees that author's
-- content, regardless of mod_status. This covers books/threads/posts/
-- book_comments in one place since all four SELECT policies already call
-- this function.
create or replace function public.content_visible(p_status text, p_author uuid, p_area text)
returns boolean language sql stable security definer set search_path = public as $$
  select
    (
      ( p_status = 'live'
        and not coalesce((select is_shadowbanned from public.profiles where id = p_author), false) )
      or (select auth.uid()) = p_author
      or public.mod_can('view_hidden', p_area)
    )
    and not exists (
      select 1 from public.user_blocks
      where blocker_id = (select auth.uid()) and blocked_id = p_author
    );
$$;

-- ── 3. Enforce at write time: a blocked author cannot comment on or reply
--    to content owned by the person who blocked them ───────────────────
-- book_comments: cannot critique a story whose author has blocked you.
drop policy if exists "Users can insert their own book comments." on public.book_comments;
create policy "Users can insert their own book comments." on public.book_comments
  for insert with check (
    (select auth.uid()) = author_id
    and not exists (
      select 1 from public.user_blocks ub
      join public.books b on b.id = book_id
      where ub.blocker_id = b.author_id and ub.blocked_id = author_id
    )
  );

-- posts: cannot reply in a thread whose author has blocked you.
drop policy if exists "Users can insert their own posts." on public.posts;
create policy "Users can insert their own posts." on public.posts
  for insert with check (
    (select auth.uid()) = author_id
    and not exists (
      select 1 from public.user_blocks ub
      join public.threads t on t.id = thread_id
      where ub.blocker_id = t.author_id and ub.blocked_id = author_id
    )
  );
```

- [ ] **Step 2: Apply the migration**

Run: `cd D:\CLAUDECODE\Projects\horrorwriter && npx supabase db push` (or via `mcp__supabase__apply_migration` if working through the MCP tool against the linked project)

Expected: migration applies with no errors.

- [ ] **Step 3: Manually verify the block enforces both directions**

Using the Supabase SQL editor (or `mcp__supabase__execute_sql`) against a scratch pair of test
profile IDs:

```sql
-- as user A, block user B
insert into public.user_blocks (blocker_id, blocked_id) values ('<A>', '<B>');

-- confirm the unique constraint and self-block guard
insert into public.user_blocks (blocker_id, blocked_id) values ('<A>', '<A>'); -- expect: check violation
insert into public.user_blocks (blocker_id, blocked_id) values ('<A>', '<B>'); -- expect: unique violation

-- confirm content_visible() now excludes B's content for A
select public.content_visible('live', '<B>', 'library'); -- as A: expect false
```

Expected: self-block and duplicate-block both rejected; `content_visible` returns `false` for a
blocked author when queried as the blocker.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260819000000_user_blocks.sql
git commit -m "feat(safety): add user_blocks table, RLS, and write-time enforcement"
```

### Task 3: Client-side blocking library

**Files:**
- Create: `src/lib/blocking.js`
- Create: `src/lib/blocking.test.js`

**Interfaces:**
- Consumes: `supabase` from `src/supabaseClient.js` (existing pattern, see `src/lib/modActions.js:1`)
- Produces: `blockUser(blockedId)`, `unblockUser(blockedId)`, `isBlocked(blockedId)`,
  `listBlockedUsers()` — all `async`, all throw `Error(message)` on failure, matching
  `modActions.js`'s error convention exactly

- [ ] **Step 1: Write the failing tests**

```js
// src/lib/blocking.test.js
import { test, expect, describe, vi, beforeEach } from 'vitest'

const mockAuth = { getUser: vi.fn() }
const mockFrom = vi.fn()
vi.mock('../supabaseClient', () => ({
  supabase: { auth: mockAuth, from: (...args) => mockFrom(...args) },
}))

const { blockUser, unblockUser, isBlocked, listBlockedUsers } = await import('./blocking')

beforeEach(() => {
  mockAuth.getUser.mockReset()
  mockFrom.mockReset()
})

describe('blockUser', () => {
  test('inserts a user_blocks row for the current user', async () => {
    mockAuth.getUser.mockResolvedValue({ data: { user: { id: 'user-a' } } })
    const insert = vi.fn().mockResolvedValue({ error: null })
    mockFrom.mockReturnValue({ insert })

    await blockUser('user-b')

    expect(mockFrom).toHaveBeenCalledWith('user_blocks')
    expect(insert).toHaveBeenCalledWith([{ blocker_id: 'user-a', blocked_id: 'user-b' }])
  })

  test('throws when not signed in', async () => {
    mockAuth.getUser.mockResolvedValue({ data: { user: null } })
    await expect(blockUser('user-b')).rejects.toThrow('signed in')
  })

  test('surfaces the database error message', async () => {
    mockAuth.getUser.mockResolvedValue({ data: { user: { id: 'user-a' } } })
    mockFrom.mockReturnValue({ insert: vi.fn().mockResolvedValue({ error: { message: 'boom' } }) })
    await expect(blockUser('user-b')).rejects.toThrow('boom')
  })
})

describe('unblockUser', () => {
  test('deletes the matching user_blocks row', async () => {
    mockAuth.getUser.mockResolvedValue({ data: { user: { id: 'user-a' } } })
    const eq2 = vi.fn().mockResolvedValue({ error: null })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
    mockFrom.mockReturnValue({ delete: vi.fn().mockReturnValue({ eq: eq1 }) })

    await unblockUser('user-b')

    expect(mockFrom).toHaveBeenCalledWith('user_blocks')
    expect(eq1).toHaveBeenCalledWith('blocker_id', 'user-a')
    expect(eq2).toHaveBeenCalledWith('blocked_id', 'user-b')
  })
})

describe('isBlocked', () => {
  test('returns true when a row exists', async () => {
    mockAuth.getUser.mockResolvedValue({ data: { user: { id: 'user-a' } } })
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: 'blk-1' }, error: null })
    const eq2 = vi.fn().mockReturnValue({ maybeSingle })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
    mockFrom.mockReturnValue({ select: vi.fn().mockReturnValue({ eq: eq1 }) })

    expect(await isBlocked('user-b')).toBe(true)
  })

  test('returns false when signed out', async () => {
    mockAuth.getUser.mockResolvedValue({ data: { user: null } })
    expect(await isBlocked('user-b')).toBe(false)
  })
})

describe('listBlockedUsers', () => {
  test('returns blocked profiles for the current user', async () => {
    mockAuth.getUser.mockResolvedValue({ data: { user: { id: 'user-a' } } })
    const eq = vi.fn().mockResolvedValue({
      data: [{ blocked_id: 'user-b', profiles: { handle: 'nightowl' } }],
      error: null,
    })
    mockFrom.mockReturnValue({ select: vi.fn().mockReturnValue({ eq }) })

    const result = await listBlockedUsers()
    expect(result).toEqual([{ blocked_id: 'user-b', profiles: { handle: 'nightowl' } }])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- blocking`
Expected: FAIL — `Cannot find module './blocking'`

- [ ] **Step 3: Write the implementation**

```js
// src/lib/blocking.js
import { supabase } from '../supabaseClient'

async function requireUser() {
  if (!supabase) throw new Error('Supabase not configured')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('You must be signed in to do that.')
  return user
}

/** Block a user: their content becomes invisible to you and they can't reply to you. */
export async function blockUser(blockedId) {
  const user = await requireUser()
  const { error } = await supabase
    .from('user_blocks')
    .insert([{ blocker_id: user.id, blocked_id: blockedId }])
  if (error) throw new Error(error.message)
}

/** Reverse a block. */
export async function unblockUser(blockedId) {
  const user = await requireUser()
  const { error } = await supabase
    .from('user_blocks')
    .delete()
    .eq('blocker_id', user.id)
    .eq('blocked_id', blockedId)
  if (error) throw new Error(error.message)
}

/** True if the current user has blocked blockedId. False (not thrown) when signed out. */
export async function isBlocked(blockedId) {
  if (!supabase) return false
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data, error } = await supabase
    .from('user_blocks')
    .select('id')
    .eq('blocker_id', user.id)
    .eq('blocked_id', blockedId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return !!data
}

/** List everyone the current user has blocked, for a settings/blocklist page. */
export async function listBlockedUsers() {
  const user = await requireUser()
  const { data, error } = await supabase
    .from('user_blocks')
    .select('blocked_id, profiles!user_blocks_blocked_id_fkey(handle, display_name, avatar_url)')
    .eq('blocker_id', user.id)
  if (error) throw new Error(error.message)
  return data ?? []
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- blocking`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/blocking.js src/lib/blocking.test.js
git commit -m "feat(safety): add blocking client library"
```

### Task 4: Block button UI, wired into story/thread/profile views

**Files:**
- Create: `src/components/BlockButton.jsx`
- Create: `src/components/BlockButton.test.js`
- Modify: `src/pages-react/ReadStory.jsx` (next to the existing "Report" button, ~line 186-191)
- Modify: `src/pages-react/UserProfile.jsx` (profile header, next to `FollowButton`)

**Interfaces:**
- Consumes: `blockUser`, `unblockUser`, `isBlocked` from Task 3's `src/lib/blocking.js`
- Produces: `<BlockButton targetUserId={string} targetHandle={string} />` (default export)

- [ ] **Step 1: Write the failing test**

```js
// src/components/BlockButton.test.js
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { test, expect, describe, vi, beforeEach } from 'vitest'

const blockUser = vi.fn()
const unblockUser = vi.fn()
const isBlocked = vi.fn()
vi.mock('../lib/blocking', () => ({ blockUser: (...a) => blockUser(...a), unblockUser: (...a) => unblockUser(...a), isBlocked: (...a) => isBlocked(...a) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const BlockButton = (await import('./BlockButton')).default

beforeEach(() => {
  blockUser.mockReset()
  unblockUser.mockReset()
  isBlocked.mockReset().mockResolvedValue(false)
})

describe('BlockButton', () => {
  test('shows "Block" when not blocked, calls blockUser on click', async () => {
    render(<BlockButton targetUserId="user-b" targetHandle="nightowl" />)
    await waitFor(() => expect(screen.getByText(/^block$/i)).toBeInTheDocument())
    fireEvent.click(screen.getByText(/^block$/i))
    await waitFor(() => expect(blockUser).toHaveBeenCalledWith('user-b'))
  })

  test('shows "Unblock" when already blocked, calls unblockUser on click', async () => {
    isBlocked.mockResolvedValue(true)
    render(<BlockButton targetUserId="user-b" targetHandle="nightowl" />)
    await waitFor(() => expect(screen.getByText(/^unblock$/i)).toBeInTheDocument())
    fireEvent.click(screen.getByText(/^unblock$/i))
    await waitFor(() => expect(unblockUser).toHaveBeenCalledWith('user-b'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- BlockButton`
Expected: FAIL — `Cannot find module './BlockButton'`

- [ ] **Step 3: Write the component**

```jsx
// src/components/BlockButton.jsx
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { blockUser, unblockUser, isBlocked } from '../lib/blocking'

export default function BlockButton({ targetUserId, targetHandle }) {
  const [blocked, setBlocked] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    isBlocked(targetUserId).then((v) => { if (!cancelled) setBlocked(v) }).catch(() => {})
    return () => { cancelled = true }
  }, [targetUserId])

  const handleClick = async () => {
    setBusy(true)
    try {
      if (blocked) {
        await unblockUser(targetUserId)
        setBlocked(false)
        toast.success(`Unblocked @${targetHandle}`)
      } else {
        await blockUser(targetUserId)
        setBlocked(true)
        toast.success(`Blocked @${targetHandle}. Their content is now hidden from you.`)
      }
    } catch (err) {
      toast.error(err.message || 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={busy}
      className="text-xs uppercase border border-[#2d2d2a] hover:border-red-950 px-2 py-0.5 text-[var(--color-text-secondary)] hover:text-[var(--color-accent-crimson)] cursor-pointer disabled:opacity-50"
    >
      {blocked ? 'Unblock' : 'Block'}
    </button>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- BlockButton`
Expected: PASS (2 tests)

- [ ] **Step 5: Wire into ReadStory.jsx**

Next to the existing `Report` button (around line 186-191, inside the `flex justify-center items-center gap-4` row), add, guarded so an author never sees a block button for themself:

```jsx
{book && session?.user?.id !== book.author_id && (
  <BlockButton targetUserId={book.author_id} targetHandle={book?.profiles?.handle} />
)}
```

Add `import BlockButton from '../components/BlockButton'` at the top of the file.

- [ ] **Step 6: Wire into UserProfile.jsx**

Find where `FollowButton` is rendered on the profile header and add `BlockButton` next to it with
the same self-guard (`session?.user?.id !== profile.id`), importing it the same way.

- [ ] **Step 7: Manual verification**

`npm run dev` — visit a story by another test account, click Block, confirm the toast and that the
button flips to "Unblock". Refresh and confirm the state persists (reads `isBlocked` on mount).

- [ ] **Step 8: Run full unit suite**

Run: `npm run test:unit`
Expected: all pass

- [ ] **Step 9: Commit**

```bash
git add src/components/BlockButton.jsx src/components/BlockButton.test.js src/pages-react/ReadStory.jsx src/pages-react/UserProfile.jsx
git commit -m "feat(safety): add block button to story and profile views"
```

---

## PR3 — Report rate-limit + pile-on detection

### Task 5: Harden `handle_new_report` — rolling window, corroboration check, screening not hiding

**Files:**
- Create: `supabase/migrations/20260819010000_report_pileup_hardening.sql`

**Interfaces:**
- Produces: modified `public.enforce_rate_limit()` (adds a `reports` branch), modified
  `public.handle_new_report()` (rolling-window + corroboration-aware, action changed from
  auto-`hidden` to auto-`screening`)

**What this replaces, and why:** the existing `handle_new_report()` trigger (from
`20260610020000_mod_phase2_reports.sql`) auto-hides content the moment it accumulates 5 *lifetime*
distinct reporters, with no time window and no check on whether the reports carry any actual
detail. That is exactly the shape of a coordinated pile-on attack — five accounts, no corroborating
detail, spread over however long it takes to create them, and the content goes straight to
`hidden`. This task narrows the window to 60 minutes, requires that at least half the reports in
that window carry non-empty `details` before auto-acting, and softens the auto-action from `hidden`
to `screening` (visibility-gated pending review, easier to reverse) — consistent with this
project's visibility-only philosophy. A pile-on that fails the corroboration check no longer
auto-acts on content at all; it only raises a flagged `mod_actions` entry for Jeff's review.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260819010000_report_pileup_hardening.sql

-- ── 1. Rate-limit report submissions per reporter ────────────────────
-- enforce_rate_limit() is a generic trigger already used on books/posts/
-- threads; add a 'reports' branch (5 reports per 15 minutes per reporter)
-- and attach it.
CREATE OR REPLACE FUNCTION "public"."enforce_rate_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  recent_count integer;
  limit_count integer;
  limit_interval interval;
begin
  if TG_TABLE_NAME = 'posts' then
    limit_count := 10;
    limit_interval := interval '5 minutes';
  elsif TG_TABLE_NAME = 'threads' then
    limit_count := 5;
    limit_interval := interval '15 minutes';
  elsif TG_TABLE_NAME = 'books' then
    limit_count := 3;
    limit_interval := interval '1 hour';
  elsif TG_TABLE_NAME = 'reports' then
    limit_count := 5;
    limit_interval := interval '15 minutes';
  else
    return new;
  end if;

  if TG_TABLE_NAME = 'reports' then
    execute format(
      'select count(*) from public.%I where reporter_id = $1 and created_at > (now() - $2)',
      TG_TABLE_NAME
    )
    into recent_count
    using auth.uid(), limit_interval;
  else
    execute format(
      'select count(*) from public.%I where author_id = $1 and created_at > (now() - $2)',
      TG_TABLE_NAME
    )
    into recent_count
    using auth.uid(), limit_interval;
  end if;

  if recent_count >= limit_count then
    raise exception 'Rate limit exceeded for %. You must wait before posting again.', TG_TABLE_NAME;
  end if;

  return new;
end;
$_$;

DROP TRIGGER IF EXISTS rate_limit_reports ON public.reports;
CREATE TRIGGER rate_limit_reports BEFORE INSERT ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.enforce_rate_limit();

-- ── 2. Rolling-window, corroboration-aware pile-on handling ──────────
CREATE OR REPLACE FUNCTION public.handle_new_report()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_distinct_reporters integer;
  v_corroborated_reporters integer;
  v_current_status text;
  v_author_id uuid;
  v_window interval := interval '60 minutes';
BEGIN
  IF NEW.target_type IN ('story', 'critique', 'thread', 'post') THEN

    SELECT count(distinct reporter_id) INTO v_distinct_reporters
    FROM public.reports
    WHERE target_type = NEW.target_type
      AND target_id = NEW.target_id
      AND created_at > (now() - v_window);

    SELECT count(distinct reporter_id) INTO v_corroborated_reporters
    FROM public.reports
    WHERE target_type = NEW.target_type
      AND target_id = NEW.target_id
      AND created_at > (now() - v_window)
      AND details IS NOT NULL AND length(trim(details)) > 0;

    IF v_distinct_reporters >= 5 THEN
      -- Fetch current status/author regardless of which branch we take below.
      IF NEW.target_type = 'story' THEN
        SELECT mod_status, author_id INTO v_current_status, v_author_id FROM public.books WHERE id = NEW.target_id;
      ELSIF NEW.target_type = 'thread' THEN
        SELECT mod_status, author_id INTO v_current_status, v_author_id FROM public.threads WHERE id = NEW.target_id;
      ELSIF NEW.target_type = 'post' THEN
        SELECT mod_status, author_id INTO v_current_status, v_author_id FROM public.posts WHERE id = NEW.target_id;
      ELSIF NEW.target_type = 'critique' THEN
        SELECT mod_status, author_id INTO v_current_status, v_author_id FROM public.book_comments WHERE id = NEW.target_id;
      END IF;

      IF v_corroborated_reporters * 2 >= v_distinct_reporters THEN
        -- At least half the recent reporters gave actual detail: treat as
        -- likely-genuine, auto-screen (not hide) pending review.
        IF v_current_status = 'live' THEN
          IF NEW.target_type = 'story' THEN
            UPDATE public.books SET mod_status = 'screening' WHERE id = NEW.target_id;
          ELSIF NEW.target_type = 'thread' THEN
            UPDATE public.threads SET mod_status = 'screening' WHERE id = NEW.target_id;
          ELSIF NEW.target_type = 'post' THEN
            UPDATE public.posts SET mod_status = 'screening' WHERE id = NEW.target_id;
          ELSIF NEW.target_type = 'critique' THEN
            UPDATE public.book_comments SET mod_status = 'screening' WHERE id = NEW.target_id;
          END IF;

          INSERT INTO public.mod_actions (action, target_type, target_id, target_user_id, reason)
          VALUES ('screen', NEW.target_type, NEW.target_id, v_author_id,
                  format('Auto-screened: %s distinct reports in the last hour, %s corroborated', v_distinct_reporters, v_corroborated_reporters));

          INSERT INTO public.notifications (user_id, kind, title, body)
          VALUES (
            v_author_id, 'content_actioned', 'Content Under Review',
            'Your ' || NEW.target_type || ' was automatically placed under review due to multiple community reports. A moderator will review it shortly.'
          );
        END IF;
      ELSE
        -- Low corroboration: shaped like a pile-on. Do NOT touch mod_status.
        -- Raise a flagged mod_actions entry for human review instead.
        INSERT INTO public.mod_actions (action, target_type, target_id, target_user_id, reason)
        VALUES ('pile_on_flag', NEW.target_type, NEW.target_id, v_author_id,
                format('PILE-ON PATTERN: %s distinct reports in the last hour, only %s corroborated with details. No automatic action taken — review needed.', v_distinct_reporters, v_corroborated_reporters));
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db push` (or `mcp__supabase__apply_migration`)

- [ ] **Step 3: Manually verify both branches**

```sql
-- Corroborated case: 5 distinct reporters, 3 with details -> expect mod_status = 'screening'
-- and a mod_actions row with action = 'screen'.

-- Pile-on case: 5 distinct reporters, 0 with details -> expect mod_status unchanged ('live')
-- and a mod_actions row with action = 'pile_on_flag'.

select action, reason from public.mod_actions where target_id = '<test target>' order by created_at desc limit 1;
select mod_status from public.books where id = '<test target>';
```

Expected: the two scenarios produce the two different outcomes described above.

- [ ] **Step 4: Verify the reporter rate limit**

As a single test account, submit 6 reports within 15 minutes against distinct targets.

Expected: the 6th insert raises `Rate limit exceeded for reports. You must wait before posting again.`

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260819010000_report_pileup_hardening.sql
git commit -m "fix(safety): rolling-window + corroboration check on report auto-action, add report rate limit"
```

---

## PR4 — Automated two-stage pre-screening

### Task 6: `reports.source` column + service-role-only automated mod-status RPC

**Files:**
- Create: `supabase/migrations/20260819020000_automated_mod_status.sql`

**Interfaces:**
- Produces: `reports.source` column (`text`, `check (source in ('user','automated'))`, default
  `'user'`); RPC `public.apply_automated_mod_status(p_target_type text, p_target_id uuid, p_status
  text, p_reason text)`, `SECURITY DEFINER`, grantable to `service_role` only; modified
  `public.prevent_mod_status_reset()` (adds a bypass path for this RPC)

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260819020000_automated_mod_status.sql

-- ── 1. Track which reports came from the automated pipeline ─────────
ALTER TABLE public.reports
  ADD COLUMN source text NOT NULL DEFAULT 'user' CHECK (source IN ('user', 'automated'));

-- ── 2. Let a trusted automated caller bypass prevent_mod_status_reset ─
-- Session-local flag, set only inside apply_automated_mod_status() below,
-- never exposed to anon/authenticated. Matches the existing TG_ARGV-based
-- area check already on this trigger.
CREATE OR REPLACE FUNCTION public.prevent_mod_status_reset()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.mod_status IS DISTINCT FROM OLD.mod_status
     AND NOT public.mod_can('hide',   TG_ARGV[0])
     AND NOT public.mod_can('screen', TG_ARGV[0])
     AND coalesce(current_setting('app.automated_mod_action', true), '') <> 'true'
  THEN
    RAISE EXCEPTION 'permission denied: cannot modify mod_status without moderation permission';
  END IF;
  RETURN NEW;
END;
$$;

-- ── 3. The RPC the classifier pipeline calls ─────────────────────────
-- actor_id is always NULL here — that's the marker this plan uses
-- throughout to distinguish an automated action from a human one (see
-- Task 12's appeal cool-off logic).
CREATE OR REPLACE FUNCTION public.apply_automated_mod_status(
  p_target_type text,
  p_target_id uuid,
  p_status text, -- 'screening' only, in this plan — see Task 7's note on worst-tier
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author_id uuid;
BEGIN
  IF p_status NOT IN ('screening', 'hidden') THEN
    RAISE EXCEPTION 'apply_automated_mod_status only accepts screening or hidden, got %', p_status;
  END IF;

  PERFORM set_config('app.automated_mod_action', 'true', true);

  IF p_target_type = 'story' THEN
    UPDATE public.books SET mod_status = p_status WHERE id = p_target_id RETURNING author_id INTO v_author_id;
  ELSIF p_target_type = 'thread' THEN
    UPDATE public.threads SET mod_status = p_status WHERE id = p_target_id RETURNING author_id INTO v_author_id;
  ELSIF p_target_type = 'post' THEN
    UPDATE public.posts SET mod_status = p_status WHERE id = p_target_id RETURNING author_id INTO v_author_id;
  ELSIF p_target_type = 'critique' THEN
    UPDATE public.book_comments SET mod_status = p_status WHERE id = p_target_id RETURNING author_id INTO v_author_id;
  ELSE
    RAISE EXCEPTION 'Invalid target type: %', p_target_type;
  END IF;

  PERFORM set_config('app.automated_mod_action', 'false', true);

  IF v_author_id IS NULL THEN
    RAISE EXCEPTION 'Content not found';
  END IF;

  INSERT INTO public.mod_actions (actor_id, action, target_type, target_id, target_user_id, reason)
  VALUES (NULL, 'auto_' || p_status, p_target_type, p_target_id, v_author_id, p_reason);

  INSERT INTO public.notifications (user_id, kind, title, body)
  VALUES (
    v_author_id, 'content_actioned', 'Content Under Automated Review',
    'Your ' || p_target_type || ' was automatically placed under review by our safety system. Reason: ' || COALESCE(p_reason, 'No reason provided.')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_automated_mod_status(text, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_automated_mod_status(text, uuid, text, text) TO service_role;
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db push`

- [ ] **Step 3: Manually verify the RPC and its bypass**

```sql
-- As anon/authenticated (should fail — no EXECUTE grant):
select public.apply_automated_mod_status('story', '<id>', 'screening', 'test');
-- expect: permission denied for function apply_automated_mod_status

-- Via service role (e.g. through the Supabase SQL editor using the service key,
-- or from mcp__supabase__execute_sql which runs with elevated privilege):
select public.apply_automated_mod_status('story', '<id>', 'screening', 'test flag');
select mod_status from public.books where id = '<id>'; -- expect 'screening'
select actor_id, action, reason from public.mod_actions where target_id = '<id>' order by created_at desc limit 1;
-- expect actor_id IS NULL, action = 'auto_screening'
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260819020000_automated_mod_status.sql
git commit -m "feat(safety): add reports.source and service-role-only apply_automated_mod_status RPC"
```

### Task 7: `moderate-content` Edge Function — two-stage classifier

**Files:**
- Create: `supabase/functions/moderate-content/index.ts`

**Interfaces:**
- Consumes: `apply_automated_mod_status` RPC from Task 6; `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`
  Supabase Edge Function secrets (provisioned in Step 4, not committed)
- Produces: HTTP endpoint invoked as `supabase.functions.invoke('moderate-content', { body:
  { targetType, targetId } })`

- [ ] **Step 1: Write the function**

```ts
// supabase/functions/moderate-content/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Maps our target_type vocabulary to the table/content-column it lives in.
const TARGET_TABLE = {
  story: { table: 'books', column: 'content' },
  critique: { table: 'book_comments', column: 'content' },
  thread: { table: 'threads', column: 'title' },
  post: { table: 'posts', column: 'content' },
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { targetType, targetId } = await req.json()
    if (!targetType || !targetId) throw new Error('Missing targetType or targetId')
    const mapping = TARGET_TABLE[targetType]
    if (!mapping) throw new Error(`Unknown targetType: ${targetType}`)

    // Service-role client: this function needs to read content regardless of
    // RLS (it runs unauthenticated, right after insert) and needs to call
    // apply_automated_mod_status(), which is service-role-only by design.
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: row, error: fetchError } = await supabaseAdmin
      .from(mapping.table)
      .select(mapping.column)
      .eq('id', targetId)
      .single()
    if (fetchError || !row) throw new Error('Target content not found')

    const content = row[mapping.column]
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return new Response(JSON.stringify({ flagged: false, reason: 'empty content' }), { headers: corsHeaders })
    }

    // ── Stage 1: OpenAI Moderation endpoint (free, runs on everything) ──
    const openaiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiKey) {
      console.error('[moderate-content] OPENAI_API_KEY not set — skipping stage 1')
      return new Response(JSON.stringify({ flagged: false, reason: 'stage 1 unavailable' }), { headers: corsHeaders })
    }

    const modRes = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
      body: JSON.stringify({ model: 'omni-moderation-latest', input: content }),
    })
    if (!modRes.ok) {
      console.error('[moderate-content] OpenAI moderation call failed', await modRes.text())
      return new Response(JSON.stringify({ flagged: false, reason: 'stage 1 error' }), { headers: corsHeaders })
    }
    const modJson = await modRes.json()
    const result = modJson.results?.[0]
    if (!result?.flagged) {
      return new Response(JSON.stringify({ flagged: false }), { headers: corsHeaders })
    }

    const flaggedCategories = Object.entries(result.categories ?? {})
      .filter(([, v]) => v)
      .map(([k]) => k)
    // OpenAI's closest taxonomy match to CSAM-adjacent content.
    const isWorstTierCandidate = flaggedCategories.includes('sexual/minors')

    // ── Stage 2: Claude Haiku 4.5 confirms or dismisses the flag ────────
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) {
      console.error('[moderate-content] ANTHROPIC_API_KEY not set — cannot confirm stage 1 flag; screening conservatively')
      await supabaseAdmin.rpc('apply_automated_mod_status', {
        p_target_type: targetType, p_target_id: targetId, p_status: 'screening',
        p_reason: `Automated pre-screening: flagged by stage 1 (${flaggedCategories.join(', ')}), stage 2 unavailable`,
      })
      return new Response(JSON.stringify({ flagged: true, confirmed: null }), { headers: corsHeaders })
    }

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 256,
        output_config: {
          format: {
            type: 'json_schema',
            schema: {
              type: 'object',
              properties: {
                confirmed: { type: 'boolean', description: 'true if this content genuinely violates community guidelines around harassment, hate speech, or sexual content involving minors' },
                explanation: { type: 'string' },
              },
              required: ['confirmed', 'explanation'],
              additionalProperties: false,
            },
          },
        },
        messages: [{
          role: 'user',
          content: `A content-safety classifier flagged the following user-submitted text for these categories: ${flaggedCategories.join(', ')}.\n\nText:\n"""\n${content}\n"""\n\nConfirm whether this genuinely violates community guidelines (harassment, hate speech, or sexual content involving minors), or whether it's a false positive (e.g. horror-genre fiction describing violence, which is expected content on this site and not itself a violation). This is a horror-writing community — dark, violent, and disturbing *fictional* content is normal and should not be confirmed on that basis alone.`,
        }],
      }),
    })
    if (!claudeRes.ok) {
      console.error('[moderate-content] Claude confirmation call failed', await claudeRes.text())
      await supabaseAdmin.rpc('apply_automated_mod_status', {
        p_target_type: targetType, p_target_id: targetId, p_status: 'screening',
        p_reason: `Automated pre-screening: flagged by stage 1 (${flaggedCategories.join(', ')}), stage 2 call failed`,
      })
      return new Response(JSON.stringify({ flagged: true, confirmed: null }), { headers: corsHeaders })
    }
    const claudeJson = await claudeRes.json()
    const parsed = JSON.parse(claudeJson.content?.[0]?.text ?? '{}')

    if (!parsed.confirmed) {
      return new Response(JSON.stringify({ flagged: true, confirmed: false }), { headers: corsHeaders })
    }

    // Confirmed. Every confirmed flag is screened identically — see this
    // plan's "Known deviations" note: the worst-tier auto-pull-from-feeds
    // behavior named in the spec is NOT implemented here, pending the
    // legal/mandatory-reporting sign-off that spec explicitly requires
    // first. Worst-tier candidates get an urgently-worded reason string so
    // they sort to Jeff's attention first in the mod queue, and nothing more.
    const reasonPrefix = isWorstTierCandidate ? '[URGENT — WORST TIER] ' : ''
    await supabaseAdmin.rpc('apply_automated_mod_status', {
      p_target_type: targetType,
      p_target_id: targetId,
      p_status: 'screening',
      p_reason: `${reasonPrefix}Automated pre-screening confirmed: ${parsed.explanation}`,
    })

    return new Response(JSON.stringify({ flagged: true, confirmed: true, worstTierCandidate: isWorstTierCandidate }), { headers: corsHeaders })
  } catch (err) {
    console.error('[moderate-content] error', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 400, headers: corsHeaders })
  }
})
```

- [ ] **Step 2: Provision secrets**

Run:
```bash
npx supabase secrets set OPENAI_API_KEY=<jeff's key>
npx supabase secrets set ANTHROPIC_API_KEY=<jeff's key>
```

These are Jeff-provisioned values — not committed anywhere. If either is unset, the function
degrades safely (see the `if (!openaiKey)` / `if (!anthropicKey)` branches above — it never fails
open with an unconfirmed flag silently doing nothing; the no-Anthropic-key path still screens
conservatively rather than skipping review).

- [ ] **Step 3: Deploy the function**

Run: `npx supabase functions deploy moderate-content`

- [ ] **Step 4: Manual verification**

Invoke directly against a known test row with clearly-flaggable content and confirm
`mod_status` moves to `'screening'` and a `mod_actions` row with `actor_id IS NULL` appears. Then
invoke against a normal horror-fiction excerpt (violent but fictional) and confirm it does **not**
get screened — this is the specific false-positive case the Stage 2 prompt is built to catch, so
verify it by hand before wiring the function into the live insert paths.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/moderate-content/index.ts
git commit -m "feat(safety): add two-stage automated content pre-screening edge function"
```

### Task 8: Wire the classifier into every content insert path

**Files:**
- Modify: `src/pages-react/ReadStory.jsx` (`commentMutation.onSuccess`, ~line 118-123)
- Modify: `src/pages-react/PublishStory.jsx` (story publish mutation success handler)
- Modify: `src/pages-react/CreateThread.jsx` (thread creation success handler)
- Modify: `src/pages-react/ThreadView.jsx` (post/reply mutation success handler)

**Interfaces:**
- Consumes: `supabase.functions.invoke('moderate-content', { body: { targetType, targetId } })`

- [ ] **Step 1: Add the fire-and-forget invocation to the critique mutation**

In `ReadStory.jsx`, inside `commentMutation`'s `onSuccess` (currently invalidates queries and
clears the form), add the classifier call using the row returned from the insert:

```js
onSuccess: (newComment) => {
  setCommentContent('')
  queryClient.invalidateQueries({ queryKey: ['book_comments', id] })
  queryClient.invalidateQueries({ queryKey: ['book', id] })
  queryClient.invalidateQueries({ queryKey: ['books'] })
  supabase.functions.invoke('moderate-content', {
    body: { targetType: 'critique', targetId: newComment.id },
  }).catch(console.error)
},
```

- [ ] **Step 2: Repeat for story publish, thread creation, and post/reply**

Find each mutation's success handler (the point right after the insert's `.select().single()`
resolves with the new row) and add the matching invocation, substituting `targetType`:
`'story'` (story id) in `PublishStory.jsx`, `'thread'` (thread id) in `CreateThread.jsx`, `'post'`
(post id) in `ThreadView.jsx`. Follow the exact `.catch(console.error)` fire-and-forget pattern
already used for `urgent-report-email` in `src/lib/modActions.js:68` — the classifier call must
never block the user's own success flow or surface as an error to them.

- [ ] **Step 3: Manual verification**

`npm run dev`, publish a story, post a critique, create a thread, post a reply. Check the Supabase
Edge Function logs (`npx supabase functions logs moderate-content`) confirm each insert triggered
one invocation.

- [ ] **Step 4: Run full unit suite**

Run: `npm run test:unit`
Expected: all pass (no test changes needed here — this is a fire-and-forget side effect, not
covered by the existing mocked-Supabase unit tests, and E2E coverage of the classifier's actual
decision-making belongs to the manual verification in Task 7 Step 4, not this suite)

- [ ] **Step 5: Commit**

```bash
git add src/pages-react/ReadStory.jsx src/pages-react/PublishStory.jsx src/pages-react/CreateThread.jsx src/pages-react/ThreadView.jsx
git commit -m "feat(safety): invoke automated pre-screening on every content insert"
```

---

## PR5 — Storm detector (reports + replies velocity)

*(Vote-velocity deferred — see "Known deviations" at the top of this plan.)*

### Task 9: Storm detection — cross-signal velocity trigger + `storm_alerts` table

**Files:**
- Create: `supabase/migrations/20260819030000_storm_detection.sql`

**Interfaces:**
- Produces: table `public.storm_alerts(id, target_type, target_id, report_count, reply_count,
  window_start, status, created_at, resolved_at, resolved_by)`; function
  `public.check_for_storm(p_target_type text, p_target_id uuid)` (called from triggers on
  `reports`, `posts`, and `book_comments` inserts)

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260819030000_storm_detection.sql

CREATE TABLE public.storm_alerts (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('story','critique','thread','post','user')),
  target_id uuid not null,
  report_count integer not null default 0,
  reply_count integer not null default 0,
  window_start timestamptz not null,
  status text not null default 'pending' check (status in ('pending','confirmed','dismissed')),
  created_at timestamptz not null default timezone('utc', now()),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  unique (target_type, target_id, window_start)
);
create index idx_storm_alerts_pending on public.storm_alerts(status) where status = 'pending';

alter table public.storm_alerts enable row level security;
create policy "storm_alerts_mod_select" on public.storm_alerts for select
  using (public.mod_can('handle_report', 'all'));
create policy "storm_alerts_mod_update" on public.storm_alerts for update
  using (public.mod_can('handle_report', 'all'));

-- Combined velocity check: counts reports AND replies against one target
-- within a 15-minute window. Called from AFTER INSERT triggers below.
-- Threshold: 8 combined events in the window (deliberately higher than
-- PR3's 5-report pile-on threshold, since this is a broader, cross-signal
-- signal meant to catch coordinated multi-channel attacks specifically).
CREATE OR REPLACE FUNCTION public.check_for_storm(p_target_type text, p_target_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window interval := interval '15 minutes';
  v_window_start timestamptz := date_trunc('minute', now()) - (extract(minute from now())::int % 15) * interval '1 minute';
  v_report_count integer;
  v_reply_count integer;
  v_combined integer;
BEGIN
  SELECT count(*) INTO v_report_count
  FROM public.reports
  WHERE target_type = p_target_type AND target_id = p_target_id
    AND created_at > (now() - v_window);

  -- "Replies" means: posts in a thread the target started (target_type =
  -- 'thread'/'user'->threads authored by them) or critiques on a story
  -- they authored. For target_type = 'critique'/'post' (a single piece of
  -- content, not a person), reply_count is always 0 — a storm against one
  -- comment is measured by reports alone; storms against a *person* (via
  -- their threads/stories) also count replies flooding in underneath.
  v_reply_count := 0;
  IF p_target_type = 'story' THEN
    SELECT count(*) INTO v_reply_count FROM public.book_comments
    WHERE book_id = p_target_id AND created_at > (now() - v_window);
  ELSIF p_target_type = 'thread' THEN
    SELECT count(*) INTO v_reply_count FROM public.posts
    WHERE thread_id = p_target_id AND created_at > (now() - v_window);
  END IF;

  v_combined := v_report_count + v_reply_count;

  IF v_combined >= 8 THEN
    INSERT INTO public.storm_alerts (target_type, target_id, report_count, reply_count, window_start)
    VALUES (p_target_type, p_target_id, v_report_count, v_reply_count, v_window_start)
    ON CONFLICT (target_type, target_id, window_start)
    DO UPDATE SET report_count = excluded.report_count, reply_count = excluded.reply_count
    RETURNING id INTO STRICT id; -- re-raises if somehow >1 row, which the unique constraint prevents

    -- Only fire the external alert once per window (first crossing), not
    -- on every subsequent insert that re-updates the same row.
    IF NOT EXISTS (
      SELECT 1 FROM public.storm_alerts
      WHERE target_type = p_target_type AND target_id = p_target_id
        AND window_start = v_window_start AND status <> 'pending'
    ) THEN
      PERFORM pg_notify('storm_detected', json_build_object(
        'target_type', p_target_type, 'target_id', p_target_id,
        'report_count', v_report_count, 'reply_count', v_reply_count
      )::text);
    END IF;
  END IF;
END;
$$;

-- Trigger wrappers: one per source table, each mapping to a storm check
-- against the report's/reply's target.
CREATE OR REPLACE FUNCTION public.trg_check_storm_on_report()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.target_type IN ('story', 'thread') THEN
    PERFORM public.check_for_storm(NEW.target_type, NEW.target_id);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS on_report_check_storm ON public.reports;
CREATE TRIGGER on_report_check_storm AFTER INSERT ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.trg_check_storm_on_report();

CREATE OR REPLACE FUNCTION public.trg_check_storm_on_comment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.check_for_storm('story', NEW.book_id);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS on_comment_check_storm ON public.book_comments;
CREATE TRIGGER on_comment_check_storm AFTER INSERT ON public.book_comments
  FOR EACH ROW EXECUTE FUNCTION public.trg_check_storm_on_comment();

CREATE OR REPLACE FUNCTION public.trg_check_storm_on_post()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.check_for_storm('thread', NEW.thread_id);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS on_post_check_storm ON public.posts;
CREATE TRIGGER on_post_check_storm AFTER INSERT ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.trg_check_storm_on_post();
```

> **Note on `pg_notify`:** this raises a Postgres `NOTIFY` on channel `storm_detected`. Nothing
> currently listens for it directly — Task 10's edge function is invoked over HTTP, not via
> `LISTEN`/`NOTIFY` (Supabase Edge Functions don't run a persistent Postgres listener, and adding
> one would violate this plan's "no new always-on infrastructure" constraint). Task 10 instead adds
> a lightweight polling check, described there. The `pg_notify` call is kept because it's free,
> harmless, and gives Jeff a way to `LISTEN storm_detected` manually from `psql` if he ever wants a
> live tail without touching the app.

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db push`

- [ ] **Step 3: Manually verify the threshold trigger**

Insert 8 reports against the same test story within a few minutes (varying `reporter_id`) and
confirm a row appears in `storm_alerts` with `status = 'pending'`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260819030000_storm_detection.sql
git commit -m "feat(safety): add cross-signal storm detection (reports + replies)"
```

### Task 10: `send-storm-alert` Edge Function — Email + mobile push

**Files:**
- Create: `supabase/functions/send-storm-alert/index.ts`
- Modify: `supabase/migrations/20260819030000_storm_detection.sql` is already committed; add a
  follow-up migration for the polling trigger described below

**Interfaces:**
- Consumes: `RESEND_API_KEY` (already provisioned, reused from `urgent-report-email`),
  `PUSHOVER_APP_TOKEN`, `PUSHOVER_USER_KEY` (new secrets)

**On the polling approach:** rather than a cron worker (ruled out by the low-maintenance
constraint), this task has `check_for_storm()` call the edge function directly via `pg_net` — the
Postgres extension Supabase provisions for exactly this (a trigger making an outbound HTTP call).
This keeps the alert synchronous with detection (no polling delay) and adds no persistent
infrastructure — `pg_net` requests are fire-and-forget from Postgres's perspective.

- [ ] **Step 1: Add the `pg_net` call to `check_for_storm()`**

```sql
-- supabase/migrations/20260819031000_storm_alert_dispatch.sql

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.check_for_storm(p_target_type text, p_target_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window interval := interval '15 minutes';
  v_window_start timestamptz := date_trunc('minute', now()) - (extract(minute from now())::int % 15) * interval '1 minute';
  v_report_count integer;
  v_reply_count integer;
  v_combined integer;
  v_already_alerted boolean;
BEGIN
  SELECT count(*) INTO v_report_count
  FROM public.reports
  WHERE target_type = p_target_type AND target_id = p_target_id
    AND created_at > (now() - v_window);

  v_reply_count := 0;
  IF p_target_type = 'story' THEN
    SELECT count(*) INTO v_reply_count FROM public.book_comments
    WHERE book_id = p_target_id AND created_at > (now() - v_window);
  ELSIF p_target_type = 'thread' THEN
    SELECT count(*) INTO v_reply_count FROM public.posts
    WHERE thread_id = p_target_id AND created_at > (now() - v_window);
  END IF;

  v_combined := v_report_count + v_reply_count;

  IF v_combined >= 8 THEN
    SELECT EXISTS (
      SELECT 1 FROM public.storm_alerts
      WHERE target_type = p_target_type AND target_id = p_target_id AND window_start = v_window_start
    ) INTO v_already_alerted;

    INSERT INTO public.storm_alerts (target_type, target_id, report_count, reply_count, window_start)
    VALUES (p_target_type, p_target_id, v_report_count, v_reply_count, v_window_start)
    ON CONFLICT (target_type, target_id, window_start)
    DO UPDATE SET report_count = excluded.report_count, reply_count = excluded.reply_count;

    IF NOT v_already_alerted THEN
      PERFORM net.http_post(
        url := current_setting('app.settings.supabase_url', true) || '/functions/v1/send-storm-alert',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        ),
        body := jsonb_build_object(
          'targetType', p_target_type, 'targetId', p_target_id,
          'reportCount', v_report_count, 'replyCount', v_reply_count
        )
      );
    END IF;
  END IF;
END;
$$;
```

> **Config values `app.settings.supabase_url` and `app.settings.service_role_key` must be set once**
> via `alter database postgres set app.settings.supabase_url = '<project url>';` and the equivalent
> for the service role key, run manually against the project (not committed — these are
> project-specific runtime config, the same category as the secrets in Task 7 Step 2). Document
> this as a one-time setup step in the PR description.

- [ ] **Step 2: Write the alert function**

```ts
// supabase/functions/send-storm-alert/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { targetType, targetId, reportCount, replyCount } = await req.json()
    const summary = `STORM DETECTED: ${targetType} ${targetId} — ${reportCount} reports + ${replyCount} replies in 15 min`
    console.log(`[send-storm-alert] ${summary}`)

    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const jeffEmail = 'admin@horrorwriter.org'
    if (resendApiKey) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendApiKey}` },
        body: JSON.stringify({
          from: 'HorrorWriter Safety <safety@horrorwriter.org>',
          to: jeffEmail,
          subject: `⚠️ STORM DETECTED: ${targetType} under coordinated attack`,
          html: `<p><strong>${summary}</strong></p><p>Nothing has been auto-frozen — content is still fully visible. Review and confirm at <a href="https://horrorwriter.org/moderation">the Moderation Terminal</a> to exclude these signals from the target's standing.</p>`,
        }),
      })
      if (!res.ok) console.error('[send-storm-alert] Resend failed', await res.text())
    } else {
      console.error('[send-storm-alert] RESEND_API_KEY not set — email alert skipped')
    }

    const pushoverToken = Deno.env.get('PUSHOVER_APP_TOKEN')
    const pushoverUser = Deno.env.get('PUSHOVER_USER_KEY')
    if (pushoverToken && pushoverUser) {
      const body = new URLSearchParams({
        token: pushoverToken,
        user: pushoverUser,
        title: '⚠️ Storm detected',
        message: `${summary}. Review: https://horrorwriter.org/moderation`,
        priority: '1', // high priority — bypasses quiet hours, still requires acknowledgement of receipt on device
        url: 'https://horrorwriter.org/moderation',
        url_title: 'Open Moderation Terminal',
      })
      const res = await fetch('https://api.pushover.net/1/messages.json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      })
      if (!res.ok) console.error('[send-storm-alert] Pushover failed', await res.text())
    } else {
      console.error('[send-storm-alert] Pushover secrets not fully set — push alert skipped')
    }

    return new Response(JSON.stringify({ sent: true }), { headers: corsHeaders })
  } catch (err) {
    console.error('[send-storm-alert] error', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 400, headers: corsHeaders })
  }
})
```

- [ ] **Step 3: Provision secrets**

```bash
npx supabase secrets set PUSHOVER_APP_TOKEN=<jeff's Pushover application token>
npx supabase secrets set PUSHOVER_USER_KEY=<jeff's Pushover user key>
```

Jeff needs a Pushover account, the Pushover app installed on his phone ($5 one-time per platform),
and an application registered at pushover.net/apps/build (yields `PUSHOVER_APP_TOKEN`) before this
step — Pushover is the "new paid third-party dependency" named in the spec (the spec's original
example was Twilio; Jeff chose Pushover instead during planning — see this plan's "Known
deviations" section), not a blocker to writing this task, but a real prerequisite before it can run
in production.

- [ ] **Step 4: Deploy and apply**

```bash
npx supabase functions deploy send-storm-alert
npx supabase db push
```

- [ ] **Step 5: Manual end-to-end verification**

Trigger 8 reports against a test story within 15 minutes and confirm: a `storm_alerts` row appears,
an email arrives, and a Pushover push notification arrives on Jeff's phone. Confirm a **second**
batch of reports against the same target in the same 15-minute window does **not** send a second
alert (the `v_already_alerted` guard).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/send-storm-alert/index.ts supabase/migrations/20260819031000_storm_alert_dispatch.sql
git commit -m "feat(safety): dispatch email+SMS alert on storm detection"
```

### Task 11: Storm review UI + signal-exclusion RPC

**Files:**
- Create: `supabase/migrations/20260819032000_resolve_storm.sql`
- Create: `src/components/mod/StormAlertsTab.jsx`
- Modify: `src/pages-react/Moderation.jsx` (add the new tab)
- Modify: `src/lib/modActions.js` (add `resolveStorm`)

**Interfaces:**
- Produces: RPC `public.resolve_storm(p_storm_id uuid, p_confirmed boolean, p_note text)`;
  `resolveStorm(stormId, confirmed, note)` client function; `<StormAlertsTab />` component

- [ ] **Step 1: Write the resolution RPC**

```sql
-- supabase/migrations/20260819032000_resolve_storm.sql
CREATE OR REPLACE FUNCTION public.resolve_storm(
  p_storm_id uuid,
  p_confirmed boolean, -- true: exclude these signals from the target's standing. false: dismiss, no change.
  p_note text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_target_type text;
  v_target_id uuid;
BEGIN
  IF NOT public.mod_can('handle_report', 'all') THEN
    RAISE EXCEPTION 'Permission denied to resolve storm alerts';
  END IF;

  SELECT target_type, target_id INTO v_target_type, v_target_id
  FROM public.storm_alerts WHERE id = p_storm_id AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Storm alert not found or already resolved';
  END IF;

  UPDATE public.storm_alerts
  SET status = CASE WHEN p_confirmed THEN 'confirmed' ELSE 'dismissed' END,
      resolved_at = timezone('utc', now()),
      resolved_by = v_caller_id
  WHERE id = p_storm_id;

  -- "Excluding from standing" here means: the reports filed during this
  -- storm's window are marked so they no longer count toward PR3's
  -- distinct-reporter pile-on threshold, without deleting them (visibility-
  -- only rule — reports themselves are data, not content, but the same
  -- never-destroy principle applies).
  IF p_confirmed THEN
    UPDATE public.reports
    SET status = 'dismissed', resolution = 'Excluded: part of a confirmed coordinated storm (' || p_storm_id || ')'
    WHERE target_type = v_target_type AND target_id = v_target_id
      AND status = 'open';
  END IF;

  INSERT INTO public.mod_actions (actor_id, action, target_type, target_id, reason, metadata)
  VALUES (
    v_caller_id,
    CASE WHEN p_confirmed THEN 'storm_confirmed' ELSE 'storm_dismissed' END,
    v_target_type, v_target_id, p_note,
    jsonb_build_object('storm_id', p_storm_id)
  );
END;
$$;
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db push`

- [ ] **Step 3: Add `resolveStorm` to `modActions.js`**

```js
export async function resolveStorm(stormId, confirmed, note) {
  if (!supabase) throw new Error('Supabase not configured')
  const { error } = await supabase.rpc('resolve_storm', {
    p_storm_id: stormId,
    p_confirmed: confirmed,
    p_note: note,
  })
  if (error) throw new Error(error.message)
}
```

- [ ] **Step 4: Write `StormAlertsTab.jsx`**

Follow the structure of `src/components/mod/ReportsTab.jsx` (list rows, resolve buttons, toast on
success). Fetch `storm_alerts` where `status = 'pending'`, ordered `created_at desc`; render
`target_type`/`target_id`/`report_count`/`reply_count`; two buttons, "Confirm — Exclude Signals"
(calls `resolveStorm(id, true, note)`) and "Dismiss — Was Legitimate" (calls `resolveStorm(id,
false, note)`), each behind a short reason `<textarea>` matching `ReportModal`'s form conventions.

```jsx
// src/components/mod/StormAlertsTab.jsx
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '../../supabaseClient'
import { resolveStorm } from '../../lib/modActions'

export default function StormAlertsTab() {
  const queryClient = useQueryClient()
  const [notes, setNotes] = useState({})

  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ['storm_alerts', 'pending'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('storm_alerts')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })

  const handleResolve = async (id, confirmed) => {
    try {
      await resolveStorm(id, confirmed, notes[id] || '')
      toast.success(confirmed ? 'Storm confirmed — signals excluded' : 'Storm dismissed')
      queryClient.invalidateQueries({ queryKey: ['storm_alerts', 'pending'] })
    } catch (err) {
      toast.error(err.message)
    }
  }

  if (isLoading) return <p className="font-mono text-xs uppercase text-[var(--color-text-secondary)]">Loading…</p>
  if (alerts.length === 0) return <p className="font-serif italic text-sm text-[var(--color-text-secondary)]">No active storms.</p>

  return (
    <div className="flex flex-col gap-6">
      {alerts.map((a) => (
        <div key={a.id} className="vintage-card border-red-950">
          <p className="font-mono text-xs uppercase text-[var(--color-accent-crimson)] mb-2">
            {a.target_type} {a.target_id}
          </p>
          <p className="text-sm text-[var(--color-text-secondary)] mb-3">
            {a.report_count} reports + {a.reply_count} replies in the 15-minute window starting {new Date(a.window_start).toLocaleString()}
          </p>
          <textarea
            value={notes[a.id] || ''}
            onChange={(e) => setNotes({ ...notes, [a.id]: e.target.value })}
            placeholder="Resolution note…"
            rows={2}
            className="w-full mb-3 bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] border border-[#2d2d2a] px-3 py-2 text-sm"
          />
          <div className="flex gap-3">
            <button onClick={() => handleResolve(a.id, true)} className="bg-[var(--color-accent-crimson)] px-4 py-2 font-mono text-xs uppercase text-white cursor-pointer">
              Confirm — Exclude Signals
            </button>
            <button onClick={() => handleResolve(a.id, false)} className="border border-[#2d2d2a] px-4 py-2 font-mono text-xs uppercase text-[var(--color-text-secondary)] cursor-pointer">
              Dismiss — Was Legitimate
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Wire the tab into `Moderation.jsx`**

Add `'storms'` alongside the existing tab keys (matching however `ReportsTab`/`SanctionsTab` etc.
are switched between in that file), importing and rendering `<StormAlertsTab />` for it.

- [ ] **Step 6: Manual verification**

Trigger a storm (Task 10 Step 5), open the Moderation Terminal, confirm the new tab shows the
pending alert, click "Confirm — Exclude Signals", confirm the open reports against that target flip
to `dismissed` and the alert disappears from the pending list.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260819032000_resolve_storm.sql src/components/mod/StormAlertsTab.jsx src/pages-react/Moderation.jsx src/lib/modActions.js
git commit -m "feat(safety): add storm review UI and signal-exclusion RPC"
```

---

## PR6 — Appeals

### Task 12: `resolve_appeal` RPC with self-review cool-off

**Files:**
- Create: `supabase/migrations/20260819040000_appeals.sql`

**Interfaces:**
- Produces: RPC `public.resolve_appeal(p_report_id uuid, p_upheld boolean, p_reason text)`,
  `SECURITY DEFINER`

**Cool-off logic:** an appeal (`reports.target_type = 'appeal'`, `reports.target_id` = the original
`mod_actions.id`) resolved by the same person who took the original action requires 24 hours to
have passed since the appeal was filed, UNLESS the original action was automated (`actor_id IS
NULL` — see Task 6), in which case Jeff reviewing it is the first human look and no cool-off
applies. This is the "honest limit" from the spec: no fake independent arbiter, just a forced pause
before self-review plus mandatory written reasoning.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260819040000_appeals.sql
CREATE OR REPLACE FUNCTION public.resolve_appeal(
  p_report_id uuid,
  p_upheld boolean, -- true: original action stands. false: original action overturned.
  p_reason text -- REQUIRED — enforced below, not just by convention
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_appeal_created_at timestamptz;
  v_original_action_id uuid;
  v_original_actor_id uuid;
  v_original_target_type text;
  v_original_target_id uuid;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'A written reason is required to resolve an appeal';
  END IF;

  SELECT created_at, target_id INTO v_appeal_created_at, v_original_action_id
  FROM public.reports
  WHERE id = p_report_id AND target_type = 'appeal' AND status = 'open';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appeal not found or already resolved';
  END IF;

  SELECT actor_id, target_type, target_id INTO v_original_actor_id, v_original_target_type, v_original_target_id
  FROM public.mod_actions WHERE id = v_original_action_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Original moderation action not found';
  END IF;

  IF NOT public.mod_can('handle_report', public.mod_area(v_original_target_type)) THEN
    RAISE EXCEPTION 'Permission denied to resolve appeals in this area';
  END IF;

  -- Cool-off: only applies when the resolver is literally the person who
  -- took the original action, and that action was a human one (actor_id
  -- IS NOT NULL). An automated flag's first appeal review IS the first
  -- human look — no cool-off needed there.
  IF v_original_actor_id IS NOT NULL
     AND v_original_actor_id = v_caller_id
     AND (now() - v_appeal_created_at) < interval '24 hours'
  THEN
    RAISE EXCEPTION 'Cool-off period: you took the original action — wait 24 hours after the appeal was filed before resolving it yourself, or have another moderator review it.';
  END IF;

  UPDATE public.reports
  SET status = 'actioned',
      resolution = p_reason,
      resolved_by = v_caller_id,
      resolved_at = timezone('utc', now())
  WHERE id = p_report_id;

  IF NOT p_upheld THEN
    -- Overturned: restore the content to live.
    IF v_original_target_type = 'story' THEN
      UPDATE public.books SET mod_status = 'live' WHERE id = v_original_target_id;
    ELSIF v_original_target_type = 'thread' THEN
      UPDATE public.threads SET mod_status = 'live' WHERE id = v_original_target_id;
    ELSIF v_original_target_type = 'post' THEN
      UPDATE public.posts SET mod_status = 'live' WHERE id = v_original_target_id;
    ELSIF v_original_target_type = 'critique' THEN
      UPDATE public.book_comments SET mod_status = 'live' WHERE id = v_original_target_id;
    END IF;
  END IF;

  INSERT INTO public.mod_actions (actor_id, action, target_type, target_id, reason, metadata)
  VALUES (
    v_caller_id, 'appeal_resolved', v_original_target_type, v_original_target_id, p_reason,
    jsonb_build_object('upheld', p_upheld, 'original_action_id', v_original_action_id)
  );

  -- Notify the appellant (the reporter on the appeal row is the appellant).
  INSERT INTO public.notifications (user_id, kind, title, body)
  SELECT reporter_id, 'appeal_resolved',
    CASE WHEN p_upheld THEN 'Appeal Reviewed — Decision Upheld' ELSE 'Appeal Reviewed — Decision Overturned' END,
    p_reason
  FROM public.reports WHERE id = p_report_id;
END;
$$;
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db push`

- [ ] **Step 3: Manually verify the cool-off**

```sql
-- As the same moderator who took a human action, immediately after filing an appeal against it:
select public.resolve_appeal('<appeal report id>', true, 'test'); -- expect: cool-off exception

-- As a different moderator, same appeal, immediately:
select public.resolve_appeal('<appeal report id>', true, 'test'); -- expect: succeeds

-- Against an appeal of an automated flag (actor_id IS NULL on the original mod_actions row),
-- as any moderator, immediately: expect no cool-off, succeeds.
```

- [ ] **Step 4: Verify the required-reason guard**

```sql
select public.resolve_appeal('<appeal report id>', true, '');
-- expect: 'A written reason is required to resolve an appeal'
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260819040000_appeals.sql
git commit -m "feat(safety): add resolve_appeal RPC with self-review cool-off"
```

### Task 13: "Appeal this" button on authored content

**Files:**
- Create: `src/components/AppealButton.jsx`
- Create: `src/components/AppealButton.test.js`
- Modify: `src/lib/modActions.js` (add `submitAppeal`)
- Modify: `src/pages-react/ReadStory.jsx` (render next to `InlineModControls` when the viewer is the
  author and `mod_status !== 'live'`)

**Interfaces:**
- Produces: `submitAppeal({ modActionId, targetType, explanation })`; `<AppealButton
  modActionId={string} targetType={string} />` (default export)

- [ ] **Step 1: Write the failing test**

```js
// src/components/AppealButton.test.js
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { test, expect, describe, vi, beforeEach } from 'vitest'

const submitAppeal = vi.fn()
vi.mock('../lib/modActions', () => ({ submitAppeal: (...a) => submitAppeal(...a) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const AppealButton = (await import('./AppealButton')).default

beforeEach(() => submitAppeal.mockReset())

describe('AppealButton', () => {
  test('opens a form and submits the appeal with the typed explanation', async () => {
    submitAppeal.mockResolvedValue(undefined)
    render(<AppealButton modActionId="ma-1" targetType="story" />)

    fireEvent.click(screen.getByText(/appeal this/i))
    fireEvent.change(screen.getByPlaceholderText(/why should this be reconsidered/i), { target: { value: 'It was a fictional threat within the story text.' } })
    fireEvent.click(screen.getByText(/submit appeal/i))

    await waitFor(() => expect(submitAppeal).toHaveBeenCalledWith({
      modActionId: 'ma-1', targetType: 'story', explanation: 'It was a fictional threat within the story text.',
    }))
  })

  test('requires a non-empty explanation', async () => {
    render(<AppealButton modActionId="ma-1" targetType="story" />)
    fireEvent.click(screen.getByText(/appeal this/i))
    fireEvent.click(screen.getByText(/submit appeal/i))
    expect(submitAppeal).not.toHaveBeenCalled()
    expect(screen.getByText(/explain why/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- AppealButton`
Expected: FAIL — `Cannot find module './AppealButton'`

- [ ] **Step 3: Add `submitAppeal` to `modActions.js`**

```js
export async function submitAppeal({ modActionId, targetType, explanation }) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('You must be signed in to submit an appeal.')

  const { error } = await supabase
    .from('reports')
    .insert([{
      reporter_id: user.id,
      target_type: 'appeal',
      target_id: modActionId,
      category: 'other',
      details: explanation,
      source: 'user',
    }])
  if (error) throw new Error(error.message)
}
```

- [ ] **Step 4: Write the component**

```jsx
// src/components/AppealButton.jsx
import { useState } from 'react'
import { toast } from 'sonner'
import { submitAppeal } from '../lib/modActions'

export default function AppealButton({ modActionId, targetType }) {
  const [open, setOpen] = useState(false)
  const [explanation, setExplanation] = useState('')
  const [error, setError] = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)

  if (submitted) {
    return <p className="text-xs font-mono text-[var(--color-text-secondary)]">Appeal submitted — a moderator will review it.</p>
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-xs uppercase border border-[#2d2d2a] hover:border-white px-2 py-0.5 text-[var(--color-text-secondary)] cursor-pointer">
        Appeal this
      </button>
    )
  }

  const handleSubmit = async () => {
    if (!explanation.trim()) {
      setError('Explain why this should be reconsidered.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await submitAppeal({ modActionId, targetType, explanation: explanation.trim() })
      setSubmitted(true)
      toast.success('Appeal submitted')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-2 flex flex-col gap-2">
      {error && <p className="text-xs text-[var(--color-accent-crimson)]">{error}</p>}
      <textarea
        value={explanation}
        onChange={(e) => setExplanation(e.target.value)}
        placeholder="Why should this be reconsidered?"
        rows={3}
        className="bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] border border-[#2d2d2a] px-3 py-2 text-sm"
      />
      <button onClick={handleSubmit} disabled={busy} className="self-start bg-[var(--color-accent-crimson)] px-4 py-2 font-mono text-xs uppercase text-white cursor-pointer disabled:opacity-50">
        {busy ? 'Submitting…' : 'Submit Appeal'}
      </button>
    </div>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test:unit -- AppealButton`
Expected: PASS (2 tests)

- [ ] **Step 6: Wire into `ReadStory.jsx`**

Render `<AppealButton>` next to `InlineModControls` (both the story header instance at ~line 192
and the per-critique instance at ~line 255), gated on `session?.user?.id === book.author_id &&
book.mod_status !== 'live'` (and the equivalent per-comment check), and needing the triggering
`mod_actions.id` — fetch it alongside the book/comment query by joining the latest `mod_actions`
row for that `target_id` (`order by created_at desc limit 1`), or simpler: extend the existing
book/comment `select('*', ...)` queries to also pull
`mod_actions:mod_actions!inner(id)` filtered appropriately if Supabase's embedded-resource syntax
supports it cleanly; otherwise issue a second small query for the latest `mod_actions` row when
`mod_status !== 'live'`. Use whichever reads more clearly given the existing query structure in
that file — this is a display concern, not a security one (the RPC itself validates the action
exists).

- [ ] **Step 7: Run full unit suite**

Run: `npm run test:unit`
Expected: all pass

- [ ] **Step 8: Commit**

```bash
git add src/components/AppealButton.jsx src/components/AppealButton.test.js src/lib/modActions.js src/pages-react/ReadStory.jsx
git commit -m "feat(safety): add appeal submission button to authored content"
```

### Task 14: Appeals priority queue in the Moderation Terminal

**Files:**
- Create: `src/components/mod/AppealsTab.jsx`
- Modify: `src/pages-react/Moderation.jsx` (add the new tab)
- Modify: `src/lib/modActions.js` (add `resolveAppeal`)

**Interfaces:**
- Produces: `resolveAppeal(reportId, upheld, reason)`; `<AppealsTab />` component

- [ ] **Step 1: Add `resolveAppeal` to `modActions.js`**

```js
export async function resolveAppeal(reportId, upheld, reason) {
  if (!supabase) throw new Error('Supabase not configured')
  const { error } = await supabase.rpc('resolve_appeal', {
    p_report_id: reportId,
    p_upheld: upheld,
    p_reason: reason,
  })
  if (error) throw new Error(error.message)
}
```

- [ ] **Step 2: Write `AppealsTab.jsx`**

Same structural pattern as `ReportsTab.jsx`, filtered to `target_type = 'appeal'` and
`status = 'open'`, ordered oldest-first (ascending `created_at` — this is the priority-queue
requirement from the spec: someone already told "no" once waits less than a fresh reporter).

```jsx
// src/components/mod/AppealsTab.jsx
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '../../supabaseClient'
import { resolveAppeal } from '../../lib/modActions'

export default function AppealsTab() {
  const queryClient = useQueryClient()
  const [reasons, setReasons] = useState({})

  const { data: appeals = [], isLoading } = useQuery({
    queryKey: ['reports', 'appeals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reports')
        .select('*, profiles!reports_reporter_id_fkey(handle)')
        .eq('target_type', 'appeal')
        .eq('status', 'open')
        .order('created_at', { ascending: true })
      if (error) throw error
      return data ?? []
    },
  })

  const handleResolve = async (id, upheld) => {
    const reason = reasons[id]
    if (!reason || !reason.trim()) {
      toast.error('A written reason is required to resolve an appeal.')
      return
    }
    try {
      await resolveAppeal(id, upheld, reason.trim())
      toast.success(upheld ? 'Appeal resolved — decision upheld' : 'Appeal resolved — decision overturned')
      queryClient.invalidateQueries({ queryKey: ['reports', 'appeals'] })
    } catch (err) {
      toast.error(err.message)
    }
  }

  if (isLoading) return <p className="font-mono text-xs uppercase text-[var(--color-text-secondary)]">Loading…</p>
  if (appeals.length === 0) return <p className="font-serif italic text-sm text-[var(--color-text-secondary)]">No open appeals.</p>

  return (
    <div className="flex flex-col gap-6">
      {appeals.map((a) => (
        <div key={a.id} className="vintage-card">
          <p className="font-mono text-xs uppercase text-[var(--color-text-secondary)] mb-2">
            Filed by @{a.profiles?.handle || 'unknown'} · {new Date(a.created_at).toLocaleString()}
          </p>
          <p className="text-sm text-[var(--color-text-primary)] mb-3 whitespace-pre-line">{a.details}</p>
          <textarea
            value={reasons[a.id] || ''}
            onChange={(e) => setReasons({ ...reasons, [a.id]: e.target.value })}
            placeholder="Resolution reasoning (required, published to /transparency)…"
            rows={2}
            className="w-full mb-3 bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] border border-[#2d2d2a] px-3 py-2 text-sm"
          />
          <div className="flex gap-3">
            <button onClick={() => handleResolve(a.id, false)} className="bg-[var(--color-accent-crimson)] px-4 py-2 font-mono text-xs uppercase text-white cursor-pointer">
              Overturn
            </button>
            <button onClick={() => handleResolve(a.id, true)} className="border border-[#2d2d2a] px-4 py-2 font-mono text-xs uppercase text-[var(--color-text-secondary)] cursor-pointer">
              Uphold
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Wire into `Moderation.jsx`**

Add an `'appeals'` tab alongside `'storms'` (Task 11) and the existing tabs, importing and
rendering `<AppealsTab />`. Sort/position it first among the tabs, matching the priority-queue
intent from the spec.

- [ ] **Step 4: Manual verification**

File an appeal via `AppealButton` (Task 13) as a test author, open the Moderation Terminal as a
moderator, confirm it appears in the Appeals tab, resolve it with "Overturn", confirm the content's
`mod_status` returns to `'live'` and the appellant receives a notification.

- [ ] **Step 5: Run full unit suite**

Run: `npm run test:unit`
Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add src/components/mod/AppealsTab.jsx src/pages-react/Moderation.jsx src/lib/modActions.js
git commit -m "feat(safety): add appeals priority queue to Moderation Terminal"
```

---

## Self-Review

**Spec coverage:**
- PR1 guidelines → Task 1 ✓
- PR2 blocking (table, RLS, write-time enforcement, client lib, UI) → Tasks 2–4 ✓
- PR3 rate-limit + pile-on (hardens the *existing* vulnerable trigger, found during planning) →
  Task 5 ✓
- PR4 two-stage pre-screening (OpenAI free pass, Haiku confirm, worst-tier flag) → Tasks 6–8 ✓,
  with the worst-tier auto-pull-from-feeds explicitly deferred per the spec's own stated legal
  dependency (documented at the top of this plan, not silently dropped)
- PR5 storm detector → Tasks 9–11 ✓, with vote-velocity explicitly deferred (no votes table exists
  — documented at the top of this plan, not silently dropped)
- PR6 appeals (submission, priority queue, resolution, cool-off, transparency) → Tasks 12–14 ✓

**Placeholder scan:** no TBD/TODO markers; every code block is complete and runnable against the
schema verified during planning (table/column names, function signatures, and RLS policy names in
this plan were all read directly from the current migrations, not assumed).

**Type/name consistency check:** `apply_automated_mod_status` (Task 6) is called identically in
Task 7's edge function. `resolveStorm`/`resolveAppeal` client function names match their RPC calls
and their component usages in Tasks 11/14. `mod_actions.actor_id IS NULL` as the automated-action
marker (introduced Task 6) is the exact condition Task 12's cool-off logic checks — verified
consistent between the two tasks.

---

**Plan complete and saved to `docs/superpowers/plans/2026-08-18-harassment-attack-protection.md`.**
Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks,
fast iteration. Given this plan spans schema, edge functions, and UI across six PRs with real
external dependencies (OpenAI, Anthropic, Pushover, Resend), this is the safer default — each task
gets an independent review before the next one builds on it.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with
checkpoints.

**Which approach?**
