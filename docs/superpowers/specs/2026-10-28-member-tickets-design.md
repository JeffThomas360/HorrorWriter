# Member tickets, Help page and "Can't sign in?" — design

Date: 2026-10-28. Project 1 of 2 (project 2 is the Admin → Users full activity view, designed separately).

## Why

Members have no way to tell Jeff they have a problem. A half-built path exists (`reports` rows with
`target_type = 'site'`, resolved in Moderation → Support) but no page offers it to members, there is no
reply thread, and nothing guards it beyond the report form. The Work Queue (Admin → Work Queue) only
holds Jeff's own to-dos, so it has nothing meaningful to show.

Jeff's intent, in his words: the Work Queue "is a place to handle tickets, input from the community on
their problems." Tickets land there — "that's what it's for." Strongly guarded against exploitation.
A Help/FAQ section relieves pressure so real tickets are the exception. Nobody is ever locked out
unless they've lost their email.

## Goals

1. Signed-in members can open a ticket, from one front door: a new **Help** page.
2. The Help page's FAQ answers common questions *before* the ticket form appears.
3. Tickets arrive in the **Work Queue** only, and Jeff gets a **Pushover** alert for each.
4. Jeff replies on the ticket; the member cannot miss the reply (bell + banner + "My tickets").
5. Locked-out members can get back in with a one-time email sign-in link.

## Non-goals

- The larger Work Queue overhaul (Jeff: "needs to be enhanced at another time").
- Tickets from visitors who aren't signed in.
- Account recovery when the member has lost access to their email. That is a no-go by Jeff's decision.

## Anti-goals (failure even if it works)

- **No AI anywhere in this feature.** Jeff considered TypeSafe answer-matching and explicitly withdrew it:
  "I don't want AI in this part. I want these inputs to be sent to me." No model reads, scores, routes or
  writes ticket or FAQ text.
- **No model-written words members read.** FAQ answers are Jeff's (standing site rule).
- **No account handover via ticket.** A ticket or message never gets someone into an account; the email
  link is the only recovery door. ("I'm locked out, give me access" is the classic takeover.)
- A ticket box that can be used to flood Jeff's phone, the database, or other members.
- Two ticket systems side by side.

## Decided by Jeff

- Members-only (signed in). Visitors don't see the Open Ticket button.
- Lockout recovery: "Can't sign in?" sends a one-time sign-in link to the account's email. Lost email = no recovery.
- Tickets go **only** to the Work Queue. **Moderation → Support is retired.**
- Jeff replies on the ticket; the member is told "as much as possible" on their side.
- One front door: a `/help` page, linked from the footer and the account menu.
- Open Ticket flows through the FAQ: pick a topic → see that topic's FAQ entries → "Still need help?" → form.
- Topics: Signing in, My writing, Rituals, Another member, Something's broken, Other. Tickets carry their topic and
  the Work Queue can filter by it.
- Claude compiles the FAQ **questions** plus a facts note for each, from how the site actually works; Jeff writes the answers.
- Alert via **Pushover** (reuse the existing storm-alert secrets `PUSHOVER_APP_TOKEN` / `PUSHOVER_USER_KEY`).
- Ticket alerts: **normal priority** — they respect quiet hours (storm alerts stay high priority).
- **New-signup alert (added 2026-10-28):** a Pushover alert whenever a new member creates a real account.

## New-signup alert (Claude's calls)

- **"Real account"** = the moment a `profiles` row is created for a new auth user. One push per signup:
  `New member: @handle` (or `New member joined` if no handle yet), normal priority, linking to Admin → Users.
- **No email address or other personal data in the push.**
- **Flood-safe:** if signups in the last hour exceed 10, further pushes in that hour collapse into one
  `Signup surge: N new accounts in the last hour` push, so a bot wave can't bury Jeff's phone. A surge is itself a useful signal.
- Same server-side path as ticket alerts (DB trigger → `pg_net` → Edge Function with the service-role bearer check).
  A Pushover failure never blocks or rolls back the signup.
- Ships with delivery step 1 (it shares the Pushover plumbing), and it can land even if the ticket parts slip.

## Claude's calls (Jeff may override)

- **Data model:** a new `tickets` table plus a `ticket_messages` table (the member's opening text is the first
  message). Each new ticket also creates a `keeper_tasks` row of type `ticket` via `create_keeper_task`, so the
  existing Work Queue machinery shows it. `reports` keeps `'site'` in its check constraint for history, but no new
  site reports are written.
