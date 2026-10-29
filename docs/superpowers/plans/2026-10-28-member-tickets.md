# Member Tickets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Signed-in members open guarded tickets from a new `/help` page (FAQ first), tickets land only in Jeff's Work Queue with a Pushover alert, Jeff's replies are unmissable on the member side, locked-out members get back in by email link, and new confirmed signups push to Jeff.

**Architecture:** Two migrations: alerts (a Vault-backed `pg_net` dispatcher reused by storm, ticket and signup alerts, plus one `send-keeper-alert` Edge Function), then tickets (two tables, `security definer` RPCs holding every guard, a `ticket` keeper-task type, a daily auto-close cron). Cloudflare Turnstile is verified server-side by Supabase Auth captcha (email links) and by an `open-ticket` Edge Function (tickets). Client: a `tickets.js` API module, a Work Queue ticket card, a `help` content collection rendered by `/help` with an Open Ticket island, `/my-tickets`, a site-wide reply banner, a reworked email-link path in `SignInModal`.

**Tech Stack:** Astro 7 + React islands, TanStack Query, Supabase Postgres (RLS, pg_net, pg_cron, Vault), Deno Edge Functions, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-28-member-tickets-design.md`

## Global Constraints

- No AI anywhere in this feature. No model reads, scores, routes or writes ticket or FAQ text.
- Every word members read in FAQ answers is Jeff's. Claude writes questions + facts notes only (in `docs/`).
- Ticket guards live in the database RPCs. The client only mirrors them for friendly messages.
- No INSERT/UPDATE/DELETE policies on `tickets` / `ticket_messages`. Writes go only through RPCs.
- Push text never contains ticket text, email addresses, or anything beyond topic label, `@handle` and a count.
- Ticket alerts and signup alerts are Pushover priority `0`. Storm alerts keep priority `1`.
- A failed dispatch never fails or rolls back the triggering insert/update (wrap in `exception when others`, `raise warning`).
- Migrations: numbered, end with `notify pgrst, 'reload schema';`, no `commit`/`end`/`rollback` at top level. Rehearse with `powershell -File scripts/sql/rehearse.ps1 -Test <test.sql> -Migration <migration.sql>`. `scripts/sql/verify-grants.sql` returns zero rows after.
- New client-callable functions: `revoke all ... from public, anon;` + `grant execute ... to authenticated;`. Internal helpers: `revoke all ... from public, anon, authenticated;`.
- `profiles` has column-level grants. Client code uses `PROFILE_COLUMNS` or explicit columns, never `select('*')` on profiles.
- Islands: hooks before early returns; `withProviders` is a named import; guard `supabase` null; cross-island state via persisted flags, never live CustomEvents alone.
- Reds: `--color-ember` for small/interactive, `--color-blood` only for large type, borders and fills. `#991B1B` is banned.
- Jeff runs test suites. Each "run" step below gives the command for him; the implementer runs `npm run test:unit` locally where it can.
- Topic slugs and labels (exact): `signing-in` Signing in · `my-writing` My writing · `rituals` Rituals · `another-member` Another member · `broken` Something's broken · `other` Other.
- Turnstile is checked on the server every time: Supabase Auth captcha for `signInWithOtp`, and the `open-ticket` Edge Function for tickets. `open_ticket` is executable by `service_role` only. If Turnstile fails, show exactly: `We couldn't confirm you're a person. Refresh the page and try again.`
- Turnstile site key comes from `import.meta.env.VITE_TURNSTILE_SITE_KEY`. Under `isPlaywrightTest()` or with no key set, use Cloudflare's always-pass test key `1x00000000000000000000AA`.

## Review Focus

1. **Two tabs, one ticket:** Jeff replies from one tab while a stale tab still shows Reply. The second call must fail `closed`/`not_waiting` cleanly and refresh, never double-post. *(Task 2 rehearsal + Task 4 test.)*
2. **A member closes the browser mid-flow** and comes back after Jeff answered: the banner must still show on the next page load (state comes from the DB, not a live event). *(Task 7 test.)*
3. **Whitespace/emoji padding to dodge length and dedupe guards:** `'   x   '` must count as 1 char; the same text with different surrounding whitespace must hit `duplicate`. *(Task 2 rehearsal.)*
4. **Signup alert ordering:** the alert trigger must fire after `handle_new_user` has created the profile, or `@handle` is missing. *(Task 1 rehearsal.)*
5. **Account deleted with open tickets:** tickets cascade away and their keeper tasks must not leave dangling cards that crash the Work Queue. *(Task 4 test: ticket card with missing ticket renders "This ticket no longer exists" + Dismiss.)*
6. **Captcha switched on breaks a sign-in path:** with Supabase Auth captcha on, passkey and Google sign-in must still work, and the email link must work only with a token. *(Delivery live check, after Jeff enables captcha.)*
7. **Turnstile token reused or expired** (the member leaves the form open past 5 minutes): the Edge Function refuses it, and the widget resets so a second Send gets a fresh token. *(Task 3b tests.)*

---

### Task 1: Vault-backed alert dispatch, storm fix, signup alerts

**Files:**
- Create: `supabase/migrations/20261028000000_keeper_alerts.sql`
- Create: `supabase/functions/send-keeper-alert/index.ts`
- Create: `supabase/functions/_shared/keeperAlert.ts` (pure message builder, no Deno imports)
- Create: `supabase/functions/_shared/keeperAlert.test.ts`
- Create: `scripts/sql/test-keeper-alerts.sql`

