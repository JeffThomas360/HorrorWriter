# Account Deletion (Erase / Seal) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Members can delete their account, choosing **Erase everything** (gone for good) or **Seal my writing** (stories and series encrypted in the browser with a recovery code only they hold, kept ≤7 years, restored live if they return with the same verified email).

**Architecture:** A Postgres function `delete_member` does the whole database side in one transaction (detach others' words, tombstones, optional sealed bundle). An Edge Function `delete-account` authenticates the member, calls it, then removes the avatar and the auth user. Sealing and unsealing happen only in the browser (`src/lib/seal.js`, Web Crypto); a second Edge Function `sealed-writing` hands a returning member their ciphertext and deletes it after restore.

**Tech Stack:** Astro 7 + React 19 islands, Supabase (Postgres 17, Edge Functions on Deno, `pg_cron`), Web Crypto (PBKDF2-SHA256, AES-256-GCM), `CompressionStream`, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-26-account-deletion-and-sealing-design.md`

## Global Constraints

- The recovery code **never leaves the browser**: not in any request body, header, log line, toast, analytics or error message.
- Recovery code format: `WORD-WORD-WORD-WORD-WORD-WORD-XXXX`, 6 words from the EFF large wordlist (7,776 words) + 4 chars from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, drawn with `crypto.getRandomValues`.
- KDF: PBKDF2-SHA256, **600,000** iterations, 16-byte random salt → 256-bit key. Cipher: AES-256-GCM, 12-byte random IV. Bundle bytes: `0x01 ‖ salt(16) ‖ iv(12) ‖ ciphertext+tag`. Payload gzip-compressed before encryption.
- Stories with `mod_status = 'hidden'` are **never** put in a sealed bundle.
- `sealed_bundles.expires_at` = sealed_at + **7 years**; a daily `pg_cron` job deletes expired rows.
- `sealed_bundles` has RLS on and **no policies**; no grants to `anon`/`authenticated`.
- Deletion requires a sign-in no older than **10 minutes**, plus typing `DELETE` (and, for Seal, the code's last word).
- Recovery restores **everything, live, immediately**, with each story's original `mod_status`.
- Every new SQL function: explicit `REVOKE ... FROM PUBLIC, anon, authenticated` + deliberate `GRANT` (CLAUDE.md trap). After the migration, `scripts/sql/verify-grants.sql` must return zero rows.
- Migrations reach production by **merging to `main`** (Supabase GitHub integration). Rehearse first with `npx supabase db query --linked -f <file>` inside `begin; … rollback;`. Never use MCP `apply_migration`.
- Edge Functions are deployed by hand: `npx supabase functions deploy <name> --use-api`.
- Departed authors display as **"a departed member"**; tombstones display **"Removed by its author."**
- Unit tests: `npm run test:unit`. Build: `npm run build`. From PowerShell, prefix `npx` with `cmd /c`.

---

## File map

| File | Responsibility | PR |
|---|---|---|
| `supabase/migrations/20260927000000_account_deletion.sql` | Detach FKs, `removed_by_author`, `sealed_bundles`, `pg_cron` purge, `delete_member()` | 1 |
| `scripts/sql/test-delete-member.sql` | Rolled-back behaviour test for `delete_member` | 1 |
| `supabase/functions/_shared/deleteRequest.ts` (+ `.test.ts`) | Pure validation of a delete request | 1, 2 |
| `supabase/functions/delete-account/index.ts` | Auth, call `delete_member`, avatar + auth-user removal | 1, 2 |
| `src/lib/storyHelpers.js` (+ test) | `authorLabel`, `isTombstone` | 1 |
| `src/components/DeleteAccount.jsx` (+ test) | Profile "Delete my account" flow | 1, 2 |
| `src/pages-react/*` (ReadStory, ThreadView, Forum, Library), `src/lib/sitemapQueries.js` | Tombstones + departed-member labels | 1 |
| `src/lib/eff-wordlist.js` | EFF large wordlist (CC-BY 3.0) | 2 |
| `src/lib/seal.js` (+ test) | Recovery code, seal, unseal | 2 |
| `src/lib/sealCollect.js` (+ test) | Gather a member's stories/series into a payload; restore a payload | 2, 3 |
| `supabase/functions/_shared/emailKey.ts` (+ test) | HMAC email key | 2 |
| `supabase/functions/sealed-writing/index.ts` | GET bundle / DELETE bundle for a returning member | 3 |
| `src/components/SealedWritingPrompt.jsx` (+ test) | "Sealed writing is waiting" + restore | 3 |
| `src/pages/rules.astro` | "Leaving the coven" paragraph + exceptions edit | 3 |

---

# PR 1 — Database, Erase, tombstones

Branch: `feat/account-deletion-erase` from `main`.

### Task 1: Migration — detach, tombstones, sealed_bundles, delete_member

**Files:**
- Create: `supabase/migrations/20260927000000_account_deletion.sql`
- Create: `scripts/sql/test-delete-member.sql`

**Interfaces:**
- Produces: `public.delete_member(p_user uuid, p_email_key text default null, p_bundle bytea default null) returns void`, callable by `service_role` only. Columns `books.removed_by_author`, `threads.removed_by_author` (`boolean not null default false`). Table `public.sealed_bundles(email_key text pk, bundle bytea, sealed_at timestamptz, expires_at timestamptz)`.

- [ ] **Step 1: Write the behaviour test (it must fail before the migration exists)**

`scripts/sql/test-delete-member.sql`:

```sql
-- Behaviour test for delete_member (20260927000000). Rolls back; nothing is kept.
-- Success = final row 'ALL PASS'. Any failure raises 'FAIL: ...'.
-- Run: npx supabase db query --linked -f scripts/sql/test-delete-member.sql
begin;

-- Two throwaway members. handle_new_user() creates their profiles.
insert into auth.users (id, email, aud, role, instance_id)
values ('00000000-0000-4000-8000-00000000d001', 'leaver@example.test',  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
       ('00000000-0000-4000-8000-00000000d002', 'stayer@example.test',  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');

-- Leaver: a story others critiqued, a story nobody critiqued, a thread with a reply,
-- a thread without, a critique and a reply on the stayer's work, a series.
insert into public.books (id, title, lede, content, author_id) values
  ('00000000-0000-4000-8000-0000000b0001', 'Critiqued', 'L', 'C', '00000000-0000-4000-8000-00000000d001'),
  ('00000000-0000-4000-8000-0000000b0002', 'Lonely',    'L', 'C', '00000000-0000-4000-8000-00000000d001'),
  ('00000000-0000-4000-8000-0000000b0003', 'Stayer story', 'L', 'C', '00000000-0000-4000-8000-00000000d002');
insert into public.book_comments (book_id, author_id, content) values
  ('00000000-0000-4000-8000-0000000b0001', '00000000-0000-4000-8000-00000000d002', 'stayer critique'),
  ('00000000-0000-4000-8000-0000000b0003', '00000000-0000-4000-8000-00000000d001', 'leaver critique');
insert into public.threads (id, title, category_id, author_id) values
  ('00000000-0000-4000-8000-0000000a0001', 'Replied',  (select id from public.categories limit 1), '00000000-0000-4000-8000-00000000d001'),
  ('00000000-0000-4000-8000-0000000a0002', 'Silent',   (select id from public.categories limit 1), '00000000-0000-4000-8000-00000000d001');
insert into public.posts (thread_id, author_id, content) values
  ('00000000-0000-4000-8000-0000000a0001', '00000000-0000-4000-8000-00000000d001', 'opening post'),
  ('00000000-0000-4000-8000-0000000a0001', '00000000-0000-4000-8000-00000000d002', 'stayer reply'),
  ('00000000-0000-4000-8000-0000000a0002', '00000000-0000-4000-8000-00000000d001', 'opening post 2');
insert into public.series (title, author_id) values ('Leaver series', '00000000-0000-4000-8000-00000000d001');

select public.delete_member('00000000-0000-4000-8000-00000000d001', 'k-test', '\x01ff'::bytea);

do $$
begin
  if exists (select 1 from public.profiles where id = '00000000-0000-4000-8000-00000000d001') then
    raise exception 'FAIL: profile still exists'; end if;
  if not exists (select 1 from public.books where id = '00000000-0000-4000-8000-0000000b0001'
                 and removed_by_author and author_id is null and title = '' and content is null) then
    raise exception 'FAIL: critiqued story is not a tombstone'; end if;
  if exists (select 1 from public.books where id = '00000000-0000-4000-8000-0000000b0002') then
    raise exception 'FAIL: uncritiqued story should be deleted'; end if;
  if not exists (select 1 from public.book_comments where content = 'stayer critique') then
    raise exception 'FAIL: another member''s critique was lost'; end if;
  if exists (select 1 from public.book_comments where content = 'leaver critique') then
    raise exception 'FAIL: leaver''s critique survived'; end if;
  if not exists (select 1 from public.threads where id = '00000000-0000-4000-8000-0000000a0001'
                 and removed_by_author and author_id is null and title = '') then
    raise exception 'FAIL: replied thread is not a tombstone'; end if;
  if exists (select 1 from public.threads where id = '00000000-0000-4000-8000-0000000a0002') then
    raise exception 'FAIL: silent thread should be deleted'; end if;
  if not exists (select 1 from public.posts where content = 'stayer reply') then
    raise exception 'FAIL: another member''s reply was lost'; end if;
  if exists (select 1 from public.posts where content like 'opening post%') then
    raise exception 'FAIL: leaver''s posts survived'; end if;
  if exists (select 1 from public.series where title = 'Leaver series') then
    raise exception 'FAIL: series survived'; end if;
  if not exists (select 1 from public.sealed_bundles where email_key = 'k-test'
                 and expires_at > now() + interval '6 years 11 months') then
    raise exception 'FAIL: sealed bundle missing or wrong expiry'; end if;
end $$;

-- No client role may touch sealed_bundles or call delete_member.
do $$
begin
  if has_table_privilege('anon', 'public.sealed_bundles', 'select')
     or has_table_privilege('authenticated', 'public.sealed_bundles', 'select') then
    raise exception 'FAIL: client role can read sealed_bundles'; end if;
  if has_function_privilege('authenticated', 'public.delete_member(uuid, text, bytea)', 'execute')
     or has_function_privilege('anon', 'public.delete_member(uuid, text, bytea)', 'execute') then
    raise exception 'FAIL: client role can call delete_member'; end if;
end $$;

select 'ALL PASS' as result;
rollback;
```

- [ ] **Step 2: Run it against production (rolled back) and confirm it fails**

Run: `npx supabase db query --linked -f scripts/sql/test-delete-member.sql`
Expected: an error mentioning `function public.delete_member(...) does not exist`.

- [ ] **Step 3: Write the migration**

`supabase/migrations/20260927000000_account_deletion.sql`:

```sql
-- Account deletion: Erase everything / Seal my writing.
-- Spec: docs/superpowers/specs/2026-09-26-account-deletion-and-sealing-design.md
-- Test: scripts/sql/test-delete-member.sql (rolls back; must print ALL PASS)

-- 1. Detach, don't destroy: deleting a profile no longer deletes other members'
--    critiques and replies hanging off the member's stories and threads.
alter table public.books         alter column author_id drop not null;
alter table public.threads       alter column author_id drop not null;
alter table public.book_comments alter column author_id drop not null;
alter table public.posts         alter column author_id drop not null;

alter table public.books         drop constraint books_author_id_fkey,
  add constraint books_author_id_fkey foreign key (author_id) references public.profiles(id) on delete set null;
alter table public.threads       drop constraint threads_author_id_fkey,
  add constraint threads_author_id_fkey foreign key (author_id) references public.profiles(id) on delete set null;
alter table public.book_comments drop constraint book_comments_author_id_fkey,
  add constraint book_comments_author_id_fkey foreign key (author_id) references public.profiles(id) on delete set null;
alter table public.posts         drop constraint posts_author_id_fkey,
  add constraint posts_author_id_fkey foreign key (author_id) references public.profiles(id) on delete set null;

-- 2. Tombstones.
alter table public.books   add column removed_by_author boolean not null default false;
alter table public.threads add column removed_by_author boolean not null default false;

-- 3. Sealed bundles. Ciphertext only; the key exists only in the member's browser.
create table public.sealed_bundles (
  email_key  text primary key,               -- HMAC-SHA256(secret, lower(trim(email))), hex
  bundle     bytea not null,                 -- 0x01 || salt(16) || iv(12) || ciphertext+tag
  sealed_at  timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 years'
);
alter table public.sealed_bundles enable row level security;
-- No policies: no client role can read or write. Edge Functions use service_role.
revoke all on table public.sealed_bundles from public, anon, authenticated;
grant select, insert, update, delete on table public.sealed_bundles to service_role;

-- 4. Seals are kept at most seven years.
create extension if not exists pg_cron;
select cron.schedule(
  'purge-expired-seals',
  '17 3 * * *',
  $$delete from public.sealed_bundles where expires_at < now()$$
);

-- 5. The whole database side of an account deletion, in one transaction.
create or replace function public.delete_member(
  p_user uuid, p_email_key text default null, p_bundle bytea default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user is null then
    raise exception 'delete_member: p_user is required';
  end if;
  if (p_email_key is null) <> (p_bundle is null) then
    raise exception 'delete_member: email key and bundle go together';
  end if;

  if p_bundle is not null then
    insert into public.sealed_bundles (email_key, bundle)
    values (p_email_key, p_bundle)
    on conflict (email_key) do update
      set bundle = excluded.bundle, sealed_at = now(), expires_at = now() + interval '7 years';
  end if;

  -- The member's own critiques and posts (opening posts included) go.
  delete from public.book_comments where author_id = p_user;
  delete from public.posts         where author_id = p_user;

  -- Stories and threads nobody else's words hang off: gone.
  delete from public.books b
   where b.author_id = p_user
     and not exists (select 1 from public.book_comments c where c.book_id = b.id);
  delete from public.threads t
   where t.author_id = p_user
     and not exists (select 1 from public.posts p where p.thread_id = t.id);

  -- The rest become tombstones: the member's words erased, others' kept.
  update public.books
     set title = '', lede = '', content = null, series_teaser = null, chapters_info = null,
         author_id = null, removed_by_author = true
   where author_id = p_user;
  update public.threads
     set title = '', author_id = null, removed_by_author = true
   where author_id = p_user;

  -- Series (and their series_books) cascade with the profile; follows, blocks,
  -- notifications and mod_notes about the member cascade too.
  delete from public.profiles where id = p_user;
end;
$$;

revoke all on function public.delete_member(uuid, text, bytea) from public, anon, authenticated;
grant execute on function public.delete_member(uuid, text, bytea) to service_role;

comment on function public.delete_member(uuid, text, bytea) is
'SECURITY DEFINER, service_role only (delete-account Edge Function). Deletes a member: erases their critiques and posts, deletes their stories/threads that nobody else replied to, tombstones the rest, deletes the profile, and stores a sealed bundle when given one.';

notify pgrst, 'reload schema';
```

- [ ] **Step 4: Rehearse migration + test together, rolled back**

Build a combined file in the scratchpad: `begin;`, the migration with its `notify` line and its `create extension`/`cron.schedule` lines removed (extensions and cron are not rolled back cleanly), then the body of the test file between its own `begin;` and `rollback;`, then `rollback;`. Run: `npx supabase db query --linked -f <scratchpad>/rehearsal.sql`
Expected: a single row `ALL PASS`. Afterwards confirm nothing changed: `select column_name from information_schema.columns where table_name='books' and column_name='removed_by_author'` returns no rows.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260927000000_account_deletion.sql scripts/sql/test-delete-member.sql
git commit -m "feat(db): delete_member, detach-don't-destroy FKs, tombstones, sealed_bundles"
```

### Task 2: Delete-request validation

**Files:**
- Create: `supabase/functions/_shared/deleteRequest.ts`
- Test: `supabase/functions/_shared/deleteRequest.test.ts`

**Interfaces:**
- Produces: `checkDeleteRequest(body: unknown, lastSignInAt: string | null | undefined, nowMs: number): string | null` — `null` when acceptable, else a user-facing reason. `FRESH_SIGN_IN_MS = 10 * 60 * 1000`. PR 1 accepts only `{ mode: 'erase' }`; Task 9 extends it to `seal`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { checkDeleteRequest, FRESH_SIGN_IN_MS } from './deleteRequest'

const now = Date.parse('2026-09-27T12:00:00Z')
const fresh = new Date(now - 60_000).toISOString()

describe('checkDeleteRequest', () => {
  it('accepts an erase with a fresh sign-in', () => {
    expect(checkDeleteRequest({ mode: 'erase' }, fresh, now)).toBeNull()
  })

  it('requires a sign-in within the last 10 minutes', () => {
    const stale = new Date(now - FRESH_SIGN_IN_MS - 1).toISOString()
    expect(checkDeleteRequest({ mode: 'erase' }, stale, now)).toMatch(/sign in again/i)
    expect(checkDeleteRequest({ mode: 'erase' }, null, now)).toMatch(/sign in again/i)
  })

  it('rejects an unknown mode', () => {
    expect(checkDeleteRequest({ mode: 'vanish' }, fresh, now)).toMatch(/choose/i)
    expect(checkDeleteRequest(null, fresh, now)).toMatch(/choose/i)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run supabase/functions/_shared/deleteRequest.test.ts`
Expected: FAIL, cannot resolve `./deleteRequest`.

- [ ] **Step 3: Implement**

```ts
// Pure checks for a delete-account request. No Deno or npm imports, so vitest can test it.
export const FRESH_SIGN_IN_MS = 10 * 60 * 1000

export function checkDeleteRequest(
  body: unknown,
  lastSignInAt: string | null | undefined,
  nowMs: number,
): string | null {
  const signedInAt = lastSignInAt ? Date.parse(lastSignInAt) : NaN
  if (!Number.isFinite(signedInAt) || nowMs - signedInAt > FRESH_SIGN_IN_MS) {
    return 'For your safety, sign in again, then delete your account within 10 minutes.'
  }
  const mode = (body as { mode?: unknown } | null)?.mode
  if (mode !== 'erase') return 'Choose Erase everything or Seal my writing.'
  return null
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `npx vitest run supabase/functions/_shared/deleteRequest.test.ts` — Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/deleteRequest.ts supabase/functions/_shared/deleteRequest.test.ts
git commit -m "feat(delete-account): request validation (fresh sign-in, mode)"
```

### Task 3: `delete-account` Edge Function (erase path)

**Files:**
- Create: `supabase/functions/delete-account/index.ts`

**Interfaces:**
- Consumes: `checkDeleteRequest` (Task 2), `delete_member` (Task 1).
- Produces: `POST /functions/v1/delete-account`, body `{ mode: 'erase' }` → `200 { deleted: true }`, `400 { error }`, `401 { error }`, `500 { error }`.

- [ ] **Step 1: Implement**

```ts
// supabase/functions/delete-account/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkDeleteRequest } from '../_shared/deleteRequest.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return json({ error: 'Please sign in.' }, 401)

  const body = await req.json().catch(() => null)
  const problem = checkDeleteRequest(body, user.last_sign_in_at, Date.now())
  if (problem) return json({ error: problem }, 400)

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

  // 1. Everything in the database, in one transaction.
  const { error: dbError } = await admin.rpc('delete_member', { p_user: user.id })
  if (dbError) {
    console.error('[delete-account] delete_member failed', dbError.message)
    return json({ error: 'Nothing was deleted. Please try again.' }, 500)
  }

  // 2. Avatar files. Safe to repeat.
  const { data: files } = await admin.storage.from('avatars').list(user.id)
  if (files?.length) {
    await admin.storage.from('avatars').remove(files.map((f) => `${user.id}/${f.name}`))
  }

  // 3. The sign-in itself. Safe to repeat.
  const { error: authError } = await admin.auth.admin.deleteUser(user.id)
  if (authError) {
    console.error('[delete-account] deleteUser failed', authError.message)
    return json({ error: 'Your writing is gone, but signing out failed. Please try again.' }, 500)
  }

  return json({ deleted: true })
})
```

- [ ] **Step 2: Syntax-check**

Run: `node --check supabase/functions/delete-account/index.ts` — Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/delete-account/index.ts
git commit -m "feat(delete-account): Edge Function, erase path"
```

### Task 4: Departed members and tombstones in the UI

**Files:**
- Modify: `src/lib/storyHelpers.js`, `src/lib/storyHelpers.test.js`
- Modify: `src/pages-react/ReadStory.jsx`, `src/pages-react/ThreadView.jsx`, `src/pages-react/Forum.jsx`, `src/pages-react/Library.jsx`, `src/lib/sitemapQueries.js`

**Interfaces:**
- Produces: `authorLabel(profile: { handle?: string } | null | undefined): string` → `'@handle'` or `'a departed member'`; `isTombstone(row): boolean`; `TOMBSTONE_TEXT = 'Removed by its author.'`

- [ ] **Step 1: Write the failing tests** (append to `src/lib/storyHelpers.test.js`, and add the three names to its import)

```js
describe('departed members and tombstones', () => {
  it('labels a present author by handle', () => {
    expect(authorLabel({ handle: 'night-owl' })).toBe('@night-owl')
  })
  it('labels a missing author as a departed member', () => {
    expect(authorLabel(null)).toBe('a departed member')
    expect(authorLabel({ handle: null })).toBe('a departed member')
  })
  it('recognises tombstones', () => {
    expect(isTombstone({ removed_by_author: true })).toBe(true)
    expect(isTombstone({ removed_by_author: false })).toBe(false)
    expect(isTombstone(null)).toBe(false)
    expect(TOMBSTONE_TEXT).toBe('Removed by its author.')
  })
})
```

- [ ] **Step 2: Run and confirm failure** — `npx vitest run src/lib/storyHelpers.test.js` → FAIL (not exported).

- [ ] **Step 3: Implement** (append to `src/lib/storyHelpers.js`)

```js
export const TOMBSTONE_TEXT = 'Removed by its author.'

/** Author credit: '@handle', or 'a departed member' once the account is deleted. */
export function authorLabel(profile) {
  return profile?.handle ? `@${profile.handle}` : 'a departed member'
}

/** A story or thread whose author deleted their account, kept for others' replies. */
export function isTombstone(row) {
  return Boolean(row?.removed_by_author)
}
```

- [ ] **Step 4: Run and confirm pass** — `npx vitest run src/lib/storyHelpers.test.js` → all pass.

- [ ] **Step 5: Use them in the UI**
  - `ReadStory.jsx`: import `authorLabel, isTombstone, TOMBSTONE_TEXT`. Replace every `@{book?.profiles?.handle || 'unknown'}` / `@{c.profiles?.handle ...}` style byline with `{authorLabel(book?.profiles)}` / `{authorLabel(c.profiles)}` (drop the literal `@`). When `isTombstone(book)`, render `<h1>` as `TOMBSTONE_TEXT`, skip the title/lede/`StoryMarkdown`/copyright/share blocks, and keep the critiques section.
  - `ThreadView.jsx`: posts' author credit → `authorLabel(post.profiles)`; thread heading → `isTombstone(thread) ? TOMBSTONE_TEXT : thread.title`.
  - `Forum.jsx`: thread list title → `isTombstone(t) ? TOMBSTONE_TEXT : t.title`; starter credit → `authorLabel(t.profiles)`.
  - `Library.jsx`: add `.eq('removed_by_author', false)` to the books query.
  - `sitemapQueries.js`: add `.eq('removed_by_author', false)` to `fetchLiveStoryUrls` and `fetchLiveThreadUrls`.

- [ ] **Step 6: Run the full suite** — `npm run test:unit` → all pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/storyHelpers.js src/lib/storyHelpers.test.js src/pages-react src/lib/sitemapQueries.js
git commit -m "feat: departed-member credits and tombstone rendering"
```

### Task 5: "Delete my account" on the Profile page (Erase only)

**Files:**
- Create: `src/components/DeleteAccount.jsx`, `src/components/DeleteAccount.test.jsx`
- Modify: `src/pages-react/Profile.jsx` (render `<DeleteAccount />` as the last section, after the passkey `<details>`)

**Interfaces:**
- Consumes: `supabase.functions.invoke('delete-account', { body: { mode: 'erase' } })`; `useAuth()` → `session.user.last_sign_in_at`.
- Produces: `DeleteAccount` default export (no props). Task 11 adds the Seal branch.

- [ ] **Step 1: Write the failing test**

```jsx
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { test, expect, vi, beforeEach, afterEach } from 'vitest'

let authState
vi.mock('./AuthContext', () => ({ useAuth: () => authState }))
const invoke = vi.fn()
const signOut = vi.fn()
vi.mock('../supabaseClient', () => ({ supabase: { functions: { invoke: (...a) => invoke(...a) }, auth: { signOut: () => signOut() } } }))

const DeleteAccount = (await import('./DeleteAccount')).default

beforeEach(() => {
  authState = { session: { user: { id: 'u1', last_sign_in_at: new Date().toISOString() } } }
  invoke.mockReset().mockResolvedValue({ data: { deleted: true }, error: null })
  signOut.mockReset().mockResolvedValue({})
})
afterEach(() => cleanup())

test('explains both choices side by side', () => {
  render(<DeleteAccount />)
  fireEvent.click(screen.getByRole('button', { name: /delete my account/i }))
  expect(screen.getByText(/erase everything/i)).toBeInTheDocument()
  expect(screen.getByText(/seal my writing/i)).toBeInTheDocument()
  expect(screen.getByText(/not by anyone/i)).toBeInTheDocument()
})

test('erase needs DELETE typed before it will run', async () => {
  render(<DeleteAccount />)
  fireEvent.click(screen.getByRole('button', { name: /delete my account/i }))
  fireEvent.click(screen.getByRole('button', { name: /^erase everything$/i }))
  const go = screen.getByRole('button', { name: /erase my account/i })
  expect(go).toBeDisabled()
  fireEvent.change(screen.getByLabelText(/type delete/i), { target: { value: 'DELETE' } })
  fireEvent.click(go)
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('delete-account', { body: { mode: 'erase' } }))
  await waitFor(() => expect(signOut).toHaveBeenCalled())
})

test('asks for a fresh sign-in when the last one is older than 10 minutes', () => {
  authState.session.user.last_sign_in_at = new Date(Date.now() - 11 * 60 * 1000).toISOString()
  render(<DeleteAccount />)
  fireEvent.click(screen.getByRole('button', { name: /delete my account/i }))
  expect(screen.getByText(/sign in again/i)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /^erase everything$/i })).toBeNull()
})
```

- [ ] **Step 2: Run and confirm failure** — `npx vitest run src/components/DeleteAccount.test.jsx` → FAIL (module missing).

- [ ] **Step 3: Implement**

```jsx
import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from './AuthContext'

const FRESH_SIGN_IN_MS = 10 * 60 * 1000

const ROWS = [
  ['Stories and series', 'Deleted for good', 'Encrypted in your browser, then removed from the site'],
  ['Can you get them back?', 'No, not by anyone', 'Yes: sign up again with the same email and enter your recovery code'],
  ['Can the keeper read them?', 'No, they’re gone', 'No, only your code opens them'],
  ['Your critiques and forum replies', 'Deleted', 'Deleted (conversations aren’t sealed)'],
  ['Profile, avatar, follows, sign-in', 'Deleted', 'Deleted'],
]

export default function DeleteAccount() {
  const { session } = useAuth()
  const [step, setStep] = useState('closed') // closed | choose | erase
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const signedInAt = Date.parse(session?.user?.last_sign_in_at ?? '')
  const fresh = Number.isFinite(signedInAt) && Date.now() - signedInAt <= FRESH_SIGN_IN_MS

  const erase = async () => {
    setBusy(true)
    setError(null)
    const { error: fnError } = await supabase.functions.invoke('delete-account', { body: { mode: 'erase' } })
    if (fnError) {
      setError('Nothing was deleted. Please try again.')
      setBusy(false)
      return
    }
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  return (
    <section className="mt-12 border-t border-[var(--color-line)] pt-8 max-w-2xl">
      <h2 className="font-serif font-bold text-xl mb-3">Delete my account</h2>

      {step === 'closed' && (
        <button type="button" onClick={() => setStep('choose')}
          className="border border-[var(--color-line)] hover:border-[var(--color-ember)] font-mono text-xs uppercase px-4 py-2 cursor-pointer">
          Delete my account
        </button>
      )}

      {step !== 'closed' && !fresh && (
        <p className="font-serif text-sm text-[var(--color-text-secondary)]">
          For your safety, sign in again, then come back here within 10 minutes.{' '}
          <button type="button" onClick={() => supabase.auth.signOut()} className="underline cursor-pointer">Sign out now</button>
        </p>
      )}

      {step === 'choose' && fresh && (
        <div>
          <table className="w-full text-xs font-serif mb-6 border-collapse">
            <thead>
              <tr className="text-left font-mono uppercase">
                <th className="py-2 pr-3"></th><th className="py-2 pr-3">Erase everything</th><th className="py-2">Seal my writing</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map(([label, erase, seal]) => (
                <tr key={label} className="border-t border-[var(--color-line)] align-top">
                  <th scope="row" className="py-2 pr-3 text-left font-mono">{label}</th>
                  <td className="py-2 pr-3">{erase}</td><td className="py-2">{seal}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex gap-3">
            <button type="button" onClick={() => setStep('erase')}
              className="border border-[var(--color-ember)] text-[var(--color-ember)] font-mono text-xs uppercase px-4 py-2 cursor-pointer">
              Erase everything
            </button>
            <button type="button" onClick={() => setStep('closed')} className="font-mono text-xs uppercase px-4 py-2 cursor-pointer">
              Cancel
            </button>
          </div>
        </div>
      )}

      {step === 'erase' && fresh && (
        <div className="flex flex-col gap-3">
          <p className="font-serif text-sm">This cannot be undone. Your stories, series, critiques, posts and profile will be gone for good.</p>
          <label htmlFor="confirm-delete" className="font-mono text-xs uppercase">Type DELETE to confirm</label>
          <input id="confirm-delete" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off"
            className="bg-[var(--color-bg-primary)] border border-[var(--color-line)] px-3 py-2 text-sm max-w-xs" />
          {error && <p className="text-[var(--color-ember)] text-xs font-mono">{error}</p>}
          <div className="flex gap-3">
            <button type="button" disabled={typed !== 'DELETE' || busy} onClick={erase}
              className="bg-[var(--color-ember)] text-white font-mono text-xs uppercase px-4 py-2 disabled:opacity-40 cursor-pointer">
              {busy ? 'Erasing…' : 'Erase my account'}
            </button>
            <button type="button" onClick={() => setStep('choose')} className="font-mono text-xs uppercase px-4 py-2 cursor-pointer">Back</button>
          </div>
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 4: Run and confirm pass** — `npx vitest run src/components/DeleteAccount.test.jsx` → 3 passed.

- [ ] **Step 5: Render it on the Profile page** — in `src/pages-react/Profile.jsx` add `import DeleteAccount from '../components/DeleteAccount'` and render `<DeleteAccount />` immediately after the closing `</details>` of the password-manager section.

- [ ] **Step 6: Full suite + build** — `npm run test:unit` and `npm run build` → green.

- [ ] **Step 7: Commit**

```bash
git add src/components/DeleteAccount.jsx src/components/DeleteAccount.test.jsx src/pages-react/Profile.jsx
git commit -m "feat(profile): Delete my account (Erase everything)"
```

### Task 6: Ship PR 1

- [ ] **Step 1:** Open the PR; wait for `vitest` and the Workers preview build.
- [ ] **Step 2:** With Jeff's go-ahead, merge. The Supabase integration applies the migration; confirm with `npx supabase migration list` that `20260927000000` is on the remote.
- [ ] **Step 3:** `npx supabase db query --linked -f scripts/sql/test-delete-member.sql` → `ALL PASS`. `npx supabase db query --linked -f scripts/sql/verify-grants.sql` → zero rows.
- [ ] **Step 4:** Deploy: `npx supabase functions deploy delete-account --use-api`.
- [ ] **Step 5:** Smoke test: call the function with no token → 401; with the anon key → 401.

---

# PR 2 — Seal my writing

Branch: `feat/account-deletion-seal` from `main` after PR 1 merges.

### Task 7: EFF wordlist + seal/unseal library

**Files:**
- Create: `src/lib/eff-wordlist.js`, `src/lib/seal.js`, `src/lib/seal.test.js`
- Modify: `src/pages/rules.astro` footer credit (one line)

**Interfaces:**
- Produces:
  - `generateRecoveryCode(): string`
  - `sealWriting(payload: object, code: string): Promise<Uint8Array>`
  - `unsealWriting(bundle: Uint8Array, code: string): Promise<object>` — throws `SealError('wrong-code')` on any failure to open
  - `normaliseCode(code: string): string` (upper-case, trims, collapses spaces/dashes)
  - `PBKDF2_ITERATIONS = 600000`, `BUNDLE_VERSION = 1`

- [ ] **Step 1: Fetch the EFF large wordlist into a module**

Run (from the repo root):
```bash
curl -s https://www.eff.org/files/2016/07/18/eff_large_wordlist.txt | awk '{print $2}' > /tmp/eff.txt
wc -l /tmp/eff.txt   # expect 7776
node -e "const w=require('fs').readFileSync('/tmp/eff.txt','utf8').trim().split('\n');if(w.length!==7776)throw 1;require('fs').writeFileSync('src/lib/eff-wordlist.js','// EFF Large Wordlist for Passphrases (CC BY 3.0), https://www.eff.org/dice\nexport const EFF_WORDS = '+JSON.stringify(w)+'\n')"
```
Add to the House Rules footer: `Recovery codes use the EFF Large Wordlist (CC BY 3.0).`

- [ ] **Step 2: Write the failing tests** — `src/lib/seal.test.js`

```js
import { describe, it, expect } from 'vitest'
import { generateRecoveryCode, sealWriting, unsealWriting, normaliseCode, BUNDLE_VERSION } from './seal'
import { EFF_WORDS } from './eff-wordlist'

const payload = { v: 1, stories: [{ title: 'The Lath and the Marrow', content: 'x'.repeat(5000) }], series: [] }

describe('recovery code', () => {
  it('is six EFF words and a four-character suffix', () => {
    const code = generateRecoveryCode()
    const parts = code.split('-')
    expect(parts).toHaveLength(7)
    parts.slice(0, 6).forEach((w) => expect(EFF_WORDS).toContain(w.toLowerCase()))
    expect(parts[6]).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/)
  })
  it('differs every time', () => {
    expect(generateRecoveryCode()).not.toBe(generateRecoveryCode())
  })
  it('normalises what a member types', () => {
    expect(normaliseCode('  pale hound-ashes ')).toBe('PALE-HOUND-ASHES')
  })
})