- **Migration of old Support tickets:** open `reports` rows with `target_type = 'site'` become tickets
  (topic "Something's broken" for `urgent`/`other` alike; first message = `details`), then those reports are closed
  with resolution `moved to tickets`. Resolved ones stay where they are.
- **Pushover message:** `New ticket: <Topic> — @handle`, link to `/admin/?tab=work-queue` (use whatever the Admin tab
  URL actually is). **No ticket text in the push**, so members' words stay off Pushover's servers. A member reply on an
  open ticket sends `Reply on ticket — @handle`.
- **Guards** (all enforced in the database RPCs, never only in the client):
  - Only `authenticated`; writes only through `security definer` RPCs (`open_ticket`, `reply_ticket`,
    `keeper_reply_ticket`, plus the existing `resolve_keeper_task`), with no INSERT/UPDATE/DELETE policies, the same
    pattern as `keeper_tasks`.
  - Account must be at least 1 hour old.
  - Banned accounts (`banned_until > now()`) cannot open tickets. They use Appeals. Shadowbanned or screened accounts
    can; their tickets still reach Jeff.
  - At most 3 open tickets per account; at most 3 new tickets per rolling 24 h.
  - At most 10 member messages per rolling 24 h across all tickets.
  - Subject 5–120 chars; message 20–2,000 chars, trimmed; topic must be one of the six.
  - The same message text from the same account within 24 h is refused (dedupe).
  - Plain text only, rendered as text (no HTML, no markdown links made clickable).
  - Members read only their own tickets (RLS `user_id = auth.uid()`); Jeff reads all via `mod_can('configure','all')`.
  - Members cannot reply to resolved or dismissed tickets.
  - Every keeper action logs to `mod_actions`, matching the existing keeper RPCs.
  - Friendly refusals: each guard raises a distinct error code the UI turns into a plain sentence
    ("You've opened 3 tickets today — try again tomorrow.").
- **Member visibility of replies ("as much as possible"):**
  1. A `notifications` row (kind `ticket_reply`) feeds the existing bell.
  2. A site-wide banner on the member's next page load: "The Keeper answered your ticket", linking to it, until they
     open it (track `member_seen_at` on the ticket). It's a client island, but it isn't a primary CTA, so the
     render-visible-server-side trap doesn't apply. Island state still follows the `AuthContext.jsx` module-global rule.
  3. **My tickets** on the member's own profile/settings area: list with status **Waiting / Answered / Closed** and the
     full conversation.
- **Work Queue:** a `ticket` type in `src/lib/keeperTasks.js` with label "Ticket", detail = topic + subject + latest
  message, actions **Reply** (opens a text box; the ticket stays open, status → Answered), **Resolve** (optional
  closing note, sent as a final message) and **Dismiss**. The card can expand to show the full conversation. Add a
  topic filter.
- **Answered tickets leave the queue until the member replies (Jeff, 2026-10-28):**
  - A ticket has **at most one open keeper task**, and only while it is waiting on Jeff.
  - **Reply** closes the current keeper task (resolution `replied`), and the ticket becomes *Answered*.
  - A **member reply** on an Answered ticket opens a fresh keeper task (dedupe key `ticket:<ticket id>:<message id>`),
    and the ticket goes back to *Waiting*. That brings it back to Jeff's queue and sends the "Reply on ticket" push.
  - **Resolve / Dismiss** close the ticket and any open task in one transaction. Doing it from the Work Queue card
    goes through the ticket RPC, so ticket and task never disagree.
  - **Auto-close:** a daily `pg_cron` job (pg_cron is already used, see `20260927000000_account_deletion.sql`) closes
    Answered tickets with no member message for 14 days. They show to the member as *Closed* with the label
    "Closed — no reply for 14 days". No message is generated.
- **Help page:** `/help`, server-rendered Astro (good for SEO; add `FAQPage` structured data only for entries that
  have answers). FAQ content lives in a source file in the repo (e.g. `src/content/help.js`), grouped by the six
  topics. **Entries without an answer from Jeff are hidden**, so the page can ship before every answer is written.
  The Open Ticket button is rendered visibly server-side. For signed-out visitors it says "Sign in to open a ticket"
  and opens the sign-in modal (using the `window.__signinPending` pattern).