**Interfaces:**
- Produces (SQL): `public.keeper_dispatch(p_function text, p_body jsonb) returns void`. Internal, `security definer`, `set search_path = ''`. It reads `vault.decrypted_secrets` names **`hw_project_url`** and **`hw_service_role_key`**. If either is missing it does `raise warning` and returns. Otherwise it calls `net.http_post(url := <project_url> || '/functions/v1/' || p_function, headers := {Content-Type, Authorization: Bearer <key>}, body := p_body)`. All of it sits inside `begin … exception when others then raise warning … end`.
- Produces (Edge): `POST /functions/v1/send-keeper-alert` with body `{ kind: 'ticket_new'|'ticket_reply'|'signup'|'signup_surge', topic?: string, handle?: string, count?: number }`. It rejects with 401 unless `bearerMatches(Authorization, SUPABASE_SERVICE_ROLE_KEY)`.
- Produces (TS): `buildKeeperAlert(input) => { title: string, message: string, url: string, url_title: string } | null`. It returns null for an unknown kind, a handle not matching `^[a-z0-9._-]{1,40}$`, or a topic not in the six slugs.

- [ ] **Step 1: Write failing tests in `keeperAlert.test.ts`** (vitest, same style as `typesafe.test.ts`):
  - `ticket_new` + topic `signing-in` + handle `ash-1a2b` → title `New ticket`, message `Signing in — @ash-1a2b`, url `https://horrorwriter.org/admin/?tab=queue`.
  - `ticket_reply` + handle → title `Reply on ticket`, message `@ash-1a2b replied`.
  - `signup` + handle → title `New member`, message `@ash-1a2b joined`, url `https://horrorwriter.org/admin/?tab=users`.
  - `signup` without handle → message `A new member joined`.
  - `signup_surge` + count 11 → title `Signup surge`, message `11 new accounts in the last hour`.
  - handle `<b>x</b>` → `null`; topic `nope` → `null`; kind `x` → `null`.
