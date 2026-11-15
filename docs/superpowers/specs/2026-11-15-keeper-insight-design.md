# Keeper insight: Site Errors, member Dossier, arrival source: design

Status: draft for Jeff's approval, 2026-11-15.

Marks: **(Jeff)** means Jeff decided it. **(call)** means the author of this document chose it and Jeff can overrule it.

## Why

Jeff wants to know what he is doing right and wrong at getting new members who actually write something. On 2026-11-15 the answer had to be dug out of the database by hand, and most of it was not recorded at all.

What that dig found, and what this design must make visible without a dig:

- 3 of 11 members published, each within 4 to 10 minutes of joining. Their 10 stories drew 1 critique. The other 8 did nothing. Two members were active on a later day.
- The only trace of where anyone came from was accidental: the error log keeps page addresses, and 14 of them (Oct 21 to Nov 4) end in `?utm_source=chatgpt.com`. That trace exists only because a homepage bug fired on every visit until #123 fixed it.
- A member's series save failed three times on Nov 11 with a message on screen. Nothing was logged, because the page did not crash. Jeff: "Most people don't want to open a ticket."

So: things happen to members that nothing writes down, and what is written down can only be read in the SQL editor.

## The rule for what may be kept (Jeff, 2026-11-15)

Information that is created on this site, stays on this site, and is used only to make the site better and fix what is broken counts as the bare minimum. Nothing goes to brokers, advertisers or outside trackers. Where a choice is between more insight into a problem and less, this work chooses more.

That rule is wider than the sentence on `/rules` today, which lists three things (email, display settings, public contributions) "required to authenticate you". So the page is rewritten to state the rule itself. Collecting under a rule the page does not state would break the standing "only truth" rule for the site's claims.

## Goals

1. Failures a member hits are logged, whether the page crashed or showed a polite message.
2. Jeff can read those failures in Admin, grouped by cause, without SQL.
3. For any one member, Jeff can see what happened after they joined: how they arrived, what they wrote, what they got back, whether they returned, what went wrong.
4. From now on the site knows how each new member found it.
5. Jeff can see where people give up: which step of joining, publishing, entering a Ritual, critiquing or posting they started and did not finish. **(Jeff, added 2026-11-15: "Don't park it, add it now.")**
6. The privacy section on `/rules` stays true.

## Non-goals

- Server-side failures: an edge function that did not send an email, a page that failed in the Worker before reaching the browser. They need a different mechanism. Parked.
- Marking an error "resolved". "None since Nov 5" says the same thing with no state to keep. **(call)**
- A notification when someone critiques your story. It is a real gap this work exposed (there is none today), but it is community backlog item 2 and stays there.
- Anything for moderators below Keeper. Every screen here is Keeper-only. **(call)**

## Anti-goals

Any of these makes the work a failure even if it runs:

- Recording which pages or stories a member reads. **(Jeff)**
- Showing or newly using IP addresses or location. Supabase Auth already stores a session IP; nothing here reads it. **(Jeff)**
- A third-party script, cookie or analytics service. **(Jeff, standing: open-licence, self-hosted, no outside services)**
- Sending anything that identifies a visitor who never joins. Arrival details wait in their own browser and are sent only once they have an account. The one thing a signed-out visitor adds to is a plain count of Join steps (piece 4), with no id, address or device attached. **(call)**
- Logging what a member wrote: no request bodies, no query-string values, no form contents. Error messages are kept whole, even when one quotes a value back (`invalid input syntax for type uuid: "…"`), because the quoted value is often the clue to the bug **(Jeff's rule, applied by the author)**. They are short, truncated, Keeper-only, and deleted after 90 days.
- The logger breaking the thing it watches. It must never throw, never delay a request, never change a response.

## Constraints

- `/rules` → "Privacy of the Void" currently promises "only the bare minimum" and "no trackers". Wording changes ship in the same PR as the behaviour they describe, never after.
- `main` deploys on merge and merging a migration applies it to production. Every migration is rehearsed in `begin; … rollback;` first (CLAUDE.md).
- New functions need explicit grants and a row in `scripts/sql/verify-grants.sql`'s allowlist in the same PR.
- Never add a parameter to an existing RPC with `create function` alone (the overload trap, CLAUDE.md).
- Members' browsers may run an old bundle for a while after a deploy. `log_client_error(text,text,text,text,text)` must keep working for them.
- The Supabase client can be null, and it is also used during server rendering inside workerd, where there is no `window`.
- Free plan, no paid services.

## Approaches

Three were considered for how the Dossier gets its facts.

**A. Work it out on demand (chosen, Jeff).** One Keeper-only function gathers a member's facts from existing tables when the tab opens, the way `mod_user_submissions` feeds the Submissions tab. The only new storage is one small private table for arrival details. Cheap, nothing to keep running, works for existing members on day one. Limit: "where they stopped" can only show actions that leave a row. It cannot say someone opened Publish and gave up.

**B. A running log of member actions.** The site writes a line when a member opens Publish, starts typing, abandons a form. Gives a true timeline, but only for the future, and it is more to keep working. First set aside, then **added by Jeff in a narrow form**: not a log of everything, only the start and middle steps of a short fixed list of flows, so the Dossier can say where someone gave up. That is piece 4. A still supplies everything else.

**C. Fold it into the Administrative and Submissions tabs.** Rejected: Jeff asked for a tab of its own and Administrative is already long.

Two were considered for catching handled failures.

**One hook at the database connection (chosen, call; Jeff handed over the how).** Nearly every save, load and sign-in goes through the one Supabase client in `src/supabaseClient.js`. A wrapped `fetch` passed to `createClient` sees those failed requests in one place. Two callers use a bare `fetch` instead: `src/lib/passkey.js` (the `webauthn-*` functions) and `TranscribeModal.jsx` (the transcribe Worker). Passkey calls are routed through the same wrapper, as `fn:webauthn-…`. Dictate is left out: it talks to a different service and already tells the member what went wrong. **(call)**

**Report from each call site.** 150 places across 36 files show a failure message; 4 report it today. Rejected: 146 edits, and the next new one would be forgotten.

## The design

Four pieces, in this order. Each is useful alone.

Pieces 1 and 3 change the database, and a migration only reaches production when it merges, so a preview cannot exercise code that needs it. Each of those two pieces is therefore two pull requests **(call)**: first the migration alone (additive, nothing uses it yet, rehearsed before merge), then the site code, checked on its preview against the live database. Piece 4's two small tables ride in migration 3a, so there is one rehearsal and one merge for both **(call)**. Six pull requests in all: 1a, 1b, 2, 3a, 3b, 4. Privacy wording travels with the site code (1b, 3b and 4), because that is when the behaviour starts.

### PR 1: Capture

**What gets logged.** The existing `client_errors` table gains two kinds beside `island`, `window`, `promise`:

- `request`: a request to Supabase that failed (HTTP status 400 or above, or the network call threw).
- `shown`: an error message the member was shown in a toast.

New nullable columns **(call)**: `action text`, `status integer`, `code text`. The table's check constraint on `kind` is replaced to allow the two new kinds.

- `action` is a short name built from the request's method and path only: `rpc:create_thread_with_post`, `books:update`, `auth:otp`, `fn:open-ticket`. Never the query string, never the body.
- `status` is the HTTP status. `code` is the error code from the response body when there is one (`23505`, `PGRST203`).
- `message` is the error message from the response body, whole, truncated as today.
- `url` (the page the member was on) is stored **without its query string or hash** from now on **(call)**. The `utm_source` evidence that prompted this work came from that field by accident; arrival source gets a proper home in PR 3, and page addresses can carry things that should not be kept.

**How.** A wrapped `fetch` given to `createClient(url, key, { global: { fetch } })`.

- Browser only. With no `window` it is the plain `fetch`; server-side failures are a non-goal.
- It returns the original response untouched and reports from a clone, after the fact. A reporting failure is swallowed.
- It never reports its own logging call, or it would loop.
- A short ignore list, kept in one place and unit-tested, for failures that are normal traffic. Known so far: a `.single()` that finds no row (`PGRST116`), a request cancelled because the member navigated away (`AbortError`), and a refresh of an already-expired session. The builder extends it from what the preview shows, and each entry carries a one-line reason.
- `supabaseClient.js` and `errorReporter.js` would import each other. Break the cycle however is cleanest (a late-bound reporter is one way). Left to the builder.

**`shown` messages (call).** A thin module wraps sonner's `toast` so `toast.error(...)` also reports the text as kind `shown`, and the 19 files that import `toast` from `sonner` import it from there instead (three test files mock it and are repointed). A unit test fails if any non-test file under `src/` imports `toast` from `sonner` directly, in the style of the banned-colour test. Inline messages set with `setError` (the sign-in modal has 16) are not caught; nearly all follow a failed request, which is. That limit is accepted.

Validation messages ("message must be at least 25 characters") will land here too. That is wanted: it shows where members struggle. The Site Errors tab can filter the kind out.

**Writing it.** A new function, `log_site_event`, with the wider parameter list **(call)**. `log_client_error` keeps its name and its five text parameters for old bundles, so there is no overload and no gap; its body is replaced (`create or replace`, same signature) so that it too keeps 90 days, and drops the query string and hash from the page address. Otherwise one crash from an old bundle would prune the log back to 30 days. Same guards as today in both: fields truncated, `auth.uid()` recorded when signed in, a 300-rows-per-hour cap. Granted to `anon` and `authenticated`, like the old one.

**Limits on volume.** Per page load, the reporter sends at most 5 crashes (as today) plus at most 10 `request`/`shown` entries, never the same one twice **(call)**.

**Retention goes from 30 to 90 days (call).** The Dossier's Trouble section is only as deep as this log. Volume is tiny (about 150 rows in the last 30 days).

**Deleting an account deletes its error rows (call, from the standing deletion policy).** `client_errors.user_id` has no link to the member today, so rows outlive the account. Migration 1a adds one that cascades, after clearing any member id that no longer matches an account.

**Privacy wording.** The section gains a plain statement that the site records errors: what failed, the page, the browser type, and the member if signed in, kept 90 days. This has been true since Oct 20 and is not stated today. Draft text is under "Privacy wording" below.

### PR 2: Site Errors tab

A seventh Admin tab, `errors`, labelled "Site Errors", Keeper only, after Audit. **(Jeff: the tab and its place.)**

```
SITE ERRORS                          last 7 days   all kinds
3 problems · 2 members affected

Couldn't save story (duplicate series entry)     3×  1 member    Nov 11
   My Stories → edit · Android · @member → Dossier
Sign-in link expired                             2×  2 signed out  Nov 9
Page crashed: homepage                          12×  none since Nov 5
```

- **Grouped by cause.** One row per problem. The grouping key is kind, plus `action`/`status`/`code` for requests, plus the message with its variable parts (ids, numbers) blanked.
- **Each problem shows:** a title, how many times, how many distinct members, how many signed-out occurrences (visitors cannot be counted, only occurrences), the pages it happened on, device and browser in plain words parsed from the user agent, first seen and last seen.
- **Titles.** A small map from known codes to plain words (`23505` → "duplicate entry"). Anything unknown shows its raw message. The map grows as real errors show up.
- **Opened, a problem lists its recent occurrences:** time, member (a link that opens their case file on the Dossier tab once PR 3 lands; until then, the case file), page, and the stack trace collapsed.
- **Filters:** window (24 hours, 7 days, 30 days, 90 days), kind (crash, failed request, message shown), member.
- **No migration.** The Keeper can already read `client_errors` by row-level security. Grouping is a pure function in `src/lib/`, unit-tested, in the manner of `src/lib/pulse.js`. Handles come from a second query using `PROFILE_COLUMNS`.
- **Pulse** (Overview) keeps its "Site errors" section, counts crashes and failed requests but not `shown` **(call)**, and gains a link to this tab.

### PR 3: Dossier and arrival source

**Arrival, stored in the visitor's browser first.** On the first page of a visit, if nothing is stored yet, the site puts a small record in `localStorage`:

- `tag`: the `utm_source` value from the address, if any (`chatgpt.com`). **(Jeff)**
- `referrerHost`: the host name only of the site they came from, never its path. Left empty for the site's own host and for sign-in hosts (Google's, Supabase's). **(Jeff agreed in principle to the referring site's name; the exclusions are a call.)**
- `landingPath`: the first page's path, no query string.
- when it was noted. It is discarded after 30 days unused.