describe('seal and unseal', () => {
  it('round-trips with the right code', async () => {
    const code = generateRecoveryCode()
    const bundle = await sealWriting(payload, code)
    expect(bundle[0]).toBe(BUNDLE_VERSION)
    expect(await unsealWriting(bundle, code.toLowerCase())).toEqual(payload)
  })
  it('compresses before encrypting', async () => {
    const bundle = await sealWriting(payload, generateRecoveryCode())
    expect(bundle.length).toBeLessThan(1000) // 5,000 repeated chars compress to a few dozen bytes
  })
  it('refuses the wrong code', async () => {
    const bundle = await sealWriting(payload, generateRecoveryCode())
    await expect(unsealWriting(bundle, generateRecoveryCode())).rejects.toThrow(/wrong-code/)
  })
  it('refuses a tampered bundle', async () => {
    const code = generateRecoveryCode()
    const bundle = await sealWriting(payload, code)
    bundle[bundle.length - 1] ^= 1
    await expect(unsealWriting(bundle, code)).rejects.toThrow(/wrong-code/)
  })
  it('never contains the code or the plaintext', async () => {
    const code = generateRecoveryCode()
    const text = new TextDecoder('latin1').decode(await sealWriting(payload, code))
    expect(text).not.toContain(code)
    expect(text).not.toContain('Lath and the Marrow')
  })
})
```

- [ ] **Step 3: Run and confirm failure** — `npx vitest run src/lib/seal.test.js` → FAIL (module missing).

- [ ] **Step 4: Implement** — `src/lib/seal.js`

```js
// Sealing a departing member's writing. Everything here runs in the member's
// browser; the recovery code and the key derived from it never leave it.
// Bundle: version(1) || salt(16) || iv(12) || AES-256-GCM(gzip(JSON)) incl. tag.
import { EFF_WORDS } from './eff-wordlist'

