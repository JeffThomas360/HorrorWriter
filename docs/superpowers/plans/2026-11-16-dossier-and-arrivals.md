# Dossier and arrival source (keeper insight, piece 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Keeper-only Dossier tab on each member's case file showing what happened after they joined, a one-line roll-up above the member list, and a record of how each new member found the site.

**Architecture:** One migration adds three private tables (arrival details, plus piece 4's two step tables so there is one rehearsal) and the functions that write and read them. The Dossier is worked out on demand by one Keeper-only function, `mod_user_dossier`, from tables that already exist. Arrival details wait in the visitor's own browser and are sent once, after they have an account. Two pull requests: the migration alone (3a), then the site code (3b).

**Tech Stack:** Postgres (Supabase), Astro 7, React islands, `@tanstack/react-query`, vitest (jsdom) with Testing Library, PowerShell rehearsal script.

**Spec:** `docs/superpowers/specs/2026-11-15-keeper-insight-design.md`: sections "The rule for what may be kept", "Anti-goals", "PR 3: Dossier and arrival source", "PR 4: Where people give up" (for the two tables and their functions only), "Privacy wording". Pieces 1 and 2 are merged (#156, #157, #159, #160).

## Global Constraints

- Never push `main`. Branch, commit, open a PR; Jeff merges. Merging a migration applies it to production.
- PR 3a carries only the migration, its SQL test, the grants allowlist and this plan. PR 3b starts from `main` after 3a is merged and verified.
- The migration is rehearsed in `begin; … rollback;` before its PR is opened: Jeff runs `& .\scripts\sql\rehearse.ps1 -Test <test.sql> -Migration <migration.sql>` and answers the production prompt. Never use MCP `apply_migration`.
- New functions: `security definer`, `set search_path = ''`, every object schema-qualified, `revoke all … from public`, explicit `grant execute`, and a row per grantee in `scripts/sql/verify-grants.sql`'s allowlist. Private helpers are revoked from `public, anon, authenticated`. The migration ends with `NOTIFY pgrst, 'reload schema';`.
- The three new tables have row-level security enabled and **no policies**, and all table privileges revoked from `anon` and `authenticated`: they are read and written only through functions.
- Keeper-only means `public.mod_can('configure', 'all')`, and a refusal raises with `errcode = '42501'` as `admin_export_writing` does.
- Never returned, shown or newly stored: an IP address, a location, an email address, anything a member read. `auth.sessions.ip` is never selected.
- Nothing is sent about a visitor who has no account. Arrival details stay in their browser's `localStorage` until they join.
- A page address is a path only: never a query string or hash. A referring site is a host name only: never its path.
- Days are UTC calendar days.
- `supabase` may be null. Hooks before early returns. Islands do not share React context; each `client:load` is its own root. An island renders nothing on the server and on its first client render if what it shows depends on `localStorage`.
- Nothing new runs in Playwright test mode: guard every new browser-side write with `isPlaywrightTest()` (`src/lib/testMode.js`).
- `profiles` has column-level grants: never `select('*')`.
- Text from members (their answer, error messages) is rendered as text only. No `dangerouslySetInnerHTML`.
- Reds: `--color-ember` for small or interactive things; `--color-blood` only for large type, borders, fills. Tap targets 44px; check 360px and 375px.
- No new npm dependency.
- Tests: run the test files a step names; run `npx vitest run` once before each PR. Jeff runs E2E; CI runs vitest.
- Commit messages end with `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`. PR bodies end with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

## Review Focus

1. A member who joined before this shipped (all 11 today): the Dossier renders every line, with "source not recorded" and no error. → Tasks 2, 6.
2. A member who has written nothing: every line still reads sensibly ("has not posted anything", "nothing to respond to"), no "NaN", no "Invalid Date". → Tasks 5, 6.
3. `record_arrival` and `record_found_via` called by someone they are not for (an old account, a signed-out visitor, a second time): nothing is written, nothing is raised. → Task 1.
4. An arrival record with hostile values (a `utm_source` of markup or 5,000 characters, a referrer of `javascript:`): cleaned or dropped in the browser and again in the database. → Tasks 1, 3.
5. A non-keeper moderator calling `mod_user_dossier` or `admin_member_funnel` directly: refused. The Dossier tab is not shown to them. → Tasks 2, 6.
6. `localStorage` blocked or throwing: no arrival is noted, no card shows, and nothing crashes. → Tasks 3, 4.
7. The card and the passkey prompt on the same page: the card waits. A member who skips the card on one device is not asked on another. → Tasks 1, 4.

## File Structure

| File | Responsibility |
|------|----------------|
| `supabase/migrations/20261117000000_member_dossier.sql` (create) | Three tables; arrival, step, dossier and funnel functions |
| `scripts/sql/test-dossier.sql` (create) | Behaviour test for the migration |
| `scripts/sql/verify-grants.sql` (modify) | Allowlist rows |
| `src/lib/arrival.js` (create) | Note and take the arrival record in `localStorage` (pure, browser-only) |
| `src/lib/arrivalApi.js` (create) | The three arrival RPC calls |
| `src/components/ArrivalPrompt.jsx` (create) | Island: sends the arrival once; shows "What brought you here?" |
| `src/layouts/MainLayout.astro` (modify) | Note the arrival on load; mount the island |
| `src/lib/dossier.js` (create) | Pure: turn the dossier JSON into the lines shown |
| `src/lib/dossierApi.js` (create) | `fetchUserDossier`, `fetchMemberFunnel` |
| `src/components/mod/UserDossier.jsx` (create) | The Dossier tab's content |
| `src/components/mod/UserModProfile.jsx` (modify) | Third tab, Keeper only; `initialTab` prop |
| `src/components/admin/UsersTab.jsx` (modify) | The roll-up line |
| `src/components/admin/SiteErrorsTab.jsx` (modify) | Open case files on the Dossier; accept a member from the URL |
| `src/pages/rules.astro` (modify) | One more privacy sentence |

---

# PR 3a: the migration

Branch: `feat/member-dossier-db` from `main` (this plan is committed on it).

### Task 1: Tables, and the functions that write to them

**Files:**
- Create: `supabase/migrations/20261117000000_member_dossier.sql`
- Create: `scripts/sql/test-dossier.sql`

**Interfaces (all `returns void` unless said; all silent no-ops, never raising, when the caller does not qualify):**
- `public.record_arrival(p_source_tag text, p_referrer_host text, p_landing_path text)` → `authenticated`
- `public.record_found_via(p_text text)` → `authenticated`
- `public.arrival_prompt_due() returns boolean` → `authenticated`
- `public.log_member_step(p_flow text, p_step text)` → `authenticated`
- `public.tally_step(p_flow text, p_step text)` → `anon`, `authenticated`
- private: `public.step_is_known(p_flow text, p_step text) returns boolean`

**Tables:**

```sql
create table public.member_arrivals (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  source_tag    text,
  referrer_host text,
  landing_path  text,
  found_via     text,
  asked_at      timestamptz,
  created_at    timestamptz not null default now()
);

create table public.member_steps (
  user_id uuid not null references auth.users(id) on delete cascade,
  flow    text not null,
  step    text not null,
  day     date not null default ((now() at time zone 'utc')::date),
  primary key (user_id, flow, step, day)
);

create table public.step_tallies (
  day  date not null,
  flow text not null,
  step text not null,
  n    integer not null default 0,
  primary key (day, flow, step)
);
```

**Rules the functions enforce:**

- The known steps (`step_is_known`): `join`: `opened`, `age_passed`, `method_chosen` · `publish`: `opened`, `started`, `submitted` · `ritual`: `opened`, `started`, `submitted` · `critique`: `started`, `submitted` · `post`: `opened`, `started`, `submitted` · `ticket`: `opened`, `submitted`.
- `record_arrival`: only for a caller whose `auth.users.created_at` is within the last 24 hours. Cleans before storing: `source_tag` lower-cased, cut to 64, kept only if it matches `^[a-z0-9._-]+$`; `referrer_host` lower-cased, cut to 100, kept only if it matches `^[a-z0-9.-]+$`; `landing_path` with `[?#].*$` removed, cut to 200, kept only if it starts with `/`. If the member has no row, insert one. If they have a row whose three arrival fields are all null (it was created by their answer), fill them. Otherwise change nothing: arrival is recorded once, ever.
- `record_found_via`: only for a caller whose account is within the last 7 days. Stores `nullif(btrim(left(p_text, 200)), '')` and `asked_at = now()`. Creates the row if there is none. Changes nothing if `asked_at` is already set: one answer, ever. An empty or null text is a Skip: `found_via` stays null, `asked_at` is still set.
- `arrival_prompt_due`: true only for a signed-in caller whose account is within the last 7 days and who has no row with `asked_at` set.
- `log_member_step`: only for a caller who exists in `auth.users`, and only a known step of a flow other than `join`. `insert … on conflict do nothing`. Then delete rows older than 90 days.
- `tally_step`: only flow `join` and its known steps. Does nothing once today's total across all rows has reached 5000. Otherwise upserts `n = n + 1` for today. Then deletes rows older than 90 days. **(Ruling: the spec says "capped per hour"; this table deliberately has no timestamps, so the cap is per day.)**

- [ ] **Step 1: Write the test file's frame and the Task 1 assertions.** Copy the header style, `begin;` / `rollback;` frame, and `pg_temp.must` / `pg_temp.be` helpers from `scripts/sql/test-submissions.sql`. First block raises `FAIL: the migration is not loaded` when `to_regprocedure('public.mod_user_dossier(uuid)')` is null. Actors, inserted into `auth.users` with explicit `created_at`: `new` (now), `week` (3 days ago), `old` (30 days ago), `keeper` (30 days ago; set `profiles.mod_role = 'keeper'`, `mod_scope = 'all'`), `warden` (30 days ago; `mod_role = 'warden'`, `mod_scope = 'all'`), `other` (30 days ago). Use ids ending `…c70xx`. Tag every text value the test writes with the prefix `hwtest-dossier: ` where the column allows free text. Last statement before `rollback;` is `select 'ALL PASS';`. Assertions:

| # | Do | Must be true |
|---|----|--------------|
| 1 | as `new`: `record_arrival('ChatGPT.com', 'Chat.OpenAI.com', '/library/?utm_source=x#top')` | row: `source_tag='chatgpt.com'`, `referrer_host='chat.openai.com'`, `landing_path='/library/'`, `asked_at is null` |
| 2 | as `new` again: `record_arrival('other', 'other.example', '/x/')` | row unchanged |
| 3 | as `week`: `record_arrival('late', 'late.example', '/')` | no row for `week` |
| 4 | as anon: `record_arrival('a', 'a.example', '/')` | no row added, nothing raised |
| 5 | as a second new account: `record_arrival('<script>', 'javascript:alert(1)', 'not-a-path')` | row exists with all three arrival fields null |
| 6 | as a third new account: `record_arrival(repeat('a', 500), repeat('b', 500), '/' || repeat('c', 500))` | `length(source_tag)=64`, `length(referrer_host)=100`, `length(landing_path)=200` |
| 7 | as `week`: `arrival_prompt_due()` | true |
| 8 | as `week`: `record_found_via('  hwtest-dossier: a friend told me  ')` | row created: `found_via='hwtest-dossier: a friend told me'`, `asked_at` set, arrival fields null |
| 9 | as `week`: `arrival_prompt_due()` | false |
| 10 | as `week` again: `record_found_via('hwtest-dossier: changed my mind')` | `found_via` unchanged |
| 11 | as `new`: `record_found_via('')` | `found_via is null`, `asked_at` set, arrival fields from #1 intact; then `arrival_prompt_due()` is false |
| 12 | as `old`: `arrival_prompt_due()` false; `record_found_via('hwtest-dossier: x')` | no row for `old` |
| 13 | as anon: `arrival_prompt_due()` | false, nothing raised |
| 14 | a fourth new account answers first, `record_found_via('hwtest-dossier: search')`, then `record_arrival('bing', 'www.bing.com', '/')` | one row with both the answer and the arrival fields |
| 15 | as `old`: `log_member_step('publish','opened')` twice | exactly one row, `day` = today UTC |
| 16 | as `old`: `log_member_step('publish','nonsense')`, `log_member_step('join','opened')`, `log_member_step(null, null)` | no row added, nothing raised |
| 17 | as anon: `log_member_step('publish','opened')` | no row added |
| 18 | as anon: `tally_step('join','opened')` three times | today's row for (`join`,`opened`) grew by exactly 3 |
| 19 | as anon: `tally_step('publish','opened')`, `tally_step('join','nonsense')` | nothing added |
| 20 | as admin set today's (`join`,`age_passed`) row to `n = 5000`; as anon `tally_step('join','opened')` | (`join`,`opened`) unchanged |
| 21 | as `old`: `select count(*)` from each of the three tables | each is 0 rows or raises `insufficient_privilege` |
| 22 | as admin: delete the `new` account from `auth.users` | its `member_arrivals` row is gone |

Compare counts before and after rather than assuming the tables are empty: production may hold real rows.

- [ ] **Step 2: Write the migration's first half,** in this order: the three tables with row-level security enabled and privileges revoked; `step_is_known`; the five functions; revokes and grants. Open the file with a comment block, in the style of `20261109000000_member_submissions.sql`, saying what each table is for and that nothing here is readable by a member.
- [ ] **Step 3: Re-read both files against the table above.** The SQL is not executed until Task 2's rehearsal; say so in the commit body.
- [ ] **Step 4: Commit** `feat(db): arrival and step tables with their write functions`

### Task 2: The functions that read

**Files:**
- Modify: `supabase/migrations/20261117000000_member_dossier.sql` (append, before `NOTIFY`)
- Modify: `scripts/sql/test-dossier.sql` (append, before `select 'ALL PASS'`)
- Modify: `scripts/sql/verify-grants.sql`

**Interfaces:**
- private: `public.member_responses_index() returns table (owner_id uuid, piece_type text, piece_id uuid, responder_id uuid, created_at timestamptz)`
- private: `public.member_seen_index() returns table (user_id uuid, day date)`
- `public.mod_user_dossier(p_user uuid) returns jsonb` → `authenticated`, Keeper only
- `public.admin_member_funnel() returns jsonb` → `authenticated`, Keeper only
- `public.admin_step_funnel(p_days integer default 30) returns jsonb` → `authenticated`, Keeper only

**Definitions:**

- **A response** (`member_responses_index`) is something live that someone else wrote on a member's work: a `book_comments` row on their story (`piece_type 'story'`, `piece_id` the story); a post whose `parent_post_id` is their Ritual entry (`'ritual'`, the entry's post id); any post by someone else in a forum thread they started, `threads.prompt_id is null` (`'thread'`, the thread id). `mod_status = 'live'` on the response; the responder is never the owner.
- **Seen** (`member_seen_index`) is the distinct set of UTC days from: `auth.users.created_at`; `auth.users.last_sign_in_at`; each `auth.sessions` row's `created_at`, `refreshed_at`, `updated_at` (nulls skipped); every `created_at` in `member_submissions_index()`. `auth.sessions.ip` is not selected.
- **A piece** is a submission of kind `story`, `thread` or `ritual`. Replies and critiques are not pieces.

**`mod_user_dossier(p_user)` returns exactly this shape** (keys always present; `null` where shown):

```json
{
  "joined_at": "…",
  "sign_in": { "providers": ["google"], "passkeys": 0 },
  "user_agents": ["…"],
  "arrival": { "source_tag": null, "referrer_host": null, "landing_path": null, "found_via": null, "asked_at": null },
  "first": { "kind": "story", "title": "…", "created_at": "…" },
  "wrote": { "story": 0, "thread": 0, "reply": 0, "ritual": 0, "critique": 0 },
  "responses": { "count": 0, "first_at": null },
  "first_piece": { "kind": "story", "title": "…", "created_at": "…", "first_response_at": null },
  "seen_days": ["2026-11-04"],
  "last": { "what": "story", "title": "…", "at": "…" },
  "errors": [],
  "error_count": 0,
  "tickets": { "total": 0, "open": 0 },
  "steps": []
}
```

- `joined_at`: `auth.users.created_at`. An unknown `p_user` returns `null` (the whole result).
- `sign_in.providers`: distinct `auth.identities.provider`, sorted. `passkeys`: count in `public.passkey_credentials`.
- `user_agents`: distinct non-null `auth.sessions.user_agent`, newest session first, at most 10.
- `arrival`: the member's `member_arrivals` row as that object, or `null` when they have no row.
- `first`: their earliest submission of any kind from `member_submissions_index()`, hidden and screening included; `title` is the story or thread title, else `null`. `null` when they have none.
- `wrote`: counts by kind; all five keys always present.
- `responses.count`: rows in `member_responses_index()` they own. `first_at`: the earliest, or `null`.
- `first_piece`: their earliest piece, with the earliest response to **that piece**, or `null` for `first_response_at`. `null` when they have no piece.
- `seen_days`: their days from `member_seen_index()`, ascending, as `YYYY-MM-DD` strings, at most 400 (the most recent).
- `last`: the later of (a) their latest submission, `what` = its kind, and (b) their latest `ritual_drafts` row for a prompt they have no entry in, `what` = `'draft'`, `at` = its `updated_at`, `title` null. `null` when neither exists.
- `errors`: their `client_errors` rows, newest first, at most 20, each `{ id, created_at, kind, message, action, status, code, url, user_agent }`. `error_count`: all of theirs.
- `tickets`: `total` and `open` (`status <> 'closed'`).
- `steps`: their `member_steps` rows as `{ flow, step, day }`, newest day first. Empty until piece 4 writes any.

**`admin_member_funnel()`** returns `{ "members": n, "wrote": n, "got_response": n, "came_back": n }` over every profile whose `mod_role` is not `'keeper'`: `wrote` = has at least one submission; `got_response` = owns at least one response; `came_back` = has a seen day later than the UTC day they joined.

**`admin_step_funnel(p_days)`** returns a JSON array of `{ flow, step, n }`, one per known step plus one `step: 'finished'` per flow, for the last `p_days` days (clamped to 1–90): `join` steps are sums from `step_tallies`; other flows' steps are distinct members from `member_steps`. `finished`: `join` = profiles created in the window; `publish` = distinct authors of `story` submissions; `ritual` = of `ritual`; `critique` = of `critique`; `post` = of `thread` or `reply`; `ticket` = distinct `tickets.user_id`, all by `created_at` in the window. Piece 4 displays it; this piece only ships it.

- [ ] **Step 1: Append the Task 2 assertions.** Content for the test, with explicit dates so order is certain (insert an opening post and its reply in separate statements, as `test-submissions.sql` explains): `old` has a story (10 days ago), a Ritual entry in a prompt thread (9 days ago), a forum thread (8 days ago), and a `ritual_drafts` row for a second prompt with no entry (2 days ago); `other` critiques the story (7 days ago), replies to the entry (6 days ago), posts in the thread (5 days ago), and has a hidden critique on the story (4 days ago); `old` also critiques a story of `other`'s. One `auth.sessions` row for `old` (`created_at` 20 days ago, `refreshed_at` 3 days ago, a Chrome user agent), one `auth.identities` row (`provider 'google'`), two `client_errors` rows, one open and one closed ticket, one `member_steps` row.

| # | Do | Must be true |
|---|----|--------------|
| 23 | as `keeper`: `mod_user_dossier(old)` | `wrote` = `{story:1, thread:1, reply:0, ritual:1, critique:1}` |
| 24 | same result | `responses.count = 3` (the hidden critique and `old`'s own critique elsewhere are not counted); `responses.first_at` = the critique 7 days ago |
| 25 | same | `first.kind='story'`; `first_piece.kind='story'` and its `first_response_at` = 7 days ago |
| 26 | same | `last.what='draft'` and `last.title is null` |
| 27 | same | `sign_in.providers = ["google"]`, `passkeys = 0`; `user_agents` has the one Chrome string |
| 28 | same | `seen_days` contains the days 30, 20, 10, 9, 8 and 3 days ago, ascending, no duplicates |
| 29 | same | `error_count = 2`, `errors` has 2 objects newest first; `tickets = {total:2, open:1}`; `steps` has 1 |
| 30 | same | `arrival is null`; the text of the whole result contains neither `@` followed by `example.test` nor the key `ip` |
| 31 | as `keeper`: `mod_user_dossier(week)` | `arrival.found_via` = the answer from #8; `first`, `first_piece`, `last` are null; all five `wrote` counts 0; `responses = {count:0, first_at:null}` |
| 32 | as `keeper`: `mod_user_dossier('00000000-0000-4000-8000-00000000dead')` | null |
| 33 | as `warden`, as `old`, as anon: `mod_user_dossier(old)` | each raises `42501` |
| 34 | as `keeper`: `admin_member_funnel()` before and after the test's content | `members`, `wrote`, `got_response`, `came_back` each grew by the test's own contribution: compute the expected deltas from the actors above and assert them; `keeper` is not counted |
| 35 | as `warden`: `admin_member_funnel()`, `admin_step_funnel()` | each raises `42501` |
| 36 | as `keeper`: `admin_step_funnel(30)` | an array; it has an object for (`join`,`opened`) whose `n` ≥ 3 (from #18), one for (`publish`,`opened`) whose `n` ≥ 1 (from #15), and a `finished` object for each of the six flows |
| 37 | as `keeper`: `admin_step_funnel(0)` and `admin_step_funnel(5000)` | neither raises |

For #34 take the funnel as admin-acting-as-`keeper` once before the test inserts its actors (move that capture to the top of the file, after the helpers) and once here.

- [ ] **Step 2: Append the five functions to the migration,** then their revokes and grants, then `NOTIFY pgrst, 'reload schema';` as the last line.
- [ ] **Step 3: Add allowlist rows** in `scripts/sql/verify-grants.sql`, in that file's format, with a comment line naming the migration:

```sql
  -- Member dossier, arrivals and steps (20261117000000).
  ('record_arrival',           'authenticated', 'own row, once, account under 24 h, values cleaned'),
  ('record_found_via',         'authenticated', 'own row, once, account under 7 days'),
  ('arrival_prompt_due',       'authenticated', 'own state only, boolean'),
  ('log_member_step',          'authenticated', 'own row, fixed step list, one per day'),
  ('tally_step',               'anon',          'join steps only, count without identity, daily cap'),
  ('tally_step',               'authenticated', 'join steps only, count without identity, daily cap'),
  ('mod_user_dossier',         'authenticated', 'keeper RPC, mod_can(configure, all)'),
  ('admin_member_funnel',      'authenticated', 'keeper RPC, mod_can(configure, all)'),
  ('admin_step_funnel',        'authenticated', 'keeper RPC, mod_can(configure, all)'),
```

- [ ] **Step 4: Rehearse.** Ask Jeff to run, and to answer the production prompt:

```powershell
& .\scripts\sql\rehearse.ps1 -Test scripts\sql\test-dossier.sql -Migration supabase\migrations\20261117000000_member_dossier.sql
```

Expected: final row `ALL PASS`. A `FAIL: …` names the broken assertion; fix and rerun.

- [ ] **Step 5: Commit** `feat(db): member dossier and funnel functions`, push, open PR 3a. Body: the three tables and what each holds, the eight callable functions and who may call each, that nothing calls them yet, the rehearsal result, and "after merge: `verify-grants.sql` must return zero rows".
- [ ] **Step 6: After Jeff merges,** run `npx supabase db query --remote --read-only -f scripts/sql/verify-grants.sql`. Expected: zero rows. Then, read-only, confirm the three tables and eight functions exist.

---

# PR 3b: the site code

Branch: `feat/member-dossier` from `main`, after PR 3a is merged and verified.

### Task 3: Note the arrival in the browser

**Files:**
- Create: `src/lib/arrival.js`
- Test: `src/lib/arrival.test.js`
- Modify: `src/layouts/MainLayout.astro` (the inline module script that calls `installErrorReporter()`, about line 139)

**Interfaces:**
- `ARRIVAL_KEY = 'hw:arrival'`
- `noteArrival(win = window, now = Date.now()): void`
- `readArrival(win = window, now = Date.now()): { tag: string | null, referrerHost: string | null, landingPath: string, at: number } | null`
- `clearArrival(win = window): void`

- [ ] **Step 1: Write the failing tests.** Build a fake `win` for each: `{ location: { pathname, search, hostname }, document: { referrer }, localStorage }`, with jsdom's real `localStorage` cleared in `beforeEach`. Tests, by name:
  - `notes the tag, the referring host and the landing path` (`search: '?utm_source=chatgpt.com&x=1'`, referrer `https://chat.openai.com/c/abc?q=secret`, pathname `/library/` → `{ tag: 'chatgpt.com', referrerHost: 'chat.openai.com', landingPath: '/library/', at: now }`)
  - `first touch wins: a second visit does not overwrite it`
  - `the referring host is empty for our own host, for Google's and Supabase's sign-in hosts, and when there is no referrer` (`horrorwriter.org` when `hostname` is `horrorwriter.org`; `accounts.google.com`; `abc.supabase.co`; `''`)
  - `nothing but the host is kept from the referrer` (the stored JSON contains neither `/c/abc` nor `secret`)
  - `a tag is lower-cased, cut to 64 characters, and dropped unless it is letters, digits, dot, dash or underscore` (`ChatGPT.com` → `chatgpt.com`; `<script>` → `null`; 200 `a`s → 64)
  - `a referrer that is not http or https is dropped` (`javascript:alert(1)`, `android-app://com.example`)
  - `the landing path never carries a query string or hash, and is cut to 200 characters`
  - `nothing is noted on the sign-in callback` (`pathname: '/auth/callback/'`)
  - `a record older than 30 days is forgotten, and reading it clears it`
  - `a record that is not JSON, or not the right shape, reads as none and is cleared`
  - `blocked storage means no record and no crash` (a `localStorage` whose `getItem` and `setItem` throw: `noteArrival`, `readArrival`, `clearArrival` all return without throwing; `readArrival` is `null`)
  - `nothing is noted in Playwright test mode` (mock `./testMode`)
- [ ] **Step 2: Run** `npx vitest run src/lib/arrival.test.js`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement.** Thirty days is `30 * 24 * 60 * 60 * 1000`.
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Call it from `MainLayout.astro`:** in the same inline module script as `installErrorReporter()`, import `noteArrival` and call it once.
- [ ] **Step 6: Commit** `feat: note how a visitor arrived, in their own browser`

### Task 4: Send it once, and ask

**Files:**
- Create: `src/lib/arrivalApi.js`, `src/components/ArrivalPrompt.jsx`
- Test: `src/lib/arrivalApi.test.js`, `src/components/ArrivalPrompt.test.jsx`
- Modify: `src/layouts/MainLayout.astro` (mount `<ArrivalPrompt client:load />` directly after `<PasskeyPrompt client:load />`)

**Interfaces:**
- Consumes: `readArrival`, `clearArrival` (Task 3); RPCs from Task 1; `useAuth()` (`user`, `profile`, `isLoading`); `passkeyPromptFor()` from `src/lib/passkeyPrompt.js`.
- `recordArrival({ tag, referrerHost, landingPath }): Promise<void>` → RPC `record_arrival` with `p_source_tag`, `p_referrer_host`, `p_landing_path`. Never throws.
- `fetchArrivalPromptDue(): Promise<boolean>` → RPC `arrival_prompt_due`. `false` on any error.
- `recordFoundVia(text: string): Promise<void>` → RPC `record_found_via` with `p_text`. Throws its message on error.
- All three do nothing (and `fetchArrivalPromptDue` returns `false`) when `supabase` is null or `isPlaywrightTest()` is true.
- `ArrivalPrompt` default export wrapped with `withProviders` (a **named** import from `./Providers`).

**Behaviour:**
- Renders nothing on the server, on its first client render, signed out, while auth is loading, and on any path starting `/auth/`.
- **Sending.** Once the profile is known: if the browser holds an arrival record, then when `profile.created_at` is within the last 24 hours call `recordArrival` and afterwards `clearArrival`; when the account is older, just `clearArrival`. Once per page load.
- **Asking.** If `profile.created_at` is within the last 7 days and `passkeyPromptFor()` is not this member's id, call `fetchArrivalPromptDue()`; when it is `true`, show the card. If the passkey prompt is waiting for this member, show nothing on this page load.
- **The card:** a `role="region"` labelled `What brought you here?`; that heading; the line `Optional. Only the Keeper sees your answer.`; a text input with `aria-label="What brought you here?"` and `maxLength={200}`; buttons `Send` and `Skip`. `Send` with empty text behaves as `Skip`. Both call `recordFoundVia` (Skip with `''`), then hide the card. While the call runs both buttons are disabled. If the call fails, the card stays and shows `That didn't save. Try again, or skip.`; pressing Skip after a failure hides the card anyway.
- Style it as `PasskeyPrompt.jsx` styles its panel, including its 44px buttons.

- [ ] **Step 1: Write the failing tests.** `arrivalApi.test.js`: each function calls the right RPC with the right parameter names; `recordArrival` swallows an RPC error; `fetchArrivalPromptDue` returns `false` on error and on a null client; `recordFoundVia` throws the message; none calls the RPC in Playwright test mode. `ArrivalPrompt.test.jsx` (mock `./AuthContext`, `./Providers` so `withProviders` is the identity, `../lib/arrivalApi`, `../lib/arrival`, `../lib/passkeyPrompt`), by name:
  - `renders nothing signed out, while loading, and on the sign-in callback`
  - `a new member's stored arrival is sent once and then cleared`
  - `an older account's stored arrival is cleared without being sent`
  - `with no stored arrival nothing is sent`
  - `a member of three days who is due is shown the card`
  - `a member of ten days is not asked, and the server is not consulted`
  - `the card waits while the passkey prompt is waiting for this member`
  - `Send saves the text and hides the card`
  - `Skip saves an empty answer and hides the card`
  - `Send with nothing typed is a skip`
  - `a failed save keeps the card and says so; Skip then closes it`
  - `the answer box takes at most 200 characters`
  - `not due means no card`
- [ ] **Step 2: Run** both test files. Expected: FAIL, modules not found.
- [ ] **Step 3: Implement** both modules and mount the island.
- [ ] **Step 4: Run again.** Expected: PASS, output pristine.
- [ ] **Step 5: Commit** `feat: send the arrival once on joining; ask what brought them`

### Task 5: Turn a dossier into lines

**Files:**
- Create: `src/lib/dossier.js`
- Test: `src/lib/dossier.test.js`

**Interfaces:**
- Consumes: `describeDevice`, `pagePath`, `groupProblems` from `src/lib/siteErrors.js`.
- `dossierLines(d: Dossier, now = Date.now()): Array<{ label: string, text: string, sub?: string }>` in this order of labels: `Arrived`, `First visit`, `Wrote`, `Got back`, `Gave`, `Came back`, `Stopped at`, `Trouble`.
- `Dossier` is the JSON from `mod_user_dossier` (Task 2).

**Wording** (dates are `Nov 4`, with the year added when it is not the current year; durations are the two largest units, `3 min 31 s`, `2 days 4 h`, `45 s`):

| Label | Text |
|-------|------|
| Arrived | `<date> · <sign-in> · <device>`. Sign-in: `Google sign-in`, `email sign-in`, joined with ` and `, plus ` · N passkey(s)` when any; `sign-in method unknown` when none. Device: `describeDevice` of the newest user agent; `device unknown` when there is none. |
| Arrived, `sub` | No arrival row, or a row with all three arrival fields null and no answer: `source not recorded`. Otherwise the parts that exist, joined with ` · `: `tagged <source_tag>`, `from <referrer_host>`, `landed on <landing_path>`, and the answer in curly quotes `“…”`. When they were asked and skipped (`asked_at` set, `found_via` null): `asked, did not say`. |
| First visit | `published a story <duration> after joining` · `started a thread …` · `posted a reply …` · `entered a Ritual …` · `wrote a critique …`. Nothing yet: `has not posted anything`. |
| Wrote | `1 story · 0 forum posts · 0 Ritual entries` (forum posts = threads + replies; singular and plural agree). |
| Got back | No piece: `nothing to respond to`. Piece with a response: `N response(s) · first one after <duration>` (the duration from `first_piece.created_at` to `first_piece.first_response_at`). Piece with none: `still waiting, N day(s)` (whole days since `first_piece.created_at`; `less than a day` for 0). Responses exist but none on the first piece: `N response(s) · first piece still waiting, N day(s)`. |
| Gave | `N critique(s)`. |
| Came back | `seen on N day(s)` then, when they have any response: ` · and since the first response` or ` · not since the first response`, by whether a seen day is later than the UTC day of `responses.first_at`. `sub`: `approximate: quiet visits can go uncounted`. |
| Stopped at | `published a story “<title>” on <date>`, `started a thread “<title>” on <date>`, `posted a reply on <date>`, `entered a Ritual on <date>`, `wrote a critique on <date>`, `started a Ritual draft on <date>, never posted it`. None: `nothing yet`. |
| Trouble | `N error(s) logged · N ticket(s)` plus ` (N open)` when any are open. No errors and no tickets: `none on record`. |

- [ ] **Step 1: Write the failing tests:** one per row of the table and per branch named in it, plus `a member who has done nothing reads sensibly on every line` (the Task 2 `week` shape: assert all eight texts, and that none contains `NaN`, `undefined`, `null` or `Invalid Date`) and `a null dossier gives no lines`. Use a `base()` builder for the JSON so each test changes one thing.
- [ ] **Step 2: Run** `npx vitest run src/lib/dossier.test.js`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: word a member's dossier`

### Task 6: The Dossier tab

**Files:**
- Create: `src/lib/dossierApi.js`, `src/components/mod/UserDossier.jsx`
- Test: `src/lib/dossierApi.test.js`, `src/components/mod/UserDossier.test.jsx`
- Modify: `src/components/mod/UserModProfile.jsx` (the `CASE_FILE_TABS` constant, the `tab` state, the tab panel), `src/components/mod/UserModProfile.test.jsx`

**Interfaces:**
- `fetchUserDossier(userId): Promise<Dossier | null>` → RPC `mod_user_dossier` with `p_user`. Throws its message on error.
- `fetchMemberFunnel(): Promise<{ members, wrote, got_response, came_back }>` → RPC `admin_member_funnel`. Throws on error.
- `UserDossier({ userId, handle })`.
- `UserModProfile` gains an optional prop `initialTab` (`'admin'` by default; `'dossier'` is honoured only for a Keeper).

**Behaviour:**
- `UserDossier` loads on mount, as `UserSubmissions.jsx` does (stale-guarded effect). Loading: `Compiling the dossier…`. Error: `Could not load the dossier: <message>`. A `null` result: `No such member.`
- It renders the eight lines from `dossierLines` as a definition list (`<dt>` label, `<dd>` text, the `sub` in a smaller muted line).
- Under Trouble: when `errors` is not empty, the member's errors grouped with `groupProblems` (each with its title, `N×`, last seen, top page and top device, as the Site Errors list shows them), and a link `See these in Site Errors` to `/admin/?tab=errors&member=<userId>`; when there are tickets, a link `Open the work queue` to `/admin/?tab=queue`.
- In `UserModProfile`, the tab list is `Administrative`, `Submissions`, and for a Keeper (`viewerProfile?.mod_role === 'keeper'`) `Dossier`. The Dossier content is not mounted until that tab is chosen.

- [ ] **Step 1: Write the failing tests.** `dossierApi.test.js`: right RPC and parameter for each; errors thrown; null client throws `Supabase not configured`. `UserDossier.test.jsx` (mock `../../lib/dossierApi`): `shows the eight lines in order`; `a member from before arrivals were recorded reads "source not recorded"`; `lists their errors as problems with a link to Site Errors for this member`; `no errors and no tickets shows no links`; `a failed load says so`; `an unknown member says so`; `a member's answer containing markup is shown as text`. In `UserModProfile.test.jsx` add: `a Keeper sees a Dossier tab, and nothing loads until it is chosen`; `a warden does not see the Dossier tab`; `initialTab="dossier" opens on the Dossier for a Keeper and is ignored for a warden`.
- [ ] **Step 2: Run** the three test files. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run again,** plus `src/components/mod/UserSubmissions.test.jsx`. Expected: PASS, pristine.
- [ ] **Step 5: Commit** `feat: Dossier tab on the case file`

### Task 7: The roll-up, and the two links between tabs

**Files:**
- Modify: `src/components/admin/UsersTab.jsx`, `src/components/admin/UsersTab.test.jsx`
- Modify: `src/components/admin/SiteErrorsTab.jsx`, `src/components/admin/SiteErrorsTab.test.jsx`

**Behaviour:**
- `UsersTab`: above the search box, one line from `fetchMemberFunnel()` (`useQuery`, key `['admin', 'member-funnel']`): `11 members · 3 wrote · 1 got a response · 2 came back` (singular `1 member`). While loading, nothing. If it fails, nothing: the directory is the point and must still show. It is fetched once with the tab, not per row.
- `SiteErrorsTab`: the case file it opens gets `initialTab="dossier"`. On first render it reads `member` from the URL's query string; when present, the member filter starts on that id and the window starts on `90d`. If that member has nothing in the window, the existing fallback to `All members` applies.

- [ ] **Step 1: Write the failing tests.** `UsersTab.test.jsx` (extend the `siteSettings` mock pattern with a `dossierApi` mock): `shows the roll-up above the directory`; `one member reads "1 member"`; `a failed roll-up leaves the directory showing`. `SiteErrorsTab.test.jsx`: `a member in the URL starts the filter on them and the window on 90 days` (`window.history.pushState({}, '', '/admin/?tab=errors&member=u2')`; restore the URL in `afterEach`); `the case file opens on the Dossier` (make the `UserModProfile` mock print its `initialTab`).
- [ ] **Step 2: Run** both files. Expected: FAIL on the new tests.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: member roll-up on Users; Site Errors and Dossier link to each other`

### Task 8: Privacy sentence, PR 3b, preview check

**Files:**
- Modify: `src/pages/rules.astro` (the privacy paragraph under `id="privacy"`)

- [ ] **Step 1:** In that paragraph, directly before the sentence beginning `All of it is created here`, insert exactly: `When you join, we note how you found us: the site that linked you here, if any, and your own answer if you choose to give one.` Change nothing else.
- [ ] **Step 2:** `npx vitest run` and `npm run build`. Expected: all pass; build completes.
- [ ] **Step 3: Commit** `feat: privacy section says how arrival is noted`, push, open PR 3b. Body: the Dossier's eight lines with one real example; the roll-up; how arrival is noted and when it is sent; the card's wording; the full privacy paragraph for Jeff to edit; what is never recorded; the preview check; a request that Jeff run `cmd /c npx playwright test`.
- [ ] **Step 4: On the PR's Workers preview,** Jeff signed in as Keeper:
  1. Admin → Users shows the roll-up line; its four numbers match `select public.admin_member_funnel()` run read-only (as it is Keeper-only, compare with the Dossier counts instead if the query is refused).
  2. Open @capt_yugoslavia: three tabs; Dossier shows eight lines; `Arrived` reads `source not recorded`; `Trouble` lists the October crash with a link that opens Site Errors filtered to them.
  3. Open a member who has posted nothing: every line reads sensibly.
  4. Site Errors → open a problem → click a member: the case file opens on the Dossier.
  5. In a private window, open the preview at `/?utm_source=preview-test`, join with a throwaway address Jeff controls, and land signed in: the card appears (after the passkey prompt has been answered, if it shows); answer it. As Keeper, that member's Dossier shows `tagged preview-test`, the landing page and the answer. Then delete the throwaway account and confirm its `member_arrivals` row is gone.
  6. Phone width, 360px and 375px: the card, the Dossier and the roll-up do not scroll sideways; buttons are 44px.
  7. Signed in as a non-keeper moderator, or none available: confirm by test only, and say so.
- [ ] **Step 5:** Report what was seen. After Jeff merges, confirm the live Admin shows the Dossier tab and add a Shipped line to the vault's `now.md`.