- [ ] **Step 2: Run** `npm run test:unit -- supabase/functions/_shared/keeperAlert.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement `buildKeeperAlert`** with the exact strings above.
- [ ] **Step 4: Implement `send-keeper-alert/index.ts`** using the shape of `send-storm-alert`. It does a bearer check, calls `buildKeeperAlert` (400 on null), then POSTs to Pushover with `PUSHOVER_APP_TOKEN` / `PUSHOVER_USER_KEY` and `priority: '0'`. No email.
- [ ] **Step 5: Run the unit test.** Expected: PASS.
- [ ] **Step 6: Write the migration:**
  - `keeper_dispatch` as above, then `revoke all … from public, anon, authenticated`.
  - `create or replace function public.check_for_storm(...)`: copy the body from `20260908010000_reapply_p1a_safety.sql:401-477` unchanged, except that the dispatch `begin … end` block becomes `perform public.keeper_dispatch('send-storm-alert', jsonb_build_object('targetType', …, 'targetId', …, 'reportCount', …, 'replyCount', …));`. Keep its `set search_path = public` and its grants as they are.
  - `public.notify_new_signup() returns trigger`, `security definer`, `set search_path = ''`. When `new.email_confirmed_at is not null and (tg_op = 'INSERT' or old.email_confirmed_at is null)`, it counts `auth.users` with `email_confirmed_at > now() - interval '1 hour'` into `n`. If `n <= 10`, it dispatches `{kind:'signup', handle:<profiles.handle>}`. If `n = 11`, it dispatches `{kind:'signup_surge', count:11}`. Otherwise nothing. The whole body is wrapped in `exception when others then raise warning`, and it returns `new`.
  - Trigger **`on_auth_user_signup_alert`** (name sorts after `on_auth_user_created`, so the profile exists): `after insert or update of email_confirmed_at on auth.users for each row execute function public.notify_new_signup();`. Revoke the function from `public, anon, authenticated`.
  - `notify pgrst, 'reload schema';`
- [ ] **Step 7: Write `scripts/sql/test-keeper-alerts.sql`** (`begin;` … `rollback;`, `do` blocks raise on failure):
  - `keeper_dispatch('send-keeper-alert', '{}')` with no Vault secrets completes without error.
  - Insert a fake `auth.users` row with `email_confirmed_at = now()`. Assert no error, and that its `profiles` row exists.
  - An `update auth.users set email_confirmed_at = now()` on an unconfirmed fake user completes.
  - `has_function_privilege('authenticated', 'public.keeper_dispatch(text, jsonb)', 'execute')` is false.
- [ ] **Step 8: Rehearse.** Run `powershell -File scripts/sql/rehearse.ps1 -Test scripts/sql/test-keeper-alerts.sql -Migration supabase/migrations/20261028000000_keeper_alerts.sql`. Expected: completes, warnings only, no `ERROR`.
- [ ] **Step 9: Commit:** `feat(alerts): Vault-backed keeper dispatch; storm alerts actually send; Pushover on new signups`

---

### Task 2: Tickets schema, RPCs and guards

**Files:**
- Create: `supabase/migrations/20261028010000_tickets.sql`
- Create: `scripts/sql/test-tickets.sql`

**Interfaces:**
- Consumes: `public.keeper_dispatch` (Task 1), `public.create_keeper_task`, `public.keeper_task_require_keeper`, `public.mod_can`.
- Produces tables:
  - `tickets(id uuid pk, user_id uuid not null → profiles on delete cascade, topic text check in six slugs, subject text check char_length 1..120, status text check in ('waiting','answered','closed') default 'waiting', close_reason text check in ('resolved','dismissed','inactive') null, member_seen_at timestamptz, created_at, updated_at, closed_at; check ((status='closed') = (closed_at is not null)))`
  - `ticket_messages(id uuid pk, ticket_id → tickets on delete cascade, author_id → profiles on delete set null, from_keeper boolean not null, body text check char_length 1..2000, created_at)`. Index `(ticket_id, created_at)`, plus an index on `tickets (user_id, created_at)`.
- RLS select: the owner (`user_id = auth.uid()`; messages via an exists on the parent ticket) or `mod_can('configure','all')`. Grant `select` only to `authenticated`.
- Produces RPCs (errors raised as `raise exception '<key>'`, client maps by message):
  - `open_ticket(p_user_id uuid, p_topic text, p_subject text, p_body text) returns uuid`: **`service_role` only**. Called by the `open-ticket` Edge Function (Task 3b) after the Turnstile check. Use `p_user_id` wherever the other RPCs use `auth.uid()`.
  - `reply_ticket(p_ticket uuid, p_body text) returns uuid` (member)
  - `mark_ticket_seen(p_ticket uuid) returns void` (member, own only)
  - `keeper_reply_ticket(p_ticket uuid, p_body text) returns uuid`
  - `keeper_close_ticket(p_ticket uuid, p_reason text, p_note text default null) returns void` (`p_reason` in `resolved|dismissed`)
  - internal `close_inactive_tickets() returns integer`, scheduled `cron.schedule('close-inactive-tickets', '17 4 * * *', 'select public.close_inactive_tickets()')`
- Error keys: `not_signed_in, too_new, banned, too_many_open, daily_limit, message_limit, bad_topic, bad_subject, bad_body, duplicate, not_found, closed, not_allowed, bad_reason`.

Guard rules (exact). Text is normalised as `btrim(regexp_replace(x, '\s+', ' ', 'g'))` before length and dedupe checks:
- `open_ticket`: `p_user_id` null or no such profile → `not_signed_in`. Profile `created_at > now() - 1 hour` → `too_new`. `banned_until > now()` → `banned`. Topic not in the slugs → `bad_topic`. Subject 5..120 → else `bad_subject`. Body 20..2000 → else `bad_body`. Open (non-closed) tickets ≥ 3 → `too_many_open`. Tickets created in the last 24 h ≥ 3 → `daily_limit`. Member messages in the last 24 h ≥ 10 → `message_limit`. Same normalised body from this user in the last 24 h → `duplicate`.
  - On success it inserts the ticket and first message and calls `create_keeper_task('ticket', 'ticket:'||ticket_id||':'||message_id, 'ticket', ticket_id, jsonb_build_object('topic', topic, 'subject', subject, 'handle', handle), 0)`, then `keeper_dispatch('send-keeper-alert', {kind:'ticket_new', topic, handle})`.
- `reply_ticket`: same identity, ban and body/limit/duplicate rules. The ticket must be owned (`not_found`) and not closed (`closed`).
  - If the status was `answered`, it sets `waiting`, creates a fresh keeper task (dedupe `ticket:<id>:<message id>`) and dispatches `ticket_reply`. If it was already `waiting`, it only adds the message (no push).
- `keeper_reply_ticket`: requires the keeper and a non-closed ticket (`closed`). It inserts a `from_keeper` message, sets status `answered` and `member_seen_at = null`, resolves every open keeper task for that ticket (`status='resolved', resolution='replied', resolved_by=auth.uid()`), inserts `notifications(user_id, kind 'ticket_reply', title 'The Keeper answered your ticket', body <subject>)`, and logs `mod_actions` action `ticket_replied` with `target_user_id`.
- `keeper_close_ticket`: requires the keeper and a non-closed ticket. An optional note is inserted as a `from_keeper` message with a notification (`title 'Your ticket was closed'`). It sets status `closed`, `close_reason`, `closed_at`, resolves or dismisses the open tasks (`resolution = p_reason`), and logs `ticket_closed`.
- `close_inactive_tickets`: closes `answered` tickets whose latest message is older than 14 days (`close_reason 'inactive'`).
- `keeper_task_apply_action`: `create or replace` it with an added `when 'ticket' then raise exception 'use_ticket_actions' using errcode = 'HW012';`, so generic resolve can never desync a ticket. Keep the `manual` branch verbatim.
- Data move: for each `reports` row with `target_type='site' and status='open' and reporter_id is not null`, insert a ticket (topic `broken`, subject `Support request`, created_at = report's), a first message `coalesce(nullif(btrim(details),''), '(no details given)')` and a keeper task. Then `update reports set status='actioned', resolved_at=now(), resolution='moved to tickets'` for those rows. No pushes.

- [ ] **Step 1: Write `scripts/sql/test-tickets.sql`** in the `rehearse-keeper-tasks.sql` style. Pick an existing non-keeper profile older than 1 h and the keeper, then act via `set_config('request.jwt.claims', …)` + `set local role authenticated`. Each assertion is a `do` block:
  - `open_ticket` (called after `reset role`, passing the member's id) happy path returns an id; exactly 1 open keeper task of type `ticket` targets it.
  - `has_function_privilege('authenticated', 'public.open_ticket(uuid, text, text, text)', 'execute')` is false.
  - Each guard raises its key: subject `'    x    '` → `bad_subject`; a 19-char body → `bad_body`; topic `'admin'` → `bad_topic`; a 4th open ticket → `too_many_open`; the same body with extra inner spaces → `duplicate`.
  - A profile with `created_at = now()` → `too_new`; a profile with `banned_until = now() + 1 day` → `banned` (set via `reset role` first).
  - `keeper_reply_ticket` → status `answered`, 0 open tasks, 1 `ticket_reply` notification for the member.
  - A second `keeper_reply_ticket` from a "stale tab" still succeeds while the ticket is not closed (the reply is appended). Then `keeper_close_ticket` once, and a second close → `closed`.
  - The member's `reply_ticket` on an answered ticket → status `waiting` and a new open task with a different id. `reply_ticket` on a closed ticket → `closed`.
  - Another member calling `reply_ticket` / `mark_ticket_seen` on it → `not_found`. Another member selecting from `tickets` sees 0 of it.
  - `resolve_keeper_task(<ticket task>, 'done')` as keeper → `HW012`.
  - A direct `insert into tickets` as authenticated → permission error.
  - `close_inactive_tickets()` after backdating the messages 15 days → closes it with `inactive`.
  - Open `reports` site rows count = 0 after migration.
  - Ends `rollback;`.
- [ ] **Step 2: Rehearse.** Run it against the empty file to see it fail: `powershell -File scripts/sql/rehearse.ps1 -Test scripts/sql/test-tickets.sql -Migration supabase/migrations/20261028010000_tickets.sql` (with only a comment line in the migration). Expected: FAIL (`open_ticket` does not exist).
- [ ] **Step 3: Write the migration** to the interfaces and rules above. Grants: `open_ticket` → `service_role` only (revoked from `public, anon, authenticated`); the four other client RPCs → `authenticated`; `close_inactive_tickets` revoked from all; `keeper_task_apply_action` keeps its revoke.
- [ ] **Step 4: Rehearse.** Expected: completes with no `ERROR`. Then run `npx supabase db query --linked -f scripts/sql/verify-grants.sql` (still against the current prod schema, as a baseline). Expected: zero rows.
- [ ] **Step 5: Commit:** `feat(tickets): tickets schema, guarded RPCs, ticket keeper tasks, Support tickets moved over`

---

### Task 3: Client tickets API

**Files:**
- Create: `src/lib/tickets.js`, `src/lib/tickets.test.js`

**Interfaces:**
- Produces:
  - `TOPICS: Array<{ id: string, label: string }>` (the six, in order)
  - `topicLabel(id) => string`
  - `ticketErrorMessage(error) => string`
  - `memberStatus(ticket) => 'Waiting' | 'Answered' | 'Closed'`
  - `closedLabel(ticket) => string | null`: `inactive` → `Closed — no reply for 14 days`, `resolved` → `Closed — resolved`, `dismissed` → `Closed`
  - `openTicket({ topic, subject, body, captchaToken }) => Promise<string>`: calls `supabase.functions.invoke('open-ticket', { body: { topic, subject, body, captchaToken } })`. A `{ error: '<key>' }` response is thrown through `ticketErrorMessage`.
  - `replyTicket(id, body) => Promise<string>`
  - `markTicketSeen(id) => Promise<void>`
  - `fetchMyTickets() => Promise<Ticket[]>` (each with `messages` sorted ascending)
  - `fetchUnseenAnswered() => Promise<{ id: string, subject: string } | null>`
  - `fetchTicket(id) => Promise<Ticket | null>`
  - `keeperReplyTicket(id, body) => Promise<string>`
  - `keeperCloseTicket(id, reason, note?) => Promise<void>`
  - `TICKETS_KEY = ['tickets']`
  - `Ticket = { id, topic, subject, status, close_reason, member_seen_at, created_at, updated_at, messages: Array<{ id, from_keeper, body, created_at }> }`
- Pattern: copy `keeperTaskApi.js` (`need()`, `call()`, `MESSAGES` map).

- [ ] **Step 1: Failing tests:**
  - `ticketErrorMessage({message:'daily_limit'})` === `"You've opened 3 tickets today. Try again tomorrow."`
  - `too_many_open` → `'You have 3 open tickets. Wait for an answer or close one first.'`
  - `too_new` → `'New accounts can open a ticket after their first hour.'`
  - `banned` → `'Your account is suspended. Use the appeal on your profile instead.'`
  - `message_limit` → `"You've sent 10 messages today. Try again tomorrow."`
  - `duplicate` → `'You already sent that message today.'`
  - `bad_body` → `'Write between 20 and 2,000 characters.'`
  - `bad_subject` → `'A subject needs 5 to 120 characters.'`
  - `closed` → `'This ticket is closed.'`
  - `captcha_failed` → `"We couldn't confirm you're a person. Refresh the page and try again."`
  - an unknown message passes through
  - `memberStatus` for each status
  - `closedLabel` for each reason
  - `TOPICS.map(t=>t.id)` equals the six slugs
  - `openTicket` calls `functions.invoke('open-ticket', { body: { topic, subject, body, captchaToken } })`; a `{ error: 'daily_limit' }` response rejects with the daily-limit sentence (mock `../supabaseClient` as in `SignInModal.test.jsx`)
- [ ] **Step 2: Run** `npm run test:unit -- src/lib/tickets.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.** The reads select explicit columns from `tickets` with `ticket_messages(id, from_keeper, body, created_at)`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat(tickets): client API and member-facing error copy`

---

### Task 3b: Turnstile widget, open-ticket Edge Function, CSP

**Files:**
- Create: `src/lib/turnstile.js`, `src/lib/turnstile.test.js`
- Create: `src/components/Turnstile.jsx`, `src/components/Turnstile.test.jsx`
- Create: `supabase/functions/_shared/turnstile.ts`, `supabase/functions/_shared/turnstile.test.ts`
- Create: `supabase/functions/open-ticket/index.ts`
- Modify: `public/_headers:7` (CSP)
- Modify: `.env.example` (add `VITE_TURNSTILE_SITE_KEY=`)

**Interfaces:**
- Consumes: `open_ticket(p_user_id, …)` (Task 2).
- Produces (client):
  - `turnstileSiteKey() => string` (env key, or the test key under `isPlaywrightTest()` / no key)
  - `loadTurnstile() => Promise<window.turnstile>` (injects `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit` once, memoised)
  - `<Turnstile action={string} onToken={(t: string|null) => void} resetKey={any} />`: renders the widget with `size: 'flexible'` and `theme: 'dark'`; calls `onToken(null)` on expire or error; re-renders the widget when `resetKey` changes
- Produces (Edge):
  - `verifyTurnstile({ secret, token, ip, expectedAction, fetchFn? }) => Promise<boolean>`: POSTs form data to `https://challenges.cloudflare.com/turnstile/v0/siteverify`; true only when `success === true` and `action === expectedAction`; false on a network error
  - `POST /functions/v1/open-ticket` with `{ topic, subject, body, captchaToken }`:
    - 401 `{ error: 'not_signed_in' }` without a valid user JWT (`userClient.auth.getUser()`, as in `delete-account`)
    - 403 `{ error: 'captcha_failed' }` when `verifyTurnstile` (expected action `open_ticket`, IP from `CF-Connecting-IP`) is false
    - otherwise the admin client calls `rpc('open_ticket', { p_user_id: user.id, … })`: 400 `{ error: <db message key> }`, or 200 `{ id }`