export const BUNDLE_VERSION = 1
export const PBKDF2_ITERATIONS = 600000
const SUFFIX_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export class SealError extends Error {}

// Uniform integer in [0, n) without modulo bias.
function randomBelow(n) {
  const limit = Math.floor(0x100000000 / n) * n
  const buf = new Uint32Array(1)
  do { crypto.getRandomValues(buf) } while (buf[0] >= limit)
  return buf[0] % n
}

export function generateRecoveryCode() {
  const words = Array.from({ length: 6 }, () => EFF_WORDS[randomBelow(EFF_WORDS.length)].toUpperCase())
  const suffix = Array.from({ length: 4 }, () => SUFFIX_ALPHABET[randomBelow(SUFFIX_ALPHABET.length)]).join('')
  return [...words, suffix].join('-')
}

export function normaliseCode(code) {
  return String(code).trim().toUpperCase().split(/[\s-]+/).filter(Boolean).join('-')
}

async function deriveKey(code, salt) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(normaliseCode(code)), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

async function pipe(bytes, transform) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(transform)).arrayBuffer())
}

export async function sealWriting(payload, code) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const compressed = await pipe(new TextEncoder().encode(JSON.stringify(payload)), new CompressionStream('gzip'))
  const key = await deriveKey(code, salt)
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, compressed))
  const out = new Uint8Array(1 + 16 + 12 + ciphertext.length)
  out[0] = BUNDLE_VERSION
  out.set(salt, 1)
  out.set(iv, 17)
  out.set(ciphertext, 29)
  return out
}

