# Site event capture (keeper insight, piece 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Log every failure a member hits (failed requests and error messages shown, not only crashes) into the existing `client_errors` table.

**Architecture:** A wrapped `fetch` handed to the one Supabase client reports any failed request; a thin wrapper around sonner's `toast` reports error messages shown. Both write through a new RPC, `log_site_event`, while `log_client_error` keeps its signature for old bundles. Two pull requests: the migration alone (1a), then the site code (1b).

**Tech Stack:** Astro 7, React islands, `@supabase/supabase-js`, sonner, vitest (jsdom), Postgres (Supabase), PowerShell rehearsal script.

**Spec:** `docs/superpowers/specs/2026-11-15-keeper-insight-design.md` (section "PR 1: Capture", plus "The rule for what may be kept", "Anti-goals", "Constraints", "Privacy wording"). Pieces 2, 3 and 4 get their own plans when they are next.

## Global Constraints

- Never push `main`. Branch, commit, open a PR; Jeff merges. Merging a migration applies it to production.
- PR 1a carries only the migration, its SQL test and the grants allowlist. PR 1b starts from `main` after 1a is merged.
- Every migration is rehearsed in `begin; … rollback;` before its PR is opened. The rehearsal runs in Jeff's terminal as `& .\scripts\sql\rehearse.ps1 -Test <test.sql> -Migration <migration.sql>` and Jeff answers the CLI's production prompt. Never use MCP `apply_migration`.
- New functions: `revoke all … from public`, explicit `grant execute`, and a row per grantee in `scripts/sql/verify-grants.sql`'s allowlist, in the same PR. Every migration ends with `NOTIFY pgrst, 'reload schema';`.
- Never add a parameter to an existing RPC. `log_client_error(text, text, text, text, text)` keeps exactly that signature.
- Never logged: request bodies, query strings, hashes, form contents. Error messages are kept whole.
- The logger never throws, never delays a request, never changes a response.
- `supabase` may be null. Pages also render inside workerd, where `window` is undefined: logging is browser-only.
- Retention is 90 days. The hourly cap stays 300 rows.
- No new npm dependency.
- Tests: run only the single test file a step names (`npx vitest run <file>`). Jeff runs the full suite (`npm run test:unit`) and E2E (`cmd /c npx playwright test`) himself; CI runs vitest on the PR.
- Commit messages end with `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`. PR bodies end with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

## Review Focus

1. A failed response whose body is not JSON (a Cloudflare HTML 502, an empty body): still logged, as `HTTP 502`, and nothing throws. → Task 4.
2. The caller must still be able to read the response body after the logger has looked at it. → Task 4.
3. The logging call itself failing (offline, cap reached) must not be logged, or it loops. → Tasks 2 and 4.
4. A retry loop failing the same request 50 times on one page is one row; 30 different failures are 10 rows. → Task 3.
5. `toast.error` given something that is not a string (an `Error`, JSX): the toast still shows, nothing throws. → Task 5.
6. A member whose account was deleted while their tab stayed open: their next logged event is stored with no member, not rejected by the new foreign key. → Task 1.

## File Structure

| File | Responsibility |
|------|----------------|
| `supabase/migrations/20261116000000_site_event_log.sql` (create) | New kinds and columns, account-deletion cascade, `log_site_event`, updated `log_client_error` body |
| `scripts/sql/test-site-events.sql` (create) | Behaviour test for the migration |
| `scripts/sql/verify-grants.sql` (modify) | Allowlist rows for `log_site_event` |
| `src/lib/requestAction.js` (create) | Pure: name a request from method + URL; decide what is normal traffic |
| `src/lib/errorReporter.js` (modify) | `reportSiteEvent`, budgets, page address without query |
| `src/lib/loggingFetch.js` (create) | `makeLoggingFetch`: the wrapped fetch |
| `src/supabaseClient.js` (modify) | Pass the wrapped fetch to `createClient`; export it |
| `src/lib/passkey.js` (modify) | Use the wrapped fetch |
| `src/lib/notify.js` (create) | `toast` that also reports error messages shown |
| `src/lib/toastImports.test.js` (create) | Rule: nobody imports `toast` from `sonner` directly |
| 19 components + 3 tests (modify) | Import `toast` from `notify` |
| `src/lib/pulse.js` (modify) | Pulse count leaves out `shown` |
| `src/pages/rules.astro` (modify) | Privacy paragraph |