- [ ] **Step 1: Failing tests:**
  - `turnstile.test.ts`: success + matching action → true; `success: false` → false; action `login` when `open_ticket` was expected → false; `fetchFn` throws → false; the body sent contains `secret`, `response` and `remoteip`.
  - `turnstile.test.js`: no env key → `1x00000000000000000000AA`; `loadTurnstile()` twice → one `<script>` tag.
  - `Turnstile.test.jsx` (mock `loadTurnstile` with a fake `render` that captures callbacks): the `callback` → `onToken('tok')`; `expired-callback` → `onToken(null)`; a changed `resetKey` calls `turnstile.reset`.
- [ ] **Step 2: Run** `npm run test:unit -- src/lib/turnstile.test.js src/components/Turnstile.test.jsx supabase/functions/_shared/turnstile.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - The Edge Function follows the `delete-account` shape: CORS headers, a user client from the request's Authorization header, and an admin client from `SUPABASE_SERVICE_ROLE_KEY`.
  - `TURNSTILE_SECRET_KEY` unset → 403 `captcha_failed` (fail closed) and `console.error`.
  - CSP: add `https://challenges.cloudflare.com` to `script-src` (keep `'unsafe-inline'` and the insights host), and add `frame-src https://challenges.cloudflare.com;`.
- [ ] **Step 4: Run.** Expected: PASS. Then run `grep -n "challenges.cloudflare.com" public/_headers`. Expected: it appears in both `script-src` and `frame-src`.
- [ ] **Step 5: Commit:** `feat(bots): Turnstile widget, server-verified open-ticket function, CSP for challenges.cloudflare.com`