export async function unsealWriting(bundle, code) {
  try {
    if (bundle[0] !== BUNDLE_VERSION) throw new Error('version')
    const key = await deriveKey(code, bundle.slice(1, 17))
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bundle.slice(17, 29) }, key, bundle.slice(29))
    const json = await pipe(new Uint8Array(plain), new DecompressionStream('gzip'))
    return JSON.parse(new TextDecoder().decode(json))
  } catch {
    throw new SealError('wrong-code')
  }
}
```

- [ ] **Step 5: Run and confirm pass** — `npx vitest run src/lib/seal.test.js` → 8 passed. (If jsdom lacks `CompressionStream`, add to `vitest.setup.js`: `import { CompressionStream, DecompressionStream } from 'node:stream/web'; globalThis.CompressionStream ??= CompressionStream; globalThis.DecompressionStream ??= DecompressionStream;` and, if `crypto.subtle` is missing, `import { webcrypto } from 'node:crypto'; globalThis.crypto ??= webcrypto;`.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/eff-wordlist.js src/lib/seal.js src/lib/seal.test.js vitest.setup.js src/pages/rules.astro
git commit -m "feat(seal): recovery codes and in-browser seal/unseal (PBKDF2 + AES-GCM)"
```

### Task 8: Collect a member's writing into a payload