---

# PR 1a: the migration

Branch: `feat/site-event-log-db` from `main`.

### Task 1: Migration, SQL test, grants

**Files:**
- Create: `supabase/migrations/20261116000000_site_event_log.sql`
- Create: `scripts/sql/test-site-events.sql`
- Modify: `scripts/sql/verify-grants.sql` (allowlist, beside the `log_client_error` rows at about line 94)

**Interfaces:**
- Produces: `public.log_site_event(p_kind text, p_message text, p_stack text default null, p_url text default null, p_user_agent text default null, p_action text default null, p_status integer default null, p_code text default null) returns void`, callable by `anon` and `authenticated`.
- Produces: `client_errors` columns `action text`, `status integer`, `code text`; `kind` allows `island`, `window`, `promise`, `request`, `shown`.

- [ ] **Step 1: Write the failing SQL test** `scripts/sql/test-site-events.sql`

Copy the header comment style, the `begin;` / `rollback;` frame, and the `pg_temp.must` and `pg_temp.be` helpers from `scripts/sql/test-admin-export.sql`. First block raises `FAIL: the migration is not loaded` when `to_regprocedure('public.log_site_event(text,text,text,text,text,text,integer,text)')` is null. Create one throwaway `auth.users` row the way `scripts/sql/test-delete-member.sql` does. Last statement before `rollback;` is `select 'ALL PASS';`. Assertions, each through `pg_temp.must`:

| # | Do | Must be true |
|---|----|--------------|
| 1 | as anon: `log_site_event('request','duplicate key',null,'https://horrorwriter.org/my-stories/?x=1#top','UA','books:update',409,'23505')` | one row: `kind='request'`, `url='https://horrorwriter.org/my-stories/'`, `action='books:update'`, `status=409`, `code='23505'`, `user_id is null` |
| 2 | as the throwaway member: `log_site_event('shown','Could not save',null,'https://horrorwriter.org/publish/')` | row has `kind='shown'` and `user_id` = that member |
| 3 | `log_site_event('nonsense','x')` | no row added |
| 4 | `log_site_event('request','   ')` | no row added |
| 5 | `log_site_event('request','m',null,null,null,null,700,null)` | row has `status is null` |
| 6 | `log_site_event('request', repeat('a',2000), null, null, null, repeat('b',300), 500, repeat('c',100))` | `length(message)=1000`, `length(action)=120`, `length(code)=40` |
| 7 | as anon: `log_client_error('window','old bundle',null,'https://horrorwriter.org/?utm_source=x',null)` | row has `url='https://horrorwriter.org/'` |
| 8 | as admin insert two rows with `created_at` 60 and 91 days ago, then call `log_client_error('window','prune',null,null,null)` | the 60-day row exists, the 91-day row is gone |
| 9 | as a member whose `sub` claim is a uuid not in `auth.users`: `log_site_event('request','ghost')` | row exists with `user_id is null` |
| 10 | as admin: `delete from auth.users where id = <throwaway>` | no `client_errors` row has that `user_id` |
| 11 | as anon: `select count(*) from public.client_errors` | 0 (row-level security unchanged) |

- [ ] **Step 2: Write the migration** `supabase/migrations/20261116000000_site_event_log.sql`, in this order

1. `alter table public.client_errors add column action text, add column status integer, add column code text;`
2. Drop `client_errors_kind_check`; add it back allowing the five kinds.
3. `update public.client_errors set user_id = null where user_id is not null and not exists (select 1 from auth.users u where u.id = client_errors.user_id);`
4. Add `client_errors_user_id_fkey` → `auth.users(id) on delete cascade`, and `create index client_errors_user_id_idx on public.client_errors (user_id) where user_id is not null;`
5. `create or replace function public.log_client_error(...)` with the **same five text parameters**, `security definer`, `set search_path = ''`. Body as today except: `url` stored as `regexp_replace(left(p_url, 500), '[?#].*$', '')`; `user_id` is `(select u.id from auth.users u where u.id = auth.uid())`; retention `interval '90 days'`.
6. `create function public.log_site_event(...)` with the signature in Interfaces. Same guards and the same three changes as step 5, plus: accepts the five kinds; stores `left(p_action, 120)`, `left(p_code, 40)`, and `p_status` only when `between 0 and 599`.
7. `revoke all on function public.log_site_event(text,text,text,text,text,text,integer,text) from public;` then `grant execute … to anon, authenticated, service_role;`
8. `NOTIFY pgrst, 'reload schema';`