First touch wins: later visits do not overwrite it. It survives the Google sign-in redirect because it is in `localStorage`, not in memory (see the cross-island trap in CLAUDE.md).

**Sent once, on joining.** When a session appears for a profile created in the last 24 hours and the browser holds an arrival record, the site calls `record_arrival(...)` and clears the record. The function fills the arrival fields once per member, ever, and refuses for older accounts.

**"What brought you here?" (Jeff: asked, optional).** A small dismissible card on the first signed-in pages, for members who joined in the last 7 days and have not answered or dismissed it **(call: after joining, not on the Join screen, so sign-up gains no step)**. One free-text box, 200 characters, and Skip. It waits its turn behind the passkey prompt rather than stacking with it. The answer is the member's own words, shown only to the Keeper. A second function, `record_found_via(p_text)`, saves it; it works for 7 days after joining, creates the member's row if `record_arrival` never ran (a link opened on another device, cleared storage), and accepts an empty answer for Skip. Either way it stamps `asked_at`, so the card never returns on another device **(call)**.

**Storage.** A private table `member_arrivals`: member id (primary key, cascades when the account is deleted, per the deletion policy), `source_tag`, `referrer_host`, `landing_path`, `found_via`, `asked_at`, `created_at`. Row-level security on, no policies: read and written only through functions.