**Files:**
- Create: `src/lib/sealCollect.js`, `src/lib/sealCollect.test.js`

**Interfaces:**
- Produces: `buildPayload(books: Book[], series: Series[], seriesBooks: SeriesBook[]): Payload` (pure) and `collectWriting(supabase, userId): Promise<Payload>`.
  `Payload = { v: 1, stories: [{ key, title, lede, content, cover, badge, mod_status, created_at, updated_at, version }], series: [{ title, description, created_at, parts: [{ story_key, sort_order }] }] }`, where `key` is the original story id (used only to link series parts inside the payload).

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest'
import { buildPayload } from './sealCollect'

const books = [
  { id: 'b1', title: 'Live one', lede: 'l', content: 'c', cover: 'blood', badge: null, mod_status: 'live', created_at: 't1', updated_at: 't2', version: 3 },
  { id: 'b2', title: 'Under review', lede: 'l', content: 'c', cover: 'bone', badge: null, mod_status: 'screening', created_at: 't1', updated_at: 't2', version: 1 },
  { id: 'b3', title: 'Removed by a keeper', lede: 'l', content: 'c', cover: 'cyan', badge: null, mod_status: 'hidden', created_at: 't1', updated_at: 't2', version: 1 },
]
const series = [{ id: 's1', title: 'Cycle', description: 'd', created_at: 't0' }]
const seriesBooks = [{ series_id: 's1', book_id: 'b1', sort_order: 1 }, { series_id: 's1', book_id: 'b3', sort_order: 2 }]

