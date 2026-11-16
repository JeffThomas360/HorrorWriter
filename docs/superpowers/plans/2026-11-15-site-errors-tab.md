# Site Errors tab (keeper insight, piece 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A seventh Admin tab where the Keeper reads the error log grouped by cause, without SQL.

**Architecture:** The Keeper can already read `client_errors` by row-level security, so there is no migration. One module fetches the rows for a time window plus the handles of the members in them; one pure module groups rows into problems and turns codes and user agents into plain words; one React component renders it with filters, in the manner of `AuditTab.jsx`.

**Tech Stack:** Astro 7, React islands, `@tanstack/react-query`, `@supabase/supabase-js`, vitest (jsdom) with Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-15-keeper-insight-design.md`, section "PR 2: Site Errors tab". Piece 1 (capture) is merged: #156, #157.

## Global Constraints

- Never push `main`. Branch `feat/site-errors-tab`, commit, open a PR; Jeff merges.
- No migration, no new RPC, no new npm dependency.
- Keeper only: the tab shows only when `profile.mod_role === 'keeper'`, like Overview, Users, Site and Rituals.
- `supabase` may be null: guard before querying.
- `profiles` has column-level grants: never `select('*')`. This plan selects only `id, handle`.
- Never show an IP address or location. The log holds none; do not add any.
- Messages, stacks and page addresses are shown as text only. No `dangerouslySetInnerHTML`.
- Pages are shown as a path only (`/my-stories/`), never with a query string or hash. Rows written before piece 1 still carry query strings in `url`.
- Reds: `--color-ember` for anything small or interactive, `--color-blood` only for large display type, borders, fills. `#991B1B` is banned by test.
- Tap targets 44px high on phones; check the layout at 360px as well as 375px.
- Tests: run only the test files a step names. Jeff runs the full suite and E2E; CI runs vitest on the PR.
- Commit messages end with `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`. The PR body ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

## Review Focus

1. An empty log, or no rows in the chosen window: a plain sentence, not a blank panel. → Task 3.
2. Rows from before piece 1 have no `action`, `status` or `code`, and any row may have a null `url`, `user_agent` or `stack`: nothing crashes; device reads "Unknown device", page reads "unknown page". → Tasks 1 and 3.
3. A member whose profile cannot be read (hidden, or gone since): shown as "a member", still counted. → Tasks 2 and 3.
4. The fetch cap is reached: the tab says so instead of quietly showing part of the picture. → Tasks 2 and 3.
5. A very long message or stack: wraps inside the card at 360px; the stack stays collapsed until asked for. → Task 3.
6. A filter that leaves nothing: "Nothing matches those filters", with the filters still usable. → Task 3.

## File Structure

| File | Responsibility |
|------|----------------|
| `src/lib/siteErrors.js` (create) | Pure: device words, page path, message normalising, grouping, titles, summary |
| `src/lib/siteErrors.test.js` (create) | Tests for the above |
| `src/lib/siteErrorsApi.js` (create) | Fetch rows for a window and the handles of the members in them |
| `src/lib/siteErrorsApi.test.js` (create) | Tests with a mocked Supabase client |
| `src/components/admin/SiteErrorsTab.jsx` (create) | The tab |
| `src/components/admin/SiteErrorsTab.test.jsx` (create) | Component tests |
| `src/pages-react/Admin.jsx` (modify) | Register the tab |
| `src/components/admin/PulsePanel.jsx` (modify) | Link from Pulse's "Site errors" section |
| `src/components/admin/PulsePanel.test.jsx` (modify) | Test for the link |

---

### Task 1: Group rows into problems

**Files:**
- Create: `src/lib/siteErrors.js`
- Test: `src/lib/siteErrors.test.js`

**Interfaces:**
- Produces:
  - `WINDOWS`: `[{ id: '24h', label: 'Last 24 hours', hours: 24 }, { id: '7d', label: 'Last 7 days', hours: 168 }, { id: '30d', label: 'Last 30 days', hours: 720 }, { id: '90d', label: 'Last 90 days', hours: 2160 }]`
  - `KINDS`: `[{ id: 'crash', label: 'Page crashed' }, { id: 'request', label: 'Request failed' }, { id: 'shown', label: 'Message shown' }]`
  - `kindGroup(kind: string): 'crash' | 'request' | 'shown'` (`island`, `window`, `promise` and anything unknown → `'crash'`)
  - `describeDevice(userAgent: string | null): string`
  - `pagePath(url: string | null): string`
  - `normalizeMessage(message: string | null): string`
  - `groupProblems(rows: Row[], filters?: { kind?: string, userId?: string }): Problem[]`
  - `summarize(problems: Problem[]): { problems: number, members: number, occurrences: number }`