**The Dossier tab.** Third tab on the case file, `dossier`, shown only to the Keeper, loaded when first opened like Submissions.

```
DOSSIER · @capt_yugoslavia
Arrived      Nov 4 · Google sign-in · Windows, Chrome
             from chatgpt.com · landed on / · "…their answer…"
First visit  published a story 3 min 31 s after joining
Wrote        1 story · 0 forum posts · 0 Ritual entries
Got back     1 critique · first one after 2 days
Gave         0 critiques
Came back    seen on 1 day · not since the critique
Stopped at   published "…" on Nov 4
Trouble      9 page errors on Nov 4 · 0 tickets
```

One Keeper-only function, `mod_user_dossier(p_id)`, returns everything as one JSON object. What each line means:

- **Arrived:** join date; sign-in methods (identity providers, and whether they have a passkey); device and browser in plain words from session user agents; the arrival row. Members who joined before PR 3 show "source not recorded".
- **First visit:** the first thing they put on the site and how long after joining. Kinds are as `member_submissions_index()` defines them. Hidden and screening items count.
- **Wrote / Gave:** counts by kind, from the same index.
- **Got back:** responses from other people: a critique on their story, a reply to their Ritual entry, a reply in a thread they started. Shows the count, and how long their first piece waited for its first response, or "still waiting, N days".
- **Came back:** the number of distinct days they were seen, and whether any of those days falls after their first response. "Seen" is approximate and the tab says so: it is the union of session start and refresh dates, their last sign-in, and the dates of anything they posted. Signing out removes a session, so quiet visits can go uncounted.
- **Stopped at:** the most recent thing that left a row: their latest submission, or a Ritual draft with no entry for that prompt ("started a Ritual draft, never posted it"). Piece 4 sharpens this line with unfinished flows ("opened Publish on Nov 9, started writing, never published").
- **Trouble:** their rows from the error log, newest first, capped at 20, each with what failed, page, device and time; and their ticket count with a link to the work queue. A link opens Site Errors filtered to this member.

**The roll-up.** One line above the list on Admin → Users **(call on placement)**:

```
11 members · 3 wrote · 1 got a response · 2 came back
```

Same definitions as the Dossier, from one Keeper-only function. "Came back" here means seen on a later day than the day they joined **(call)**; the narrower "returned after getting a response" is on each Dossier. The Keeper's own account is left out of the count **(call)**.

**Privacy wording.** Extended for arrival source and the optional question.

### PR 4: Where people give up

**What is recorded.** Steps, by name only, in a short fixed list of flows **(call on the list; Jeff can add or cut)**:

| Flow | Steps logged | Finished when |
|------|--------------|---------------|
| Join | opened Join · passed the age check · chose a sign-in method | an account exists |
| Publish a story | opened Publish · started writing · pressed Publish | the story exists |
| Ritual entry | opened the writing box · started writing · pressed Post | the entry exists |
| Critique | started writing a critique · pressed Post | the critique exists |
| Thread or reply | opened the form · started writing · pressed Post | the post exists |
| Ticket | opened Open Ticket · pressed Send | the ticket exists |