---

### Task 4: Work Queue ticket cards

**Files:**
- Modify: `src/lib/keeperTasks.js` (add a `ticket` entry: label `Ticket`, `describe: t => t.payload?.subject`, `detail: t => topicLabel(t.payload?.topic) + ' — @' + t.payload?.handle`, `actions: []`)
- Create: `src/components/admin/TicketCard.jsx`, `src/components/admin/TicketCard.test.jsx`
- Modify: `src/components/admin/WorkQueueTab.jsx` (render `TicketCard` for `type === 'ticket'`; add a topic `<select aria-label="Filter by topic">`, shown when the type filter is `ticket` or `all`; filtering uses `payload.topic`)
- Modify: `src/components/admin/WorkQueueTab.test.jsx`

**Interfaces:**
- Consumes: `fetchTicket`, `keeperReplyTicket`, `keeperCloseTicket`, `topicLabel` (Task 3); `TASKS_KEY`.
- Produces: `<TicketCard task={task} onChanged={() => void} />`.

- [ ] **Step 1: Failing tests (`TicketCard.test.jsx`):**
  - Shows the subject, topic label and `@handle`, plus the conversation (member and Keeper messages labelled "Member" / "You").
  - **Reply** opens a textarea; sending calls `keeperReplyTicket(ticketId, text)`, then `onChanged`.
  - **Resolve** opens a note box (optional) → `keeperCloseTicket(id, 'resolved', note|null)`. **Dismiss** → `keeperCloseTicket(id, 'dismissed', null)`.
  - When `keeperReplyTicket` rejects with `'This ticket is closed.'`, the error toast shows and `onChanged` is called (refresh).
  - When `fetchTicket` resolves `null`, it shows `This ticket no longer exists.` with a **Dismiss** button that calls `resolveTask(task.id, 'dismiss')`. For that, add `'dismiss'` handling for orphan ticket tasks: in Task 2's `keeper_task_apply_action` `ticket` branch, allow `p_action = 'dismiss'` only when no `tickets` row with `id = p_task.target_id` exists (return `'dismissed'`), and raise `use_ticket_actions` otherwise. Add that case to `test-tickets.sql`.
  - `WorkQueueTab.test.jsx`: with one `manual` and one `ticket` task, the topic filter set to `rituals` hides a `signing-in` ticket and keeps the to-do.