Open with a comment block in the style of `20261020010000_client_errors.sql` saying what the two new kinds are and why `log_client_error` survives (old bundles).

- [ ] **Step 3: Add the allowlist rows** in `scripts/sql/verify-grants.sql`, directly under the two `log_client_error` rows:

```sql
  -- Site event log (20261116000000). Same guards as log_client_error, wider fields.
  ('log_site_event',           'anon',          'error capture, write-only, rate-capped'),
  ('log_site_event',           'authenticated', 'error capture, write-only, rate-capped'),
```

- [ ] **Step 4: Rehearse.** Ask Jeff to run, and to answer the production prompt:

```powershell
& .\scripts\sql\rehearse.ps1 -Test scripts\sql\test-site-events.sql -Migration supabase\migrations\20261116000000_site_event_log.sql
```

Expected: final row `ALL PASS`. Any `FAIL: …` names the broken assertion; fix and rerun.

- [ ] **Step 5: Commit, push, open PR 1a**

```bash
git add supabase/migrations/20261116000000_site_event_log.sql scripts/sql/test-site-events.sql scripts/sql/verify-grants.sql
git commit -m "feat(db): site event log: failed requests and shown messages"
```

PR body: what it adds, that nothing calls `log_site_event` yet, the rehearsal result, and "after merge: `verify-grants.sql` must return zero rows".

- [ ] **Step 6: After Jeff merges**, run `scripts/sql/verify-grants.sql` read-only against production (`npx supabase db query --remote --read-only -f scripts/sql/verify-grants.sql`). Expected: zero rows.

---

# PR 1b: the site code

Branch: `feat/site-event-log` from `main`, after PR 1a is merged and verified.

### Task 2: Name a request, and know normal traffic

**Files:**
- Create: `src/lib/requestAction.js`
- Test: `src/lib/requestAction.test.js`

**Interfaces:**
- Produces: `requestAction(method: string, url: string): string | null`
- Produces: `shouldIgnore(event: { action, status, code, errorName }): boolean`

- [ ] **Step 1: Write the failing tests**

```js
import { test, expect } from 'vitest'
import { requestAction, shouldIgnore } from './requestAction'

const B = 'https://x.supabase.co'
test.each([
  ['POST',   `${B}/rest/v1/rpc/create_thread_with_post`,         'rpc:create_thread_with_post'],
  ['GET',    `${B}/rest/v1/books?select=*&id=eq.123`,            'books:select'],
  ['HEAD',   `${B}/rest/v1/books`,                               'books:select'],
  ['POST',   `${B}/rest/v1/book_comments`,                       'book_comments:insert'],
  ['PATCH',  `${B}/rest/v1/books?id=eq.123`,                     'books:update'],
  ['DELETE', `${B}/rest/v1/user_follows?follower_id=eq.1`,       'user_follows:delete'],
  ['POST',   `${B}/auth/v1/otp`,                                 'auth:otp'],
  ['POST',   `${B}/auth/v1/token?grant_type=refresh_token`,      'auth:token'],
  ['POST',   `${B}/functions/v1/open-ticket`,                    'fn:open-ticket'],
  ['POST',   `${B}/storage/v1/object/avatars/a.png`,             'storage:insert'],
  ['GET',    'https://example.com/anything',                     null],
  ['GET',    'not a url',                                        null],
])('%s %s → %s', (method, url, expected) => {
  expect(requestAction(method, url)).toBe(expected)
})

test('the action never carries a query value', () => {
  expect(requestAction('GET', `${B}/rest/v1/profiles?handle=eq.secret`)).not.toContain('secret')
})

test.each([
  [{ action: 'rpc:log_site_event', status: 500 }, true],   // logging its own failure would loop
  [{ action: 'rpc:log_client_error', status: 0 }, true],
  [{ action: 'books:select', status: 406, code: 'PGRST116' }, true], // .single() found no row
  [{ action: 'books:select', status: 0, errorName: 'AbortError' }, true], // member navigated away
  [{ action: 'auth:token', status: 400 }, true],            // expired session refresh
  [{ action: 'books:update', status: 409, code: '23505' }, false],
  [{ action: 'auth:otp', status: 429 }, false],
  [{ action: null, status: 500 }, false],
])('shouldIgnore(%o) → %s', (event, expected) => {
  expect(shouldIgnore(event)).toBe(expected)
})
```