- `Row` is a `client_errors` row: `{ id, created_at, kind, message, stack, url, user_agent, user_id, action, status, code }`.
- `Problem`: `{ key, kind, title, message, action, status, code, count, memberIds: string[], signedOut: number, pages: [{ path, count }], devices: [{ label, count }], firstSeen, lastSeen, occurrences: Row[] }`. `pages` and `devices` are sorted by count descending and hold at most 3. `occurrences` is newest first and holds at most 20. `groupProblems` returns problems newest `lastSeen` first.

- [ ] **Step 1: Write the failing tests**

```js
import { test, expect } from 'vitest'
import { kindGroup, describeDevice, pagePath, normalizeMessage, groupProblems, summarize, WINDOWS, KINDS } from './siteErrors'

const row = (over = {}) => ({
  id: 1, created_at: '2026-11-11T10:00:00Z', kind: 'request', message: 'duplicate key value violates unique constraint "series_books_pkey"',
  stack: null, url: 'https://horrorwriter.org/my-stories/', user_agent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36',
  user_id: 'u1', action: 'series_books:insert', status: 409, code: '23505', ...over,
})

test('windows and kinds are the ones the tab offers', () => {
  expect(WINDOWS.map((w) => w.id)).toEqual(['24h', '7d', '30d', '90d'])
  expect(KINDS.map((k) => k.id)).toEqual(['crash', 'request', 'shown'])
})

test.each([
  ['island', 'crash'], ['window', 'crash'], ['promise', 'crash'], ['request', 'request'], ['shown', 'shown'], ['mystery', 'crash'], [null, 'crash'],
])('kindGroup(%s) → %s', (kind, expected) => expect(kindGroup(kind)).toBe(expected))

test.each([
  ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', 'Windows, Chrome'],
  ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0', 'Windows, Edge'],
  ['Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0', 'Windows, Firefox'],
  ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15', 'Mac, Safari'],
  ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1', 'iPhone, Safari'],
  ['Mozilla/5.0 (iPad; CPU OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1', 'iPad, Chrome'],
  ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36', 'Android, Chrome'],
  ['Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0 Mobile Safari/537.36', 'Android, Samsung Internet'],
  ['Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', 'Linux, Chrome'],
  ['curl/8.4.0', 'Unknown device'],
  ['', 'Unknown device'],
  [null, 'Unknown device'],
])('describeDevice → %s', (ua, expected) => expect(describeDevice(ua)).toBe(expected))

test.each([
  ['https://horrorwriter.org/my-stories/', '/my-stories/'],
  ['https://horrorwriter.org/?utm_source=chatgpt.com', '/'],
  ['https://horrorwriter.org/library/read/abc/#top', '/library/read/abc/'],
  ['not a url', 'unknown page'],
  [null, 'unknown page'],
])('pagePath(%s) → %s', (url, expected) => expect(pagePath(url)).toBe(expected))

test('normalizeMessage blanks ids and numbers so one bug is one group', () => {
  expect(normalizeMessage('Story 54a95155-7542-40d0-b3ca-15ef32de60b1 not found')).toBe('Story <id> not found')
  expect(normalizeMessage('Too many requests, retry in 37 seconds')).toBe('Too many requests, retry in <n> seconds')
  expect(normalizeMessage('Minified React error #418')).toBe('Minified React error #<n>')
  expect(normalizeMessage(null)).toBe('Unknown error')
})

test('the same failed request on two days by two members is one problem', () => {
  const problems = groupProblems([
    row({ id: 3, created_at: '2026-11-12T09:00:00Z', user_id: 'u2', user_agent: null, url: 'https://horrorwriter.org/publish/' }),
    row({ id: 2, created_at: '2026-11-11T11:00:00Z' }),
    row({ id: 1, created_at: '2026-11-11T10:00:00Z' }),
  ])
  expect(problems).toHaveLength(1)
  const p = problems[0]
  expect(p).toMatchObject({ kind: 'request', count: 3, signedOut: 0, action: 'series_books:insert', status: 409, code: '23505',
    firstSeen: '2026-11-11T10:00:00Z', lastSeen: '2026-11-12T09:00:00Z' })
  expect(p.memberIds.sort()).toEqual(['u1', 'u2'])
  expect(p.pages).toEqual([{ path: '/my-stories/', count: 2 }, { path: '/publish/', count: 1 }])
  expect(p.devices).toEqual([{ label: 'Android, Chrome', count: 2 }, { label: 'Unknown device', count: 1 }])
  expect(p.occurrences.map((r) => r.id)).toEqual([3, 2, 1])
})

test('signed-out rows are counted as occurrences, not members', () => {
  const [p] = groupProblems([row({ id: 1, user_id: null }), row({ id: 2, user_id: null })])
  expect(p).toMatchObject({ count: 2, signedOut: 2, memberIds: [] })
})

test('different causes are different problems, newest first', () => {
  const problems = groupProblems([
    row({ id: 1, created_at: '2026-11-10T00:00:00Z' }),
    row({ id: 2, created_at: '2026-11-12T00:00:00Z', kind: 'window', action: null, status: null, code: null, message: 'Minified React error #418' }),
    row({ id: 3, created_at: '2026-11-11T00:00:00Z', kind: 'shown', action: null, status: null, code: null, message: 'Message must be at least 25 characters.' }),
  ])
  expect(problems.map((p) => p.kind)).toEqual(['crash', 'shown', 'request'])
})

test('crashes with the same message group together whatever caught them', () => {
  const problems = groupProblems([
    row({ id: 1, kind: 'window', action: null, status: null, code: null, message: 'boom 12' }),
    row({ id: 2, kind: 'island', action: null, status: null, code: null, message: 'boom 99' }),
  ])
  expect(problems).toHaveLength(1)
  expect(problems[0].count).toBe(2)
})

test('filters by kind and by member', () => {
  const rows = [
    row({ id: 1, user_id: 'u1' }),
    row({ id: 2, user_id: 'u2', kind: 'shown', action: null, status: null, code: null, message: 'Nope' }),
  ]
  expect(groupProblems(rows, { kind: 'shown' }).map((p) => p.kind)).toEqual(['shown'])
  expect(groupProblems(rows, { userId: 'u1' }).map((p) => p.kind)).toEqual(['request'])
  expect(groupProblems(rows, { kind: 'crash' })).toEqual([])
})

test('occurrences are capped at 20, pages and devices at 3', () => {
  const rows = Array.from({ length: 30 }, (_, i) => row({ id: i, created_at: new Date(Date.UTC(2026, 10, 1, 0, i)).toISOString(), url: `https://horrorwriter.org/p${i % 5}/` }))
  const [p] = groupProblems(rows)
  expect(p.count).toBe(30)
  expect(p.occurrences).toHaveLength(20)
  expect(p.pages).toHaveLength(3)
})