describe('buildPayload', () => {
  it('includes live and under-review stories, never moderation-removed ones', () => {
    const p = buildPayload(books, series, seriesBooks)
    expect(p.stories.map((s) => s.title)).toEqual(['Live one', 'Under review'])
  })
  it('keeps series and drops parts pointing at excluded stories', () => {
    const p = buildPayload(books, series, seriesBooks)
    expect(p.series).toEqual([{ title: 'Cycle', description: 'd', created_at: 't0', parts: [{ story_key: 'b1', sort_order: 1 }] }])
  })
  it('is versioned', () => {
    expect(buildPayload([], [], []).v).toBe(1)
  })
})
```

- [ ] **Step 2: Run and confirm failure** — `npx vitest run src/lib/sealCollect.test.js` → FAIL.

- [ ] **Step 3: Implement**

```js
// What goes into a sealed bundle. Moderation-removed ('hidden') stories never do.
const STORY_FIELDS = ['title', 'lede', 'content', 'cover', 'badge', 'mod_status', 'created_at', 'updated_at', 'version']

export function buildPayload(books, series, seriesBooks) {
  const kept = books.filter((b) => b.mod_status !== 'hidden')
  const keptIds = new Set(kept.map((b) => b.id))
  return {
    v: 1,
    stories: kept.map((b) => ({ key: b.id, ...Object.fromEntries(STORY_FIELDS.map((f) => [f, b[f] ?? null])) })),
    series: series.map((s) => ({
      title: s.title,
      description: s.description ?? null,
      created_at: s.created_at,
      parts: seriesBooks
        .filter((sb) => sb.series_id === s.id && keptIds.has(sb.book_id))
        .map((sb) => ({ story_key: sb.book_id, sort_order: sb.sort_order })),
    })),
  }
}

export async function collectWriting(supabase, userId) {
  const [books, series] = await Promise.all([
    supabase.from('books').select('id, ' + STORY_FIELDS.join(', ')).eq('author_id', userId),
    supabase.from('series').select('id, title, description, created_at').eq('author_id', userId),
  ])
  if (books.error) throw books.error
  if (series.error) throw series.error
  const ids = (series.data ?? []).map((s) => s.id)
  const parts = ids.length
    ? await supabase.from('series_books').select('series_id, book_id, sort_order').in('series_id', ids)
    : { data: [], error: null }
  if (parts.error) throw parts.error
  return buildPayload(books.data ?? [], series.data ?? [], parts.data ?? [])
}
```

- [ ] **Step 4: Run and confirm pass** → 3 passed.
- [ ] **Step 5: Commit** — `git add src/lib/sealCollect.js src/lib/sealCollect.test.js && git commit -m "feat(seal): collect a member's writing, excluding moderation-removed"`

### Task 9: Email key + seal path in `delete-account`

**Files:**
- Create: `supabase/functions/_shared/emailKey.ts`, `supabase/functions/_shared/emailKey.test.ts`
- Modify: `supabase/functions/_shared/deleteRequest.ts` (+ test), `supabase/functions/delete-account/index.ts`

**Interfaces:**
- Produces: `emailKey(email: string, secret: string): Promise<string>` (hex HMAC-SHA256 of `email.trim().toLowerCase()`); `MAX_BUNDLE_BYTES = 5 * 1024 * 1024`; `checkDeleteRequest` now also accepts `{ mode: 'seal', bundle: <base64 string> }`.

- [ ] **Step 1: Failing tests**

`emailKey.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { emailKey } from './emailKey'

describe('emailKey', () => {
  it('is the same for the same address however it is typed', async () => {
    expect(await emailKey(' Writer@Example.com ', 's')).toBe(await emailKey('writer@example.com', 's'))
  })
  it('depends on the secret and never contains the address', async () => {
    const a = await emailKey('writer@example.com', 's1')
    expect(a).not.toBe(await emailKey('writer@example.com', 's2'))
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })
  it('refuses an empty secret', async () => {
    await expect(emailKey('writer@example.com', '')).rejects.toThrow()
  })
})
```

Append to `deleteRequest.test.ts`:
```ts
describe('checkDeleteRequest seal', () => {
  it('accepts a seal with a bundle', () => {
    expect(checkDeleteRequest({ mode: 'seal', bundle: 'AQID' }, fresh, now)).toBeNull()
  })
  it('rejects a seal without a bundle', () => {
    expect(checkDeleteRequest({ mode: 'seal' }, fresh, now)).toMatch(/sealed/i)
  })
  it('rejects an oversized bundle', () => {
    const huge = 'A'.repeat(Math.ceil((MAX_BUNDLE_BYTES + 1) * 4 / 3))
    expect(checkDeleteRequest({ mode: 'seal', bundle: huge }, fresh, now)).toMatch(/too large/i)
  })
})
```
(and add `MAX_BUNDLE_BYTES` to that file's import.)

- [ ] **Step 2: Run and confirm failures.**

- [ ] **Step 3: Implement** — `emailKey.ts`:
```ts
export async function emailKey(email: string, secret: string): Promise<string> {
  if (!secret) throw new Error('emailKey: secret is required')
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(email.trim().toLowerCase())))
  return Array.from(mac, (b) => b.toString(16).padStart(2, '0')).join('')
}
```
In `deleteRequest.ts`, add `export const MAX_BUNDLE_BYTES = 5 * 1024 * 1024` and replace the mode check with:
```ts
  const b = body as { mode?: unknown; bundle?: unknown } | null
  if (b?.mode === 'erase') return null
  if (b?.mode === 'seal') {
    if (typeof b.bundle !== 'string' || b.bundle.length === 0) return 'The sealed writing did not arrive. Nothing was deleted.'
    if (b.bundle.length * 3 / 4 > MAX_BUNDLE_BYTES) return 'Your sealed writing is too large to store. Nothing was deleted.'
    return null
  }
  return 'Choose Erase everything or Seal my writing.'
```
In `delete-account/index.ts`, before the `rpc` call:
```ts
  let p_email_key: string | null = null
  let p_bundle: string | null = null
  if (body.mode === 'seal') {
    if (!user.email || !user.email_confirmed_at) return json({ error: 'Confirm your email before sealing.' }, 400)
    p_email_key = await emailKey(user.email, Deno.env.get('SEAL_EMAIL_KEY_SECRET') ?? '')
    // bytea from base64: PostgREST accepts '\\x<hex>'
    const raw = Uint8Array.from(atob(body.bundle), (c) => c.charCodeAt(0))
    p_bundle = '\\x' + Array.from(raw, (x) => x.toString(16).padStart(2, '0')).join('')
  }
  const { error: dbError } = await admin.rpc('delete_member', { p_user: user.id, p_email_key, p_bundle })
```
(import `emailKey` from `../_shared/emailKey.ts`, and remove the old one-argument `rpc` call).

- [ ] **Step 4: Run tests → pass; `node --check` the function.**
- [ ] **Step 5: Commit** — `git commit -am "feat(delete-account): seal path with HMAC email key"` (after `git add` of the new files).

### Task 10: Set the email-key secret (operator step)

- [ ] Generate and set it without printing it:
```bash
node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))" > "$TMP/seal.secret"
npx supabase secrets set SEAL_EMAIL_KEY_SECRET="$(cat "$TMP/seal.secret")"
rm "$TMP/seal.secret"
npx supabase secrets list | grep SEAL_EMAIL_KEY_SECRET
```
Expected: the name listed (value shown only as a digest). **Never rotate it**: rotating orphans every existing seal.

### Task 11: Seal branch in the delete flow

**Files:**
- Modify: `src/components/DeleteAccount.jsx`, `src/components/DeleteAccount.test.jsx`

**Interfaces:**
- Consumes: `generateRecoveryCode`, `sealWriting` (Task 7); `collectWriting` (Task 8); `delete-account` seal mode (Task 9).

- [ ] **Step 1: Failing tests** (append; mock `../lib/seal` and `../lib/sealCollect`)

```jsx
vi.mock('../lib/seal', () => ({
  generateRecoveryCode: () => 'PALE-HOUND-ASHES-TALLOW-EMBER-MIRE-7Q4K',
  sealWriting: vi.fn(async () => new Uint8Array([1, 2, 3])),
}))
vi.mock('../lib/sealCollect', () => ({ collectWriting: vi.fn(async () => ({ v: 1, stories: [], series: [] })) }))