- [ ] **Step 2: Run** `npx vitest run src/lib/requestAction.test.js`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement both functions.** Verb map: `GET`/`HEAD` → `select`, `POST` → `insert`, `PATCH`/`PUT` → `update`, `DELETE` → `delete`. Keep the ignore rules as a list of `{ reason, test }` so each carries its one-line reason.
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: name failed requests and skip normal traffic`

### Task 3: The reporter learns the new kinds

**Files:**
- Modify: `src/lib/errorReporter.js`
- Test: `src/lib/errorReporter.test.js`

**Interfaces:**
- Produces: `reportSiteEvent(event: { kind, message, stack?, action?, status?, code? }): Promise<void>`. Calls RPC `log_site_event` with `p_kind, p_message, p_stack, p_url, p_user_agent, p_action, p_status, p_code`.
- Keeps: `reportClientError(kind, err, extraStack)`, `installErrorReporter`, `_resetErrorReporter`, `_resetInstalled`.

- [ ] **Step 1: Update the existing test and add new ones.** In "sends kind, message, stack and url", change the expected function to `log_site_event` and the expected `p_url` to `window.location.origin + window.location.pathname`. Add:

```js
test('the page address is sent without query string or hash', async () => {
  window.history.pushState({}, '', '/publish/?draft=1#top')
  await reportSiteEvent({ kind: 'shown', message: 'x' })
  expect(rpc.mock.calls[0][1].p_url).toBe(window.location.origin + '/publish/')
})

test('a request event carries action, status and code', async () => {
  await reportSiteEvent({ kind: 'request', message: 'duplicate key', action: 'books:update', status: 409, code: '23505' })
  expect(rpc.mock.calls[0]).toEqual(['log_site_event', expect.objectContaining({
    p_kind: 'request', p_message: 'duplicate key', p_action: 'books:update', p_status: 409, p_code: '23505',
  })])
})

test('the same failing request is reported once per page', async () => {
  for (let i = 0; i < 50; i++) await reportSiteEvent({ kind: 'request', message: `try ${i}`, action: 'books:update', status: 409, code: '23505' })
  expect(rpc).toHaveBeenCalledTimes(1)
})

test('requests and shown messages share a budget of 10, apart from crashes', async () => {
  for (let i = 0; i < 30; i++) await reportSiteEvent({ kind: 'request', message: 'm', action: `t${i}:update`, status: 500 })
  expect(rpc).toHaveBeenCalledTimes(10)
  for (let i = 0; i < 10; i++) await reportClientError('window', new Error(`e${i}`))
  expect(rpc).toHaveBeenCalledTimes(15)
})

test('never throws when the rpc fails', async () => {
  rpc.mockRejectedValueOnce(new Error('network down'))
  await expect(reportSiteEvent({ kind: 'shown', message: 'x' })).resolves.toBeUndefined()
})
```

- [ ] **Step 2: Run** `npx vitest run src/lib/errorReporter.test.js`. Expected: FAIL on the new and changed tests.
- [ ] **Step 3: Implement.** `reportSiteEvent` is the one place that calls the RPC; `reportClientError` normalises its error as today and delegates. De-duplication key: crashes and `shown` by message, `request` by `action|status|code`. Two budgets: 5 for `island`/`window`/`promise`, 10 for `request`/`shown`. `_resetErrorReporter` clears both.
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: reporter sends requests and shown messages to log_site_event`

### Task 4: The wrapped fetch

**Files:**
- Create: `src/lib/loggingFetch.js`
- Test: `src/lib/loggingFetch.test.js`
- Modify: `src/supabaseClient.js`
- Modify: `src/lib/passkey.js` (`callFunction`, the `fetch(` at about line 12)

**Interfaces:**
- Consumes: `requestAction`, `shouldIgnore` (Task 2); `reportSiteEvent` (Task 3).
- Produces: `makeLoggingFetch(report: (event) => unknown, baseFetch = fetch): typeof fetch`
- Produces: `loggedFetch` exported from `src/supabaseClient.js`.

- [ ] **Step 1: Write the failing tests**