- "Started writing" is the first keystroke in the main text box. Never the text, never its length.
- The finish is not logged. It is read from the real row (the story, the entry), which cannot be wrong **(call)**.
- "Pressed Post" with no finished row is the sharpest signal: they tried and it did not go through. The error log from piece 1 says why.

**Members.** A private table `member_steps`: member id (cascades on account deletion), flow, step, day. One row per member, flow, step and day, so a member who opens Publish ten times in a day is one row. Written by `log_member_step(p_flow, p_step)`, signed-in members only, which refuses any name not on the list. Kept 90 days, like the error log.

**Signed-out visitors: Join only, counts only.** Most giving up probably happens before there is an account. A second private table, `step_tallies`, holds a number per day, flow and step and nothing else: no id, no address, no device. `tally_step(...)` adds one, capped per hour like the error log, and the browser remembers it has counted a step today so a reload does not count twice. This is the one exception to "nothing about a visitor who never joins", and it is a count, not a record of a person **(call; Jeff's rule covers it, but it is his to refuse)**.

**In the site code.** One small helper, called at the listed points in about six components. Like the error reporter it never throws, never waits, and is off in test mode (`isPlaywrightTest()`).

**Where Jeff sees it.**

- Each Dossier's **Stopped at** line names the unfinished flow and the last step reached.
- Admin → Users, under the roll-up line, a small table for the last 30 days **(call on placement)**:

```
WHERE PEOPLE GIVE UP · last 30 days
Join              opened 40 · age check 31 · chose method 22 · joined 11
Publish a story   opened 6 · started writing 5 · pressed Publish 3 · published 3
Ritual entry      opened 4 · started writing 1 · pressed Post 0 · posted 0
```
(Illustrative numbers.) Join counts visits; the others count distinct members.

**Privacy wording.** One more sentence, in the draft below.

## Privacy wording

Draft for the "Privacy of the Void" paragraph on `/rules`. Jeff edits and approves the words in each PR. PR 1b ships it without the two sentences about joining and about starting and finishing things; 3b adds the first of those, 4 the second.

> We keep only what this site needs to run and to get better. That means your email address, your settings, and what you post. Signing in records your device type and network address, which the sign-in service uses to keep your account secure. When something fails in your browser, the site records what failed, the page, and your browser type so it can be fixed; these records are deleted after 90 days. When you join, we note how you found us: the site that linked you here, if any, and your own answer if you choose to give one. We note when you start and finish things like joining or publishing a story, never what you wrote, so we can see where the site gets in people's way. All of it is created here, stays here, and is used only to fix and improve this site. We use no advertising trackers, no outside analytics, and no cookies beyond the one that keeps you signed in, and we do not record what you read. Your email is never sold, traded, or shared, unless required by legal subpoena.

Noticed while reading it, not part of this work: the sign-up form uses Cloudflare Turnstile, an outside service the section does not mention.

## Checking it

- Unit tests (vitest, required by CI) for: the action name built from a request, the ignore list, the reporter's caps and de-duplication, the `toast` import rule, error grouping, user-agent to plain words, arrival capture (first touch, exclusions, expiry), the step helper (fixed list, once a day, silent on failure), and the Dossier's formatting helpers.
- SQL tests for each migration, rehearsed with `scripts/sql/rehearse.ps1` and rolled back, before merge. `scripts/sql/verify-grants.sql` returns zero rows after.
- On the preview of each site-code PR (1b, 2, 3b), against the live database: force a failed save and see it in the log; open Site Errors; open a Dossier for a member with history. A throwaway account joined through a tagged link (`/?utm_source=test`) must show that tag in its Dossier, then be deleted.
- E2E mocks its requests. The reporter must not turn a mocked failure into an unmocked logging call that fails a test; how is left to the builder.

## Left to the builder

- Names of files, components and helpers, and how the three PRs split into commits.
- The exact ignore list and the code-to-plain-words map, grown from what the preview shows.
- How user agents become "Windows, Chrome" (a small local function; no library unless one is already installed).
- Whether `mod_user_dossier` is one query or several inside the function.
- Layout details of both tabs at phone width, following the existing admin screens (check 360px as well as 375px).

## Parked, to move to the vault's parked.md on approval

- Server-side failure logging (edge functions, Worker page failures).
- A full timeline of everything a member does (the wide form of approach B). Piece 4 is the narrow form.
- Turnstile is not mentioned in the privacy section.