test.each([
  [{ kind: 'request', action: 'series_books:insert', status: 409, code: '23505' }, "Couldn't add to series books (duplicate entry)"],
  [{ kind: 'request', action: 'books:update', status: 403, code: '42501' }, "Couldn't save books (not allowed)"],
  [{ kind: 'request', action: 'books:select', status: 500, code: null }, "Couldn't load books (server error)"],
  [{ kind: 'request', action: 'user_follows:delete', status: 0, code: null }, "Couldn't remove from user follows (network failure)"],
  [{ kind: 'request', action: 'rpc:create_thread_with_post', status: 300, code: 'PGRST203' }, "Couldn't run create thread with post (site bug: ambiguous function)"],
  [{ kind: 'request', action: 'auth:otp', status: 422, code: 'otp_disabled' }, 'Sign-in problem: otp (no account for that address)'],
  [{ kind: 'request', action: 'auth:token:pkce', status: 400, code: null }, 'Sign-in problem: token pkce'],
  [{ kind: 'request', action: 'fn:open-ticket', status: 429, code: null }, 'Function failed: open-ticket (rate limited)'],
  [{ kind: 'request', action: null, status: 502, code: null }, 'Request failed (server error)'],
  [{ kind: 'request', action: 'books:update', status: 400, code: 'HW013' }, "Couldn't save books (HW013)"],
])('title for %o', (over, expected) => {
  expect(groupProblems([row({ ...over, message: 'x' })])[0].title).toBe(expected)
})