```js
import { test, expect, vi } from 'vitest'
import { makeLoggingFetch } from './loggingFetch'

const URL_ = 'https://x.supabase.co/rest/v1/books?id=eq.1'
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const settle = () => new Promise((r) => setTimeout(r, 0))

test('a successful response is returned untouched and nothing is reported', async () => {
  const res = json(200, { ok: true })
  const report = vi.fn()
  const out = await makeLoggingFetch(report, async () => res)(URL_, { method: 'PATCH' })
  expect(out).toBe(res)
  await settle()
  expect(report).not.toHaveBeenCalled()
})

test('a failed response is reported, and the caller can still read its body', async () => {
  const report = vi.fn()
  const out = await makeLoggingFetch(report, async () => json(409, { code: '23505', message: 'duplicate key' }))(URL_, { method: 'PATCH' })
  expect(await out.json()).toEqual({ code: '23505', message: 'duplicate key' })
  await settle()
  expect(report).toHaveBeenCalledWith({ kind: 'request', action: 'books:update', status: 409, code: '23505', message: 'duplicate key' })
})

test('an auth-style body is understood', async () => {
  const report = vi.fn()
  await makeLoggingFetch(report, async () => json(429, { error_code: 'over_email_send_rate_limit', msg: 'Too many emails' }))('https://x.supabase.co/auth/v1/otp', { method: 'POST' })
  await settle()
  expect(report).toHaveBeenCalledWith(expect.objectContaining({ action: 'auth:otp', status: 429, code: 'over_email_send_rate_limit', message: 'Too many emails' }))
})

test('a body that is not JSON is still reported', async () => {
  const report = vi.fn()
  await makeLoggingFetch(report, async () => new Response('<html>Bad gateway</html>', { status: 502 }))(URL_, { method: 'GET' })
  await settle()
  expect(report).toHaveBeenCalledWith(expect.objectContaining({ status: 502, code: null, message: 'HTTP 502' }))
})

test('a network failure is reported with status 0 and rethrown', async () => {
  const report = vi.fn()
  const boom = new TypeError('Failed to fetch')
  await expect(makeLoggingFetch(report, async () => { throw boom })(URL_, { method: 'PATCH' })).rejects.toBe(boom)
  await settle()
  expect(report).toHaveBeenCalledWith(expect.objectContaining({ kind: 'request', action: 'books:update', status: 0, message: 'Failed to fetch' }))
})

test('normal traffic and its own logging call are not reported', async () => {
  const report = vi.fn()
  const f = makeLoggingFetch(report, async () => json(406, { code: 'PGRST116', message: 'no rows' }))
  await f(URL_, { method: 'GET' })
  await makeLoggingFetch(report, async () => json(500, {}))('https://x.supabase.co/rest/v1/rpc/log_site_event', { method: 'POST' })
  await settle()
  expect(report).not.toHaveBeenCalled()
})

test('a reporter that throws does not break the request', async () => {
  const res = json(500, { message: 'x' })
  const out = await makeLoggingFetch(() => { throw new Error('reporter broke') }, async () => res)(URL_, { method: 'GET' })
  expect(out).toBe(res)
})

test('accepts a Request object as input', async () => {
  const report = vi.fn()
  await makeLoggingFetch(report, async () => json(500, { message: 'x' }))(new Request(URL_, { method: 'DELETE' }))
  await settle()
  expect(report).toHaveBeenCalledWith(expect.objectContaining({ action: 'books:delete' }))
})
```

- [ ] **Step 2: Run** `npx vitest run src/lib/loggingFetch.test.js`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement `makeLoggingFetch`.** It awaits `baseFetch` and returns that same response object; on `!res.ok` it reads `res.clone()` without awaiting in the caller's path. Body fields: `code` from `code ?? error_code ?? null`; `message` from `message ?? msg ?? error_description ?? error`, falling back to `` `HTTP ${status}` ``. When `typeof window === 'undefined'` it calls `baseFetch` and does nothing else. Method comes from `init.method`, else the `Request`'s, else `GET`.
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Wire it in `src/supabaseClient.js`.** Export `loggedFetch = makeLoggingFetch((e) => import('./lib/errorReporter').then((m) => m.reportSiteEvent(e)))`. The dynamic import is what breaks the `supabaseClient` ↔ `errorReporter` cycle. Pass `{ global: { fetch: loggedFetch } }` as `createClient`'s third argument, except when `isPlaywrightTest()` (`src/lib/testMode.js`) is true: E2E mocks its requests and must not gain an unmocked logging call.
- [ ] **Step 6: In `src/lib/passkey.js`,** import `loggedFetch` from `../supabaseClient` and use it in `callFunction` in place of `fetch`.
- [ ] **Step 7: Run** `npx vitest run src/lib/errorReporter.test.js src/lib/loggingFetch.test.js` and `src/lib/passkey.test.js` (repoint its fetch mock if it stubs the global `fetch`). Expected: PASS.
- [ ] **Step 8: Commit** `feat: log failed Supabase and passkey requests`