- [ ] **Step 2: Run** `npm run test:unit -- src/components/admin`. Expected: FAIL.
- [ ] **Step 3: Implement.** Style it like `TaskCard` (same `btn`/`FIELD` classes; `--color-blood` border when priority 1). The conversation is collapsed to the latest message, with a "Show conversation (N)" toggle. Message bodies render as text with `whitespace-pre-wrap`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat(queue): ticket cards with reply, resolve, dismiss and topic filter`

---

### Task 5: Retire Moderation → Support

**Files:**
- Modify: `src/pages-react/Moderation.jsx` (remove the Support tab entry, its import and its render line)
- Delete: `src/components/mod/SupportTab.jsx`
- Modify: `src/lib/modActions.js:197-208` (drop the support count query and `openSupport`)
- Modify: `src/components/mod/OverviewTab.jsx:53-64` (drop the Support tile and `openSupport` from `nothingOpen`)
- Modify: `src/components/ReportModal.jsx` (remove the `targetType === 'site'` branches)
- Modify: the tests that reference these (`grep -r "openSupport\|SupportTab\|Support tickets" src tests`)

- [ ] **Step 1:** Update the affected tests to expect no Support tab or tile. Run `npm run test:unit`. Expected: FAIL where the code still has them.
- [ ] **Step 2:** Remove the code.
- [ ] **Step 3:** Run `npm run test:unit`. Expected: PASS. Run `grep -rn "target_type', 'site'\|targetType === 'site'" src`. Expected: no matches.
- [ ] **Step 4: Commit:** `refactor(mod): retire the Support tab; tickets live in the Work Queue`

---

### Task 6: Help page, FAQ collection, Open Ticket flow

**Files:**
- Modify: `src/content.config.js` (add a `help` collection: glob `[^_]*.md` in `./src/content/help`; schema `{ topic: z.enum([six slugs]), question: z.string().min(5).max(140), order: z.number().default(100), draft: z.boolean().default(true) }`)
- Create: `src/content/help/_template.md`, plus one `draft: true` file per FAQ question in the spec (front-matter only, body empty)
- Create: `docs/help-faq-questions.md` (each question under its topic, with a **Facts** note verified against the code: file paths, limits such as 100/2,000 words, recovery-code behaviour, microphone permission)
- Create: `src/lib/help.js`, `src/lib/help.test.js`: `visibleHelp(entries, { dev }) => entries` (drops `draft` unless dev, drops an empty body always), `groupByTopic(entries) => Record<slug, entry[]>` sorted by `order`
- Create: `src/pages/help.astro` (prerendered; H1 "Help"; FAQ grouped under topic headings using `<details>`; `FAQPage` JSON-LD via `StructuredData.astro` only when ≥1 entry is visible; mounts `<OpenTicket client:load faq={…} />` with `{ topic, question, html }[]`)
- Create: `src/components/help/OpenTicket.jsx`, `src/components/help/OpenTicket.test.jsx`
- Modify: `src/components/Footer.astro` (add `<li><a href="/help/">Help</a></li>` in the list with House Rules, same classes)
- Modify: `src/components/UserMenu.jsx` (a `Help` link before Sign Out / Sign In, same mono text style)

**Interfaces:**
- Consumes: `TOPICS`, `openTicket`, `ticketErrorMessage` (Task 3); `<Turnstile>` (Task 3b); `useAuth`.
- Produces: `<OpenTicket faq={Array<{topic, question, html}>} />`.

OpenTicket behaviour:
- The server render shows an **Open a ticket** button, visible without JS (an `<a href="#open-ticket">`, upgraded by JS).
- Signed out: the button reads **Sign in to open a ticket**, sets `window.__signinPending = true` and dispatches `open-signin`, following the existing pattern.
- Step 1 "What's it about?": six topic buttons.
- Step 2: that topic's FAQ entries, expanded, then **Still need help?**. With 0 entries it goes straight to the form.
- Step 3: subject + message fields with live character counts (`maxLength` 120 / 2000), then `<Turnstile action="open_ticket">`. **Send** stays disabled until a token arrives, then calls `openTicket({ …, captchaToken })`. After any failed send, bump `resetKey` so the next try gets a fresh token.
- Success: "Sent. You'll see the answer here, on My tickets, and in your notifications." with a link to `/my-tickets/`.
- Failure: shows `ticketErrorMessage`.

- [ ] **Step 1: Failing tests:**
  - `help.test.js`: draft hidden in prod and shown in dev; empty body hidden even in dev; groups sorted by `order`.
  - `OpenTicket.test.jsx`:
    - Signed out shows `Sign in to open a ticket`, and clicking sets `window.__signinPending`.
    - Picking `Rituals` shows only Rituals questions.
    - `Still need help?` reveals the form.
    - Send is disabled until the mocked `Turnstile` calls `onToken('tok')`; submit then calls `openTicket({ topic:'rituals', subject, body, captchaToken:'tok' })`.
    - After a rejected send, the `Turnstile` `resetKey` prop changes and Send is disabled again.
    - A rejection `'You have 3 open tickets. Wait for an answer or close one first.'` is shown in a `role="alert"` element.
    - A topic with no FAQ goes straight to the form.
- [ ] **Step 2: Run** `npm run test:unit -- src/lib/help.test.js src/components/help`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS. Then `npm run build`. Expected: `/help/index.html` is in `dist`, and it contains `Open a ticket` (`grep -l "Open a ticket" dist -r`).
- [ ] **Step 5: Commit:** `feat(help): /help page with FAQ by topic and a guarded Open Ticket flow`

---

### Task 7: My tickets page and reply banner

**Files:**
- Create: `src/pages/my-tickets.astro` (mirrors `my-reports.astro`; `noindex`, title `My Tickets | Horror Writer`)
- Create: `src/pages-react/MyTickets.jsx`, `src/pages-react/MyTickets.test.jsx`
- Create: `src/components/TicketReplyBanner.jsx`, `src/components/TicketReplyBanner.test.jsx`
- Modify: `src/layouts/MainLayout.astro` (mount `<TicketReplyBanner client:load />` directly after `<SiteBanner client:load />`)
- Modify: the profile page component (find via `src/pages/profile.astro`): add a "My tickets" link next to the existing My reports link, or in the account section if there isn't one

**Interfaces:**
- Consumes: `fetchMyTickets`, `fetchUnseenAnswered`, `markTicketSeen`, `replyTicket`, `memberStatus`, `closedLabel`, `topicLabel`, `TICKETS_KEY` (Task 3).

Behaviour:
- MyTickets lists tickets newest first, each with a status pill (**Answered** in `--color-ember`, Waiting/Closed in ash) and the full conversation (member = "You", keeper = "The Keeper").
- A reply box shows on non-closed tickets.
- When a ticket is `answered` with `member_seen_at` null, it is expanded on load and `markTicketSeen(id)` is called once. `/my-tickets/#<id>` scrolls to and expands that one.
- Empty state: "No tickets yet." with a link to `/help/`.
- Banner: for a signed-in member, `fetchUnseenAnswered()`. If it returns something, show a full-width `role="status"` strip (`--color-ember` border, SiteBanner layout): `▸ The Keeper answered your ticket: <subject>` linking to `/my-tickets/#<id>`. Render null while loading, signed out, when `supabase` is null, or when nothing comes back. It uses `staleTime` 60 s. Opening the ticket invalidates `TICKETS_KEY`.