test('crash and shown titles carry the message', () => {
  expect(groupProblems([row({ kind: 'window', action: null, status: null, code: null, message: 'Minified React error #418' })])[0].title)
    .toBe('Page crashed: Minified React error #418')
  expect(groupProblems([row({ kind: 'shown', action: null, status: null, code: null, message: 'Message must be at least 25 characters.' })])[0].title)
    .toBe('Message shown: Message must be at least 25 characters.')
})

test('summarize counts problems, distinct members and occurrences', () => {
  const problems = groupProblems([
    row({ id: 1, user_id: 'u1' }), row({ id: 2, user_id: 'u1' }),
    row({ id: 3, user_id: 'u2', kind: 'shown', action: null, status: null, code: null, message: 'Nope' }),
    row({ id: 4, user_id: null, kind: 'shown', action: null, status: null, code: null, message: 'Nope' }),
  ])
  expect(summarize(problems)).toEqual({ problems: 2, members: 2, occurrences: 4 })
  expect(summarize([])).toEqual({ problems: 0, members: 0, occurrences: 0 })
})
```

- [ ] **Step 2: Run** `npx vitest run src/lib/siteErrors.test.js`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement `src/lib/siteErrors.js`.** Decisions the tests do not spell out:
  - Grouping key: `request` → `request|action|status|code`; `crash` → `crash|normalizeMessage(message)`; `shown` → `shown|normalizeMessage(message)`.
  - `normalizeMessage`: uuids → `<id>`, then every run of digits → `<n>`; `null` or empty → `Unknown error`.
  - The problem's `message` is the newest row's raw message, cut to 300 characters. Crash and shown titles use the newest row's raw message, cut to 120.
  - Request title = verb phrase + optional ` (reason)`.
    - Verb phrase from `action`: `<table>:select` → `Couldn't load <table>`; `:insert` → `Couldn't add to <table>`; `:update` → `Couldn't save <table>`; `:delete` → `Couldn't remove from <table>`; `rpc:<name>` → `Couldn't run <name>`; `auth:<rest>` → `Sign-in problem: <rest>`; `fn:<name>` → `Function failed: <name>`; `storage:<verb>` → `File storage failed`; none → `Request failed`. Underscores become spaces in table and rpc names; colons become spaces in the `auth:` rest; function names keep their hyphens.
    - Reason: first match of, by `code`: `23505` duplicate entry · `23503` linked record missing · `42501` not allowed · `22P02` bad id · `PGRST203` site bug: ambiguous function · `PGRST301` session expired · `otp_disabled` no account for that address · `captcha_failed` captcha failed · any code containing `rate_limit` rate limited; then by `status`: `0` network failure · `401` not signed in · `403` not allowed · `429` rate limited · `500`–`599` server error. An unknown code is shown as itself. No code and no known status: no parentheses.
  - `describeDevice`: system first match of iPad, iPhone, Android, Windows, Mac (`Macintosh`), Linux; browser first match of Edge (`Edg/`), Samsung Internet (`SamsungBrowser/`), Firefox (`Firefox/` or `FxiOS/`), Chrome (`Chrome/` or `CriOS/`), Safari (`Safari/`). Either missing → `Unknown device`.

- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: group the error log into problems with plain titles`

### Task 2: Fetch the log for a window

**Files:**
- Create: `src/lib/siteErrorsApi.js`
- Test: `src/lib/siteErrorsApi.test.js`

**Interfaces:**
- Produces: `SITE_ERRORS_LIMIT = 2000`
- Produces: `fetchSiteErrors(hours: number, now?: number): Promise<{ rows: Row[], handles: Record<string, string>, capped: boolean }>`

- [ ] **Step 1: Write the failing tests.** Mock `../supabaseClient` the way `src/lib/errorReporter.test.js` does, with a small chainable builder whose terminal call resolves `{ data, error }` and which records the calls made on it. Tests:
  - `asks for the window, newest first, capped`: with `now = Date.UTC(2026, 10, 15)` and `hours = 24`, the `client_errors` query selects exactly `id, created_at, kind, message, stack, url, user_agent, user_id, action, status, code`, calls `gte('created_at', '2026-11-14T00:00:00.000Z')`, `order('created_at', { ascending: false })` and `limit(2000)`.
  - `looks up handles only for the members in the rows`: rows with `user_id` `u1`, `u1`, `null`, `u2` lead to one `profiles` query selecting exactly `id, handle` with `in('id', ['u1', 'u2'])`; the result's `handles` is `{ u1: 'writer', u2: 'reader' }`.
  - `makes no profiles query when no row has a member`.
  - `a member with no readable profile is simply absent from handles`: profiles returns only `u1`; `handles` is `{ u1: 'writer' }` and nothing throws.
  - `capped is true only when the limit came back full`: 2000 rows → `true`; 1999 → `false`.
  - `a failed log read throws its message`: `{ error: { message: 'denied' } }` → rejects with `denied`.
  - `a failed handle lookup still returns the rows`: profiles errors → resolves with `handles: {}`.
  - `throws when Supabase is not configured`: with `supabase` null → rejects with `Supabase not configured`.

- [ ] **Step 2: Run** `npx vitest run src/lib/siteErrorsApi.test.js`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement,** following `fetchAuditLog` in `src/lib/siteSettings.js` for shape and error style.
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: fetch the error log and member handles for a time window`