- **"Can't sign in?":** `SignInModal.jsx` already has "No Google or passkey? Email me a sign-in link" calling
  `signInWithOtp` → `/auth/callback`. **Rework that link, don't add a second one:** relabel it "Can't sign in? Email
  me a sign-in link". Its current "No account uses that email" branch reveals which emails have accounts, so it
  goes. The UI always says "If that email has an account, a link is on its way", and a separate, always-visible
  "New here? Create an account" link keeps the sign-up path. To know a sign-in came from an email link (passkey
  sign-in also ends in `verifyOtp({ type: 'email' })`), the email link's `emailRedirectTo` carries a marker
  (e.g. `/auth/callback?via=email`). The add-a-passkey prompt shows only after such sign-ins, and only if the
  account has no passkey on this device's list. After a sign-in by email link, the member is prompted
  to add a new passkey (existing passkey registration flow), and the prompt can be dismissed. It works for accounts
  first made with Google too, as long as the email matches. **Verify this on the PR preview.**
- **Retire Support:** remove the Support tab from Moderation, its count from the Moderation overview and
  `modActions.js`, and the `targetType === 'site'` branch of `ReportModal`.

## FAQ questions (Claude drafts the list + facts; Jeff writes answers)

Part of the build: a `docs/` working file listing each question under its topic with a "facts" note sourced from the
code, for Jeff to answer. Starting set (the builder confirms each fact against the code):

- **Signing in:** How do I sign in? What's a passkey? I got a new phone or computer. My passkey isn't offered (password-manager gotcha). I can't sign in at all. I lost access to my email.
- **My writing:** How do I publish a story? How do I edit or delete it? What happens to my writing if I delete my account (sealing + recovery code)?
- **Rituals:** What is a Midnight Ritual? Why 100 words minimum / 2,000 maximum? A mentor sent my entry back. What does "Keep it" do, and how do I restore a kept entry?
- **Another member:** How do I report a post or person? How do I block someone? What happens after I report?
- **Something's broken / Other:** Dictate isn't hearing me (microphone permission). What do the house rules say (`/rules`)?

## Constraints (from CLAUDE.md, the ones that bite here)

- Schema change = numbered migration in `supabase/migrations/` ending with `NOTIFY pgrst, 'reload schema';`.
  Merging applies it to production. Rehearse in `begin; … rollback;` via `npx supabase db query --linked -f <file>`.
- Every new client-callable function needs `GRANT EXECUTE ... TO authenticated`; internal helpers revoked.
  `scripts/sql/verify-grants.sql` must return zero rows after the migration.
- `profiles` has column-level grants. Use `PROFILE_COLUMNS`, never `select('*')`. Any new profiles column needs its grant.
- Pushover is called server-side only, never from the client. **The storm-alert `pg_net` pattern is broken on this
  project:** `app.settings.supabase_url` and `app.settings.service_role_key` are unset (checked read-only against
  production 2026-10-28), so `check_for_storm()` writes `storm_alerts` rows but has never pushed. **Claude's call:**
  read the project URL and service-role key from **Supabase Vault** (`vault.decrypted_secrets`, inside a
  `security definer` helper revoked from everyone). The same change repoints storm-alert dispatch at Vault, so
  storm alerts start actually sending, a deliberate production behaviour change that goes in the PR description.
  Jeff adds the two Vault secrets once by hand (exact steps in the PR). If they're missing, dispatch logs a warning
  and the insert still succeeds, keeping the existing never-roll-back guard. Edge Functions are deployed by hand after merge:
  `npx supabase functions deploy <name> --use-api`.
- `supabase` may be null in islands, so guard. Hooks go before early returns. `withProviders` is a named import.
- Reds: `--color-ember` for small/interactive, `--color-blood` only for large display, borders and fills.
- Local dev points at the production database, so local writes are live writes. Use test accounts.
- Jeff runs test suites himself; give him exact commands.

## Suggested delivery (builder may reshape)

1. Database: tables, RPCs, guards, keeper task type, Pushover trigger + Edge Function, migrating old Support tickets.
2. Work Queue: ticket cards, Reply/Resolve/Dismiss, conversation view, topic filter.
3. Member side: `/help` page + FAQ file, topic → FAQ → form flow, My tickets, banner, bell notification.
4. "Can't sign in?" email link + add-a-passkey prompt.
5. Retire Moderation → Support.

## Left to the builder

Exact table columns, RPC signatures, error codes, component structure and file names, banner styling within the
existing theme, test layout (vitest unit tests for registry/guards/UI; E2E specs for Jeff to run).