### Task 5: Error messages shown

**Files:**
- Create: `src/lib/notify.js`
- Test: `src/lib/notify.test.js`, `src/lib/toastImports.test.js`
- Modify, changing only the import line to `import { toast } from '<relative>/lib/notify'`: `src/components/AppealButton.jsx`, `BlockButton.jsx`, `PasskeyPrompt.jsx`, `ReportModal.jsx`, `TranscribeModal.jsx`; `src/components/admin/RitualsTab.jsx`, `SiteTab.jsx`, `TicketCard.jsx`, `WorkQueueTab.jsx`; `src/components/mod/AppealsTab.jsx`, `FilterRulesTab.jsx`, `InlineModControls.jsx`, `ReportsTab.jsx`, `StormAlertsTab.jsx`, `UserModProfile.jsx`; `src/lib/useNotifications.js`; `src/pages-react/MyStories.jsx`, `Profile.jsx`, `PublishStory.jsx`
- Modify: `src/components/admin/TicketCard.test.jsx`, `src/components/admin/WorkQueueTab.test.jsx`, `src/components/mod/UserModProfile.test.jsx`: mock and import `toast` from the `notify` module instead of `sonner`, same mock shape.
- Unchanged: `src/layouts/MainLayout.astro` imports `Toaster`, not `toast`.

**Interfaces:**
- Consumes: `reportSiteEvent` (Task 3).
- Produces: `toast` from `src/lib/notify.js`, a drop-in for sonner's.

- [ ] **Step 1: Write the failing tests** `src/lib/notify.test.js`

```js
import { test, expect, vi, beforeEach } from 'vitest'

const sonner = Object.assign(vi.fn(), { error: vi.fn(() => 'id-1'), success: vi.fn(), dismiss: vi.fn() })
vi.mock('sonner', () => ({ toast: sonner }))
const reportSiteEvent = vi.fn(async () => {})
vi.mock('./errorReporter', () => ({ reportSiteEvent: (...a) => reportSiteEvent(...a) }))
const { toast } = await import('./notify')

beforeEach(() => { vi.clearAllMocks() })

test('toast.error shows the toast and reports the message', () => {
  expect(toast.error('Could not save', { duration: 5 })).toBe('id-1')
  expect(sonner.error).toHaveBeenCalledWith('Could not save', { duration: 5 })
  expect(reportSiteEvent).toHaveBeenCalledWith({ kind: 'shown', message: 'Could not save' })
})

test('an Error is reported by its message', () => {
  toast.error(new Error('boom'))
  expect(reportSiteEvent).toHaveBeenCalledWith({ kind: 'shown', message: 'boom' })
})

test('anything else still shows and reports nothing', () => {
  const node = { type: 'div' }
  expect(() => toast.error(node)).not.toThrow()
  expect(sonner.error).toHaveBeenCalledWith(node)
  expect(reportSiteEvent).not.toHaveBeenCalled()
})

test('a reporter that throws never stops the toast', () => {
  reportSiteEvent.mockImplementationOnce(() => { throw new Error('x') })
  expect(() => toast.error('still shown')).not.toThrow()
  expect(sonner.error).toHaveBeenCalled()
})

test('other methods and the bare call pass straight through', () => {
  toast.success('ok'); toast.dismiss('id'); toast('plain')
  expect(sonner.success).toHaveBeenCalledWith('ok')
  expect(sonner.dismiss).toHaveBeenCalledWith('id')
  expect(sonner).toHaveBeenCalledWith('plain')
  expect(reportSiteEvent).not.toHaveBeenCalled()
})
```