test('seal shows the code once and needs its last part typed back', async () => {
  render(<DeleteAccount />)
  fireEvent.click(screen.getByRole('button', { name: /delete my account/i }))
  fireEvent.click(screen.getByRole('button', { name: /^seal my writing$/i }))
  expect(screen.getByText('PALE-HOUND-ASHES-TALLOW-EMBER-MIRE-7Q4K')).toBeInTheDocument()
  expect(screen.getByText(/not by us, not by anyone/i)).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText(/last part of your code/i), { target: { value: '7q4k' } })
  fireEvent.change(screen.getByLabelText(/type delete/i), { target: { value: 'DELETE' } })
  fireEvent.click(screen.getByRole('button', { name: /seal and delete/i }))
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('delete-account', { body: { mode: 'seal', bundle: 'AQID' } }))
})

test('the recovery code is never sent to the server', async () => {
  render(<DeleteAccount />)
  fireEvent.click(screen.getByRole('button', { name: /delete my account/i }))
  fireEvent.click(screen.getByRole('button', { name: /^seal my writing$/i }))
  fireEvent.change(screen.getByLabelText(/last part of your code/i), { target: { value: '7Q4K' } })
  fireEvent.change(screen.getByLabelText(/type delete/i), { target: { value: 'DELETE' } })
  fireEvent.click(screen.getByRole('button', { name: /seal and delete/i }))
  await waitFor(() => expect(invoke).toHaveBeenCalled())
  expect(JSON.stringify(invoke.mock.calls)).not.toContain('PALE-HOUND')
})
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement** — in `DeleteAccount.jsx`:
  - import `generateRecoveryCode, sealWriting` from `../lib/seal` and `collectWriting` from `../lib/sealCollect`.
  - add state `code` (set with `generateRecoveryCode()` when entering step `'seal'`) and `lastPart`.
  - add a **Seal my writing** button beside Erase in the choose step → `setCode(generateRecoveryCode()); setStep('seal')`.
  - seal step renders: the code in a `<code>` block; buttons **Copy** (`navigator.clipboard.writeText(code)`), **Download** (a `Blob` of `code + '\n'` saved as `horrorwriter-recovery-code.txt`), **Print** (`window.print()`); the sentence *"Without this code your writing can never be recovered. Not by us, not by anyone."*; an input labelled **"Type the last part of your code"**; the same **Type DELETE to confirm** input; a **Seal and delete** button enabled only when `lastPart.trim().toUpperCase() === code.split('-').pop()` and `typed === 'DELETE'`.
  - on click:
```jsx
const seal = async () => {
  setBusy(true); setError(null)
  try {
    const payload = await collectWriting(supabase, session.user.id)
    const bundle = await sealWriting(payload, code)
    const base64 = btoa(String.fromCharCode(...bundle))
    const { error: fnError } = await supabase.functions.invoke('delete-account', { body: { mode: 'seal', bundle: base64 } })
    if (fnError) throw fnError
    await supabase.auth.signOut()
    window.location.href = '/'
  } catch {
    setError('Nothing was deleted. Please try again, or choose Erase everything.')
    setBusy(false)
  }
}
```
  (`String.fromCharCode(...bundle)` is fine for bundles up to a few hundred KB; for larger ones, build the string in 32 KB chunks.)

- [ ] **Step 4: Run → pass; full suite; build.**
- [ ] **Step 5: Commit** — `git commit -am "feat(profile): Seal my writing — recovery code screen and seal path"`

### Task 12: Ship PR 2

- [ ] Open PR, CI green, merge with Jeff's go-ahead. Task 10 must be done **before** deploying.
- [ ] `npx supabase functions deploy delete-account --use-api`.
- [ ] Manual check on production with a throwaway account (Jeff's call): sign up, publish a short story, Seal, save the code; confirm the story is gone from the Library and a `sealed_bundles` row exists (`select email_key, length(bundle), expires_at from sealed_bundles`). Do **not** delete the row; PR 3 recovers it.

---

# PR 3 — Recover + House Rules

Branch: `feat/account-deletion-recover` from `main` after PR 2 merges.

### Task 13: `sealed-writing` Edge Function

**Files:**
- Create: `supabase/functions/sealed-writing/index.ts`

**Interfaces:**
- Consumes: `emailKey` (Task 9).
- Produces: `GET` → `{ waiting: false }` or `{ waiting: true, bundle: <base64>, sealed_at }`; `DELETE` → `{ removed: true }`. Both require a session with a **confirmed** email; otherwise 401.

- [ ] **Step 1: Implement**

```ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { emailKey } from '../_shared/emailKey.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user?.email || !user.email_confirmed_at) return json({ error: 'Please sign in with a confirmed email.' }, 401)

  const key = await emailKey(user.email, Deno.env.get('SEAL_EMAIL_KEY_SECRET') ?? '')
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

  if (req.method === 'GET') {
    const { data, error } = await admin.from('sealed_bundles').select('bundle, sealed_at').eq('email_key', key).maybeSingle()
    if (error) return json({ error: 'Could not check for sealed writing.' }, 500)
    if (!data) return json({ waiting: false })
    // bytea arrives as '\x<hex>'
    const hex = String(data.bundle).replace(/^\\x/, '')
    const bytes = Uint8Array.from(hex.match(/../g) ?? [], (h) => parseInt(h, 16))
    return json({ waiting: true, bundle: btoa(String.fromCharCode(...bytes)), sealed_at: data.sealed_at })
  }
  if (req.method === 'DELETE') {
    const { error } = await admin.from('sealed_bundles').delete().eq('email_key', key)
    if (error) return json({ error: 'Could not remove the seal.' }, 500)
    return json({ removed: true })
  }
  return json({ error: 'Method not allowed' }, 405)
})
```

- [ ] **Step 2:** `node --check supabase/functions/sealed-writing/index.ts`.
- [ ] **Step 3: Commit** — `git add supabase/functions/sealed-writing && git commit -m "feat(sealed-writing): fetch and remove a returning member's seal"`

### Task 14: Restore a payload

**Files:**
- Modify: `src/lib/sealCollect.js`, `src/lib/sealCollect.test.js`

**Interfaces:**
- Produces: `restoreWriting(supabase, userId, payload): Promise<{ stories: number, series: number }>`. Inserts stories (original `mod_status`, `created_at`, `version`), then series, then `series_books` mapped from `story_key` to the new ids.

- [ ] **Step 1: Failing test** (fake Supabase client recording inserts)

```js
import { restoreWriting } from './sealCollect'

function fakeClient() {
  const inserted = { books: [], series: [], series_books: [] }
  let n = 0
  return {
    inserted,
    from: (table) => ({
      insert: (rows) => {
        const withIds = [].concat(rows).map((r) => ({ id: `${table}-${++n}`, ...r }))
        inserted[table].push(...withIds)
        return { select: () => Promise.resolve({ data: withIds, error: null }), then: (f) => f({ error: null }) }
      },
    }),
  }
}

describe('restoreWriting', () => {
  it('restores stories live as they were, then series with their parts', async () => {
    const client = fakeClient()
    const payload = {
      v: 1,
      stories: [{ key: 'old-1', title: 'T', lede: 'L', content: 'C', cover: 'blood', badge: null, mod_status: 'live', created_at: 't1', updated_at: 't2', version: 2 }],
      series: [{ title: 'S', description: null, created_at: 't0', parts: [{ story_key: 'old-1', sort_order: 1 }] }],
    }
    expect(await restoreWriting(client, 'new-user', payload)).toEqual({ stories: 1, series: 1 })
    expect(client.inserted.books[0]).toMatchObject({ title: 'T', author_id: 'new-user', mod_status: 'live', created_at: 't1', version: 2 })
    expect(client.inserted.series_books[0]).toMatchObject({ book_id: client.inserted.books[0].id, sort_order: 1 })
  })
})
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement** (append to `sealCollect.js`)

```js
export async function restoreWriting(supabase, userId, payload) {
  const idFor = new Map()
  for (const s of payload.stories ?? []) {
    const { key, ...fields } = s
    const { data, error } = await supabase.from('books').insert({ ...fields, author_id: userId }).select('id')
    if (error) throw error
    idFor.set(key, data[0].id)
  }
  for (const s of payload.series ?? []) {
    const { data, error } = await supabase.from('series')
      .insert({ title: s.title, description: s.description, created_at: s.created_at, author_id: userId }).select('id')
    if (error) throw error
    const parts = s.parts.filter((p) => idFor.has(p.story_key))
      .map((p) => ({ series_id: data[0].id, book_id: idFor.get(p.story_key), sort_order: p.sort_order }))
    if (parts.length) {
      const { error: partsError } = await supabase.from('series_books').insert(parts)
      if (partsError) throw partsError
    }
  }
  return { stories: idFor.size, series: (payload.series ?? []).length }
}
```

- [ ] **Step 4: Run → pass.** Note for the executor: restoring `mod_status = 'screening'` through the client is allowed on insert (the `prevent_mod_status_reset` trigger fires on UPDATE only); verify in Task 16's manual check. If an insert of a `screening` story is rejected, restore it as `live` and flag it to Jeff.
- [ ] **Step 5: Commit.**

### Task 15: "Sealed writing is waiting" prompt

**Files:**
- Create: `src/components/SealedWritingPrompt.jsx`, `src/components/SealedWritingPrompt.test.jsx`
- Modify: `src/pages-react/Profile.jsx` (render `<SealedWritingPrompt />` at the top of the page)

**Interfaces:**
- Consumes: `sealed-writing` GET/DELETE; `unsealWriting`, `normaliseCode` (Task 7); `restoreWriting` (Task 14).

- [ ] **Step 1: Failing tests**

```jsx
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { test, expect, vi, beforeEach, afterEach } from 'vitest'

const invoke = vi.fn()
vi.mock('../supabaseClient', () => ({ supabase: { functions: { invoke: (...a) => invoke(...a) } } }))
vi.mock('./AuthContext', () => ({ useAuth: () => ({ session: { user: { id: 'u2' } } }) }))
const unsealWriting = vi.fn()
vi.mock('../lib/seal', () => ({ unsealWriting: (...a) => unsealWriting(...a), normaliseCode: (c) => c.toUpperCase() }))
const restoreWriting = vi.fn()
vi.mock('../lib/sealCollect', () => ({ restoreWriting: (...a) => restoreWriting(...a) }))

const SealedWritingPrompt = (await import('./SealedWritingPrompt')).default

beforeEach(() => {
  invoke.mockReset()
  unsealWriting.mockReset()
  restoreWriting.mockReset().mockResolvedValue({ stories: 2, series: 1 })
})
afterEach(() => cleanup())

test('shows nothing when no seal is waiting', async () => {
  invoke.mockResolvedValue({ data: { waiting: false }, error: null })
  const { container } = render(<SealedWritingPrompt />)
  await waitFor(() => expect(invoke).toHaveBeenCalled())
  expect(container).toBeEmptyDOMElement()
})

test('restores everything live and removes the seal', async () => {
  invoke.mockImplementation(async (_n, opts) => opts?.method === 'DELETE'
    ? { data: { removed: true }, error: null }
    : { data: { waiting: true, bundle: 'AQID', sealed_at: '2026-10-01' }, error: null })
  unsealWriting.mockResolvedValue({ v: 1, stories: [], series: [] })
  render(<SealedWritingPrompt />)
  fireEvent.change(await screen.findByLabelText(/recovery code/i), { target: { value: 'pale-hound' } })
  fireEvent.click(screen.getByRole('button', { name: /unseal/i }))
  await waitFor(() => expect(restoreWriting).toHaveBeenCalled())
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('sealed-writing', { method: 'DELETE' }))
  expect(await screen.findByText(/2 stories and 1 series are back/i)).toBeInTheDocument()
})