- [ ] **Step 1: Failing tests:**
  - Banner: renders the subject and link when an unseen answer exists; renders nothing signed out; renders nothing when `fetchUnseenAnswered` resolves null.
  - Banner **persistence:** a fresh mount with the same mocked DB state shows it again. No event or prop is involved, which proves Review Focus 2.
  - MyTickets: the answered+unseen ticket is expanded and `markTicketSeen` called once; a closed ticket shows `Closed — no reply for 14 days` and no reply box; a reply calls `replyTicket(id, body)`.
- [ ] **Step 2: Run** `npm run test:unit -- src/components/TicketReplyBanner.test.jsx src/pages-react/MyTickets.test.jsx`. Expected: FAIL.
- [ ] **Step 3: Implement** (hooks before early returns; `withProviders` named import).
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat(tickets): My tickets page and an unmissable reply banner`

---

### Task 8: "Can't sign in?" and the add-a-passkey prompt

**Files:**
- Modify: `src/components/SignInModal.jsx:234-258, 336-349, 413-421`
- Modify: `src/components/SignInModal.test.jsx`
- Modify: `src/pages/auth/callback.astro` (or its island). When the URL has `via=email`, set `localStorage['hw:passkeyPrompt'] = '1'` (in try/catch) before the existing redirect.
- Create: `src/components/PasskeyPrompt.jsx`, `src/components/PasskeyPrompt.test.jsx`; mount it in `MainLayout.astro` next to `TicketReplyBanner`

**Interfaces:**
- Consumes: `registerPasskey()` from `src/lib/passkey.js`; `<Turnstile>` (Task 3b); `useAuth`.

Behaviour:
- The collapsed link text becomes **Can't sign in? Email me a sign-in link**.
- `emailRedirectTo` becomes `window.location.origin + '/auth/callback?via=email'`.
- **Turnstile:** the email form (both sign-in and sign-up modes) renders `<Turnstile action="email_link">` above its submit button. Submit stays disabled until there's a token, and `signInWithOtp` gets `options.captchaToken`. A captcha error from Supabase (message matching `/captcha/i`) shows the Turnstile failure sentence and resets the widget. Google and passkey buttons get no widget.
- The `otp_disabled` / "signups not allowed" branch no longer sets `noAccount`. It shows the same message as success: **If that email has an account, a sign-in link is on its way. Check your inbox (and spam).** Delete the `noAccount` state and its block.
- An always-visible line under the form (in sign-in mode, when the gate isn't passed): **New here? Create an account** → `setMode('signup')`.
- The sign-up mode (gate passed, `shouldCreateUser: true`) keeps its current success copy.
- PasskeyPrompt: signed in and the flag is set → a small dismissible panel: **Add a passkey so you won't need an email link next time.** with [Add passkey] and [Not now].
  - Add → `registerPasskey()`; on success toast `Passkey added`.
  - Either button clears the flag.
  - Render null on the server and when signed out.

- [ ] **Step 1: Failing tests:**
  - `SignInModal.test.jsx`: the `otp_disabled` response shows `If that email has an account` and **not** `No account uses that email`.
  - The success response shows the same sentence when the gate isn't passed.
  - `emailRedirectTo` ends with `/auth/callback?via=email`.
  - `New here? Create an account` is visible in sign-in mode before any submit.
  - The email submit is disabled until the mocked Turnstile yields a token; `signInWithOtp.mock.calls[0][0].options.captchaToken === 'tok'`; an error `{ message: 'captcha verification process failed' }` shows the Turnstile failure sentence.
  - The Google and passkey buttons are enabled with no token.
  - The existing `shouldCreateUser` assertions still pass.
  - `PasskeyPrompt.test.jsx`: hidden without the flag; shown with flag + session; `Not now` clears the flag; `Add passkey` calls `registerPasskey` and clears the flag.
- [ ] **Step 2: Run** `npm run test:unit -- src/components/SignInModal.test.jsx src/components/PasskeyPrompt.test.jsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat(auth): Can't sign in? email link without revealing accounts; passkey prompt after email sign-in`