and `src/lib/toastImports.test.js`: walk `src/` the way `offenders()` does in `src/styles/designTokens.test.js`, over `.js`, `.jsx` and `.astro` files that are not `*.test.*`, and fail listing every file other than `lib/notify.js` that matches `/import\s*\{[^}]*\btoast\b[^}]*\}\s*from\s*['"]sonner['"]/`. Test name: `nobody imports toast from sonner directly (use src/lib/notify)`.

- [ ] **Step 2: Run** `npx vitest run src/lib/notify.test.js src/lib/toastImports.test.js`. Expected: FAIL (no module; 19 offenders listed).
- [ ] **Step 3: Implement `src/lib/notify.js`**, then change the import line in the 19 files and repoint the three test mocks.
- [ ] **Step 4: Run** `npx vitest run src/lib/notify.test.js src/lib/toastImports.test.js src/components/admin/TicketCard.test.jsx src/components/admin/WorkQueueTab.test.jsx src/components/mod/UserModProfile.test.jsx`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: log error messages shown to members`

### Task 6: Pulse count and the privacy paragraph

**Files:**
- Modify: `src/lib/pulse.js` (the `client_errors` select at about line 173; the tally loop at about line 123)
- Test: `src/lib/pulse.test.js`
- Modify: `src/pages/rules.astro` (the first `<p>` under `id="privacy"`, about line 128)

- [ ] **Step 1: Add the failing test** to `src/lib/pulse.test.js`, calling `computePulse({ errors: [...] })` as the existing error test at about line 131 does: three error rows this week with kinds `window`, `request`, `shown` must give `siteErrors.this === 2`, and `topErrors` must not include the `shown` row's message. Name: `messages shown are left out of the site error count`.
- [ ] **Step 2: Run** `npx vitest run src/lib/pulse.test.js`. Expected: FAIL (count is 3).
- [ ] **Step 3: Implement.** Add `kind` to the select and skip rows whose `kind === 'shown'` before tallying.
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Replace the privacy paragraph** in `src/pages/rules.astro` with exactly this (the "Recovery codes use…" line below it stays):

> We keep only what this site needs to run and to get better. That means your email address, your settings, and what you post. Signing in records your device type and network address, which the sign-in service uses to keep your account secure. When something fails in your browser, the site records what failed, the page, and your browser type so it can be fixed; these records are deleted after 90 days. All of it is created here, stays here, and is used only to fix and improve this site. We use no advertising trackers, no outside analytics, and no cookies beyond the one that keeps you signed in, and we do not record what you read. Your email is never sold, traded, or shared, unless required by legal subpoena.

Then `grep -rn "bare minimum" src tests e2e` and update any test that quotes the old sentence.

- [ ] **Step 6: Commit** `feat: Pulse leaves out shown messages; privacy section states what is recorded`

### Task 7: PR 1b and the preview check

- [ ] **Step 1:** `npm run build`. Expected: completes with no error.
- [ ] **Step 2:** Push and open PR 1b. Body: what is now logged, what is never logged, the privacy paragraph quoted in full for Jeff to edit, and the check below. Ask Jeff to run `npm run test:unit` and `cmd /c npx playwright test`.
- [ ] **Step 3: On the PR's Workers preview**, signed in (Jeff signs in on the preview), with DevTools → Network:
  1. Confirm the page hydrates (JS files load; the `_headers` trap in CLAUDE.md).
  1b. Browse five or six pages signed out and then signed in, with nothing blocked. Expected: no new rows at all. This is the only real test that ordinary browsing does not fill the log.
  2. Block one request URL: `*/rest/v1/user_follows*`. Open another member's profile and press Follow.
  3. Sign out. Block `*/functions/v1/webauthn-authenticate-begin*`, open Sign in, and press the passkey button. (Nothing is sent and no account is touched.)
- [ ] **Step 4: Read the result** with a read-only query against production:

```sql
select created_at, kind, action, status, code, left(message, 80) as message, url, user_id is not null as signed_in
from public.client_errors order by created_at desc limit 10;
```

Expected: a `request` row with `action` starting `user_follows:` and `status = 0`, signed in; a `request` row with `action = 'fn:webauthn-authenticate-begin'` and `status = 0`, signed out; any `shown` rows for toasts that appeared; every `url` free of `?` and `#`; no row for `rpc:log_site_event`.

- [ ] **Step 5:** Report what was seen to Jeff, with the rows. After he merges, confirm the live bundle carries `log_site_event` (Admin → Overview → Infrastructure shows the build SHA) and add a Shipped line to the vault's `now.md`.