### Task 3: The tab

**Files:**
- Create: `src/components/admin/SiteErrorsTab.jsx`
- Test: `src/components/admin/SiteErrorsTab.test.jsx`

**Interfaces:**
- Consumes: everything Task 1 exports; `fetchSiteErrors`, `SITE_ERRORS_LIMIT` (Task 2); `UserModProfile` from `../mod/UserModProfile` (props `userId`, `onClose`).
- Produces: default export `SiteErrorsTab` (no props).

**What it shows** (follow `AuditTab.jsx` for classes, loading and error states):

```
[Last 7 days ▾] [All kinds ▾] [All members ▾]
3 problems · 2 members affected · 17 occurrences

▸ Couldn't add to series books (duplicate entry)        3×   Nov 11
  1 member · /my-stories/ · Android, Chrome
▸ Message shown: Message must be at least 25 characters. 2×   Nov 9
  2 signed out · /help/ · iPhone, Safari
▸ Page crashed: Minified React error #418               12×   Nov 5
  1 member, 11 signed out · / · Windows, Chrome
```

- Three `<select>`s with `aria-label`s `Time window`, `Kind`, `Member`. Window defaults to `7d`; changing it refetches (`queryKey: ['admin', 'site-errors', windowId]`). Kind and Member filter what is already loaded. The Member select lists `All members`, then each member in the loaded rows as `@handle` (or `a member` when the handle is unknown), sorted by handle.
- Summary line from `summarize`: `3 problems · 2 members affected · 17 occurrences`. Singulars: `1 problem`, `1 member affected`, `1 occurrence`.
- Each problem is a button (`aria-expanded`) showing title, `N×`, and last seen as a short date; under it one line: who (`1 member`, `2 members`, `3 signed out`, joined with `, `, zero parts omitted), the top page, the top device.
- Opened, a problem shows: first seen and last seen in full; every page and device with counts; for requests the raw `action`, `status`, `code` in mono; the full raw message; then its occurrences, each with time, who (a button `@handle` or `a member` that opens the case file, or the words `signed out`), page, device, and the stack inside a native `<details>` labelled `Stack trace` when there is one.
- Clicking a member replaces the tab's content with `← Back to Site Errors` and `<UserModProfile userId={id} onClose={back} />`, exactly as `UsersTab.jsx` does with its directory. Coming back keeps the chosen window and filters.
- Loading: `Reading the error log…`. Fetch error: `Could not load the error log: <message>` in a `card-error`.
- No rows at all in the window: `Nothing went wrong in this window.` Filters leaving nothing: `Nothing matches those filters.`
- When `capped`: a line `Showing the most recent 2000 entries in this window; older ones are not counted.`
- Long messages and stacks use `break-words` and `whitespace-pre-wrap`; nothing forces the card wider than its column.