---

### Task 9: E2E coverage for Jeff

**Files:**
- Create: `tests/help.spec.js`
- Modify: `tests/mocks.js` (mock the `functions/v1/open-ticket` route, `tickets` select, `ticket_messages`, `fetchUnseenAnswered`; route `challenges.cloudflare.com` to a stub that calls the render callback with `'tok'`)
- Modify: `tests/auth.spec.js` (the `No account uses that email` expectation becomes the neutral sentence)

- [ ] **Step 1:** Specs:
  - `/help/` renders an H1 `Help` and an `Open a ticket` link with JS disabled (`test.use({ javaScriptEnabled: false })`).
  - Signed out, clicking it opens the sign-in modal.
  - Signed in (mock auth): topic → `Still need help?` → fill → `Sent.`.
  - With a mocked unseen answered ticket, the banner shows on `/` and links to `/my-tickets/#<id>`.
- [ ] **Step 2:** Jeff runs `cmd /c npx playwright test tests/help.spec.js tests/auth.spec.js`. Expected: all pass.
- [ ] **Step 3: Commit:** `test(e2e): help page, ticket flow, reply banner`

---

## Delivery

One branch, `design/member-tickets` (already holds the spec), opened as **one PR**. Every task is a commit, and the PR description carries:

1. **Jeff's one-time setup (before or after merge):** Supabase Dashboard → Project Settings → Vault → add a secret named `hw_project_url` = `https://<project-ref>.supabase.co`, and one named `hw_service_role_key` = the service-role key (Settings → API). Until both exist, alerts log a warning and nothing breaks.
2. **Turnstile setup (before merge, so the preview can be tested):**
   - Cloudflare Dashboard → Turnstile → Add widget "HorrorWriter", mode **Managed**, hostnames `horrorwriter.org`, `localhost`, `orig-beetlebub.workers.dev`.
   - Put the **site key** in the Workers build environment variables as `VITE_TURNSTILE_SITE_KEY`, and in `.env.local`.
   - `npx supabase secrets set TURNSTILE_SECRET_KEY=<secret key>`.
3. **After merge:** `npx supabase functions deploy send-keeper-alert --use-api` and `npx supabase functions deploy open-ticket --use-api`.
4. **Only after the new site is live:** Supabase Dashboard → Authentication → Attack Protection → Enable Captcha → Turnstile → paste the **secret key**. Then, in a private window, check:
   - an email-link sign-in works
   - passkey sign-in works
   - Google sign-in works
   Turning captcha on before the site is live breaks email sign-in.
5. **Optional switches (no code):** Cloudflare → Security → Bots → Bot Fight Mode on; a rate-limiting rule for `/auth/*`.
6. **On the PR's Workers preview:** the Turnstile widget renders on `/help/` and in the sign-in modal, and islands hydrate (the network tab shows JS loading, not only CSS/fonts).
7. **Behaviour change:** storm alerts start sending Pushover and email for real once the Vault secrets exist.
8. **Live checks on horrorwriter.org:**
   - With a test account older than an hour, open a ticket from `/help/`. Expected: a push "New ticket" on the phone, and a card in Admin → Work queue.
   - Reply from the card. Expected: the banner on the test account, the bell, and `/my-tickets/` shows Answered.
   - The test account replies. Expected: a "Reply on ticket" push and the card back in the queue.
9. Verification: `npx supabase db query --linked -f scripts/sql/verify-grants.sql` returns zero rows after merge.
10. FAQ answers: Jeff writes the body of each `src/content/help/*.md` and sets `draft: false`, starting from `docs/help-faq-questions.md`. `/help` works with zero answers (the ticket flow goes straight to the form).