test('a wrong code restores nothing and keeps the seal', async () => {
  invoke.mockResolvedValue({ data: { waiting: true, bundle: 'AQID', sealed_at: '2026-10-01' }, error: null })
  unsealWriting.mockRejectedValue(new Error('wrong-code'))
  render(<SealedWritingPrompt />)
  fireEvent.change(await screen.findByLabelText(/recovery code/i), { target: { value: 'nope' } })
  fireEvent.click(screen.getByRole('button', { name: /unseal/i }))
  expect(await screen.findByText(/doesn’t open this seal/i)).toBeInTheDocument()
  expect(restoreWriting).not.toHaveBeenCalled()
  expect(invoke).not.toHaveBeenCalledWith('sealed-writing', { method: 'DELETE' })
})
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement**

```jsx
import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from './AuthContext'
import { unsealWriting } from '../lib/seal'
import { restoreWriting } from '../lib/sealCollect'

export default function SealedWritingPrompt() {
  const { session } = useAuth()
  const userId = session?.user?.id
  const [bundle, setBundle] = useState(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(null)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    supabase.functions.invoke('sealed-writing', { method: 'GET' }).then(({ data }) => {
      if (!cancelled && data?.waiting) setBundle(data.bundle)
    })
    return () => { cancelled = true }
  }, [userId])

  if (done) {
    return <p className="border border-[var(--color-line)] p-4 mb-8 font-serif text-sm">
      Welcome back. {done.stories} stories and {done.series} series are back, live.
    </p>
  }
  if (!bundle) return null

  const unseal = async () => {
    setBusy(true); setError(null)
    let payload
    try {
      const bytes = Uint8Array.from(atob(bundle), (c) => c.charCodeAt(0))
      payload = await unsealWriting(bytes, code)
    } catch {
      setError('That code doesn’t open this seal.')
      setBusy(false)
      return
    }
    try {
      const counts = await restoreWriting(supabase, userId, payload)
      await supabase.functions.invoke('sealed-writing', { method: 'DELETE' })
      setDone(counts)
    } catch {
      setError('Unsealed, but restoring failed. Your seal is kept; please try again.')
      setBusy(false)
    }
  }

  return (
    <section className="border border-[var(--color-ember)] p-5 mb-8">
      <h2 className="font-serif font-bold text-lg mb-2">Sealed writing is waiting for you</h2>
      <p className="font-serif text-sm text-[var(--color-text-secondary)] mb-4">
        Enter the recovery code you saved when you left. Everything comes back, live.
      </p>
      <label htmlFor="recovery-code" className="font-mono text-xs uppercase block mb-2">Recovery code</label>
      <input id="recovery-code" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" spellCheck="false"
        className="bg-[var(--color-bg-primary)] border border-[var(--color-line)] px-3 py-2 text-sm w-full font-mono mb-3" />
      {error && <p className="text-[var(--color-ember)] text-xs font-mono mb-3">{error}</p>}
      <button type="button" disabled={!code.trim() || busy} onClick={unseal}
        className="bg-[var(--color-ember)] text-white font-mono text-xs uppercase px-4 py-2 disabled:opacity-40 cursor-pointer">
        {busy ? 'Unsealing…' : 'Unseal my writing'}
      </button>
    </section>
  )
}
```

- [ ] **Step 4: Run → pass. Render it at the top of `Profile.jsx`. Full suite + build.**
- [ ] **Step 5: Commit** — `git commit -am "feat(profile): recover sealed writing"` (after adding new files).

### Task 16: House Rules wording + ship PR 3

**Files:**
- Modify: `src/pages/rules.astro:104-105`

- [ ] **Step 1:** Replace the "Your Content, Your Call" `<li>` body (line 105) with:

```html
Delete a post, thread, or story and it's actually gone — not archived, not quietly kept "just in case." The only exceptions: content removed by moderation, and where we're legally required to preserve something (a subpoena, DMCA recordkeeping, or reports of illegal content).
```

and add a new `<li>` directly after it:

```html
<li>
  <strong class="text-[var(--color-text-primary)] block mb-1">Leaving the Coven:</strong>
  When you delete your account you choose: <strong>Erase everything</strong>, and your stories, series, critiques and posts are gone for good; or <strong>Seal my writing</strong>, and your stories and series are locked with a recovery code only you hold, kept for up to seven years, and restored if you return with the same email. Nobody can open a seal without your code, including us. Other members' critiques and replies on your work stay, credited to "a departed member."
</li>
```

- [ ] **Step 2:** Test + build; open PR; CI green; merge with Jeff's go-ahead.
- [ ] **Step 3:** `npx supabase functions deploy sealed-writing --use-api`.
- [ ] **Step 4:** Manual round trip with the throwaway account from Task 12: sign up again with the same email, see the prompt, enter the saved code → stories back in the Library; `sealed_bundles` row gone. Then a wrong-code attempt on a fresh seal shows the error and keeps the row.
- [ ] **Step 5:** Record in the vault (`standing-decisions.md`): the deletion model, "never rotate `SEAL_EMAIL_KEY_SECRET`", and the 7-year purge job name `purge-expired-seals`.