- [ ] **Step 1: Write the failing tests.** Mock `../../lib/siteErrorsApi` (`fetchSiteErrors`, `SITE_ERRORS_LIMIT: 2000`) and `../mod/UserModProfile` (`({ userId, onClose }) => <div><p>case file {userId}</p><button onClick={onClose}>close</button></div>`), and render inside a `QueryClientProvider` as `UsersTab.test.jsx` does. Use rows shaped like Task 1's `row()`. Tests, by name:
  - `shows the summary and one line per problem, newest first`
  - `asks for 7 days first, and refetches when the window changes` (`fetchSiteErrors` called with `168`, then with `24` after choosing `Last 24 hours`)
  - `the kind filter narrows without refetching`
  - `the member filter lists the members in the log by handle, and narrows to one`
  - `opening a problem shows its pages, devices, raw action, status and code, and its occurrences`
  - `a stack trace is inside a closed details element`
  - `clicking a member opens their case file, and Back returns with the filters kept`
  - `a member with no readable profile reads "a member" and still opens the case file`
  - `a signed-out occurrence reads "signed out" and is not a button`
  - `an empty window says nothing went wrong`
  - `filters that leave nothing say so and stay usable`
  - `a capped fetch says how many entries are shown`
  - `a failed fetch shows the error`
  - `rows with no action, status, code, url, user agent or stack render without crashing` (asserts `Unknown device` and `unknown page` appear)
  - `a message containing markup is shown as text` (message `<img src=x onerror=alert(1)>`; assert the text is present and `document.querySelector('img')` is null)

- [ ] **Step 2: Run** `npx vitest run src/components/admin/SiteErrorsTab.test.jsx`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement the component.**
- [ ] **Step 4: Run again.** Expected: PASS, output pristine.
- [ ] **Step 5: Commit** `feat: Site Errors tab`

### Task 4: Register the tab, link from Pulse, open the PR

**Files:**
- Modify: `src/pages-react/Admin.jsx` (imports at the top; the `tabs` array at about line 62; the panel list at about line 150)
- Modify: `src/components/admin/PulsePanel.jsx` (the "Site errors" `Section`, about line 82)
- Test: `src/components/admin/PulsePanel.test.jsx`

- [ ] **Step 1: Add the failing Pulse test.** In the existing test that asserts `Open the work queue`, add: `expect(screen.getByRole('link', { name: 'Open Site Errors' })).toHaveAttribute('href', '/admin/?tab=errors')`. Add a second assertion in the test that renders Pulse with zero errors: the link is present there too.
- [ ] **Step 2: Run** `npx vitest run src/components/admin/PulsePanel.test.jsx`. Expected: FAIL (no such link).
- [ ] **Step 3: Implement.** In `PulsePanel.jsx` add `<a href="/admin/?tab=errors" className="underline">Open Site Errors</a>` at the foot of the "Site errors" section, shown whether or not there are errors. In `Admin.jsx` import `SiteErrorsTab`, add `{ id: 'errors', label: 'Site Errors', show: isKeeper }` after the `audit` entry, and render `{activeId === 'errors' && <SiteErrorsTab />}` after the `audit` line.
- [ ] **Step 4: Run** `npx vitest run src/components/admin/PulsePanel.test.jsx src/components/admin/SiteErrorsTab.test.jsx src/lib/siteErrors.test.js src/lib/siteErrorsApi.test.js`. Expected: PASS.
- [ ] **Step 5:** Read `tests/admin.spec.js`. If it lists the admin tabs by name or count, add `Site Errors`; if it opens every tab, add a mock for `client_errors` in `tests/mocks.js` in the style of its neighbours. If it does neither, leave it.
- [ ] **Step 6:** `npm run build`. Expected: completes with no error.
- [ ] **Step 7: Commit** `feat: Site Errors in Admin, linked from Pulse`, push, open the PR. Body: what the tab shows, that it needs no database change, the preview check below, and a request that Jeff run `npm run test:unit` and `cmd /c npx playwright test`.
- [ ] **Step 8: On the PR's Workers preview,** signed in as the Keeper (Jeff signs in on the preview):
  1. Admin shows seven tabs with Site Errors last; `/admin/?tab=errors` opens it directly and survives a refresh.
  2. With `Last 90 days` chosen, the homepage crash from October shows as one problem with its count, and the figures match `select count(*) from public.client_errors`.
  3. Open that problem: pages show as paths with no `?utm_source=…`; a stack trace opens on request.
  4. Click a member in an occurrence: their case file opens; Back returns to the same window.
  5. Overview → Pulse → `Open Site Errors` lands on the tab.
  6. Built-in browser, phone mode, 360px and 375px: no sideways scroll, every select and row at least 44px high, long messages wrap.
  7. Signed in as a non-keeper (or signed out): no Site Errors tab, and `/admin/?tab=errors` shows the disguised 404.
- [ ] **Step 9:** Report what was seen. After Jeff merges, confirm the live Admin shows the tab and add a Shipped line to the vault's `now.md`.
