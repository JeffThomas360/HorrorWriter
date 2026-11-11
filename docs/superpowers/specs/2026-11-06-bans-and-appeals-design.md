# Bans, appeals, downloads and member votes: design

Status: approved by Jeff, 2026-11-06.

Marks: **(Jeff)** means Jeff decided it. **(call)** means the author of this document chose it and Jeff can overrule it.

## Why

A ban here should be firm and accountable. It can be truly permanent, but it must never be silent. The person banned gets told why, gets to state their case once, and never loses their writing. Jeff wants to catch miscommunication and overzealous mods, and doesn't want the power to remove writing held only by the Keeper and future mods.

This site values dialog and gives a wide berth to what's acceptable. Moderation should leave a conversation readable, and remove as little as it can.

## Where things stand

PR #132 must merge first. It makes bans really apply and logs each one through `mod_apply_sanction` and `mod_revoke_sanction`, with `isPermanentBan` as the single check for "permanent". Before it, the buttons were silent no-ops.

Still true after #132:

- `content_visible` hides everything a banned member wrote (`20260822000000`). This design removes that.
- The member is never told. No notice, no notification, and posting fails with a raw database error.
- Appeals exist for content only (`resolve_appeal`, `AppealButton`, `AppealsTab`). Overturning doesn't lift a ban, and `resolve_appeal`'s log row has no `target_user_id`, so it never reaches a case file.
- The one Appeal button (`ReadStory.jsx`) sends `book.id` where `resolve_appeal` expects a `mod_actions` id, so deciding it fails. No appeal has ever been filed.
- There is no download of writing. Existing "Download" buttons save a recovery code.
- Bios, avatars, series and old posts stay editable during a ban.
- Deleting an account and rejoining with the same email clears a ban.
- `mod_can` ignores bans, so a banned mod keeps their powers.
- `/rules` promises "immediate exile (account termination)" and doesn't describe bans or appeals.

**Interim risk:** between #132 and piece 2, a ban hides the member's work without telling them. Jeff should avoid banning anyone in that window unless it's urgent.

## Goals

1. Any member can download everything they wrote, at any time, banned or not.
2. A banned member is told, in plain words, what happened and why.
3. A ban stops new posting and locks what they wrote, without hiding it.
4. One appeal per sanction, with a written decision, final either way.
5. A written trail visible to the member and those involved in the decision.
6. Permanently banned emails can't rejoin.
7. Signed-in members can vote to take down a permanently banned member's work.
8. `/rules` says exactly what to expect.

## Non-goals

- **Shadowbans (Jeff).** Nothing new reads or sets `is_shadowbanned`. Removing the leftover column and checks is separate clean-up.
- **Stopping someone using a different email (Jeff):** "it is what it is".
- **Blocking sign-in (Jeff).** Login stays intact so they can read, appeal and download. Never use Supabase Auth's own ban.
- **Emailing the ban notice (call).** They see it on next sign-in. The site emails very little today.
- **Votes on anyone who isn't permanently banned (Jeff).**

## Anti-goals

These would make this a failure even if it technically worked:

- A member loses their writing because of a ban.
- A ban happens and the member can't find out why.
- A vote can be aimed at an ordinary member.
- The public can see who is banned, or why.
- Model-written text in anything members read. Notices and rule wording are Jeff's. Mods' reasons are human-written.

## Rules for every piece

- Follow `CLAUDE.md`: numbered migrations ending in `NOTIFY pgrst, 'reload schema';`, `GRANT EXECUTE` plus an allowlist row in `scripts/sql/verify-grants.sql`, rehearsal through `scripts/sql/rehearse.ps1`, and `profiles` column-level grants.
- The database enforces every rule. UI gating is only a convenience.
- Sanction state stays private to the member and to mods. Reach it through SECURITY DEFINER RPCs. Nothing about a ban may appear in server-rendered HTML, because readers and crawlers get the same page.
- Islands don't share React context (`CLAUDE.md` traps).
- Jeff runs the test suites; the PR gives exact commands. `scripts/sql/test-sanctions.sql` must be extended, since this design changes what it asserts around `is_banned`-driven behaviour.

## Order of work

Four PRs, in this order **(Jeff agreed the shape; the order is a call)**:

1. Download your writing.
2. Bans that lock, the notice, appeals, the email block, mod powers.
3. Member votes.
4. Rules rewrite, last, so it describes what actually shipped.

The notice mentions votes and download, so piece 2's wording must only promise what exists when it ships. Add the votes sentence in piece 3.

## Piece 1: Download your writing

Every member gets a "Download my writing" control on their profile page. The notice links to it.

**Includes (Jeff: "what we need to remove as well as keep"):** their stories, Ritual entries, forum threads and posts, critiques, Ritual drafts and series structure. This includes work a mod removed or members voted down.

**Excludes (call):** other people's words, such as critiques on their stories or replies in their threads.

**Kept work (call):** the vault can't restore during a ban, so "Your kept stories" and kept Ritual entries get a Download that decrypts with the recovery code in the browser, without calling the restore RPC. Decrypting is already client-side (`storyKeep.js`, `ritualKeep.js`).

**How it's built (call):** entirely in the browser using what RLS already lets an author read. `content_visible` always lets an author read their own work, whatever its status. No new server load. `collectWriting` in `sealCollect.js` is a starting point, but it omits forum posts and critiques and deliberately drops moderator-hidden stories, so it can't be reused as it is.

**Format (call):** one `.zip` of plain Markdown files with readable names, organized by kind. Writers can open them in anything. Any zip library must be openly licensed and self-hosted, per the project's open-licence rule.

## Piece 2: Bans, notice, appeals

### What a sanction does

| | Permanent ban | Suspension (1, 7, 30 days) |
|---|---|---|
| No new posts, work locked | Yes | Yes, until the end date |
| Notice with the reason | Yes | Yes, with the end date |
| One appeal, final | Yes | Yes, while active |
| Download | Yes | Yes |
| Member votes | Yes | No |
| Email blocked from rejoining | Yes | No |

All of this table is **(Jeff)**.

### Work stays up, locked (Jeff)

Remove the `is_banned` check from `content_visible`, so nothing hides automatically. Readers see the work as before, with no public label.

While the ban stands, the member can't edit or delete their stories, threads, posts, critiques or series **(Jeff for edits; call for deletes, because "the post stands")**. That includes Keep it and Delete forever on stories and Ritual entries. Other members can keep replying and critiquing.

Their public profile is locked too: bio, display name, handle, website, location, pronouns and avatar **(call, from Jeff's "anything further")**. Avatars live in `storage.objects`, so its policies need the check as well.

Enforce with database triggers or policies. These must still pass:

- **System updates caused by other people**, such as `replies_count`.
- **Moderator status changes.**
- **Account deletion**, where `auth.uid()` is null. **(call)** Deleting an account stays allowed, and erases or tombstones as it does now.

Still allowed while banned: signing in, reading, downloading, appealing, blocking, following, and answering a vote on their own work (piece 3).

Not allowed while banned **(call)**: ordinary reports, so the Report button can't be used to get back at people. Tickets stay closed as they are today, but `src/lib/tickets.js` says "suspended... for now", which is wrong for a permanent ban.

Mods can still remove any piece, or hide a whole thread with the existing `set_content_mod_status`. That covers Jeff's "the entire thread can be wiped". It stays downloadable by its author.

### The notice

Jeff's text, with the changes discussed. Jeff has the final word on all wording.

**Permanent ban:**

> You've been banned from posting anything further on this site. Don't worry, your writings aren't lost. What you've posted stays up, but locked. You have an option to appeal this ban, to state your case. Whatever the result, you will still be able to download your writings as long as this site exists.

From piece 3 on, add: "You can also answer if members vote on your work."

Directly below it: the reason the mod wrote, then who reviews appeals. Today that line is "The Keeper reads every appeal."

**Suspension (call, drafted for Jeff to edit):**

> You've been suspended from posting until [date]. Don't worry, your writings aren't lost. What you've posted stays up, but locked until then. You have an option to appeal, to state your case. You can still download your writings at any time.

**Where it shows (call):**

- A banner on every page for that signed-in member, linking to the full notice.
- A page of their own with the full notice, Appeal, Download and the trail.
- A bell notification when the sanction is applied or lifted, added inside the RPCs.
- Anywhere they'd normally post, the composer shows the notice rather than a raw database error.

A new RPC such as `my_sanction()` gives the member their own sanction, reason, appeal status and decision, because those columns are private. Keep the same RPC for the banner and the page.

### Appeals

Keep using `reports` with `target_type = 'appeal'` and `target_id` = the sanction's `mod_actions` row. That row is what makes it possible to link the two.

**Filing:** through an RPC bound to the caller's own active sanction. One appeal per sanction, enforced by the database **(Jeff)**. Length 25 to 2000 characters, matching tickets **(call)**. No deadline, except that a suspension can only be appealed while it's active **(call)**.

**Who decides (Jeff):** never the mod who took the action, unless they are a Keeper, and that exception exists only because there are no mods yet. Revisit it once mods exist. Deciding a ban appeal needs `mod_can('ban','all')`, so Sentinels and Moderators can neither decide nor read them **(call)**. Reports RLS needs tightening for this, because today `handle_report` reads every appeal.

**Keeper's own ban:** keep the existing 24-hour wait, for permanent bans only **(call)**. On a suspension it would often outlast the sanction and leave the appeal moot, so a Keeper can decide those straight away.

**Banned members file only this appeal (call):** while sanctioned, they can't use the content Appeal button. Everyone else's content appeals carry on as they do now.

**Changing a sanction (call):** the case file shouldn't offer buttons that stack sanctions by accident. Making a sanction harsher (a longer suspension, or a suspension becoming a permanent ban) counts as a new sanction with its own appeal, and any open appeal on the old one closes as moot. Shortening it is just a lift followed by a shorter suspension, with no new appeal.

**The decision (Jeff):** a written reason is required, and it's final either way.

- **Upheld:** nothing changes. A permanent ban stays permanent, with no further appeal.
- **Overturned:** the sanction ends, the email block is removed, and anything members voted down because of this ban comes back.
- **A later ban for new conduct** is a new sanction with its own appeal **(call, from Jeff's "final either way")**.

**Final binds mods too (Jeff):** once an appeal is decided, only a Keeper can change that outcome, and it's logged like everything else. So `mod_apply_sanction` and `mod_revoke_sanction` must refuse a non-Keeper who tries to lift or alter an upheld sanction, or to sanction a member who won an appeal. The database can't tell new conduct from the same conduct, so that second refusal has no time limit **(call)**: a mod who sees new conduct asks the Keeper. Revisit once mods exist.

If the sanction ends some other way while an appeal is open (expired or revoked), close the appeal as moot, with no further decision **(call)**.

**Notifying people:** the Keeper gets a work-queue task and alert for each new appeal, using the `keeper_tasks` pattern **(call)**. When decided, the member gets the decision and written reason, and the mod who took the action gets the outcome **(call)**.

**Fix while here (call):** the existing story Appeal button must pass a real `mod_actions` id.

### The trail (Jeff)

Visible to the member, and to those involved in the decision:

1. The sanction: date, length, reason.
2. Their appeal text.
3. The decision: upheld or overturned, the written reason, the date, and the decider's role.

The member sees this on their notice page. Wardens and Keepers see it in the case file, which must also show appeal rows, so `resolve_appeal` must set `target_user_id`.

The public ledger shows no member id or reason on user-targeted rows (done in #132), and this applies to appeal decisions too. `AppealsTab`'s placeholder says "published to /transparency", which must not appear for ban appeals. The member's name appears nowhere public.

### Email block (Jeff)

A permanent ban stores a keyed one-way fingerprint of the member's email, with no plain email and no client access. Sign-up with that email is refused with a clear message, by email or Google. Suspensions don't use it.

- `_shared/emailKey.ts` already does this for sealed writing, using `SEAL_EMAIL_KEY_SECRET`. Use the same approach, ideally a separate secret **(call)**.
- Store it when the ban is applied, not when the account is deleted, so it can't be raced **(call)**.
- Remove it when the ban is revoked or overturned, or replaced by a suspension **(call)**.
- `/rules` must disclose this (piece 4), since it's an exception to "delete for real".

The app has no change-email screen today. If one is added, it must honor this.

**Deleting the account while banned (call):** the deletion screen warns that the email can't rejoin and that any open appeal ends with it, and offers Download first. An open appeal closes as moot. "Seal my writing" is removed for permanently banned members, because they couldn't rejoin with that email to restore a seal.

**Lifting the block after deletion (call):** the fingerprint row records which sanction created it. With the profile gone, the ban can't be revoked through the usual button, so no tool is built for this rare case. A Keeper can remove the row by hand if a wrongly banned person gets in touch at the address on `/rules`.

### Mod powers (Jeff)

A banned mod loses all powers while the ban stands, and that applies to suspensions too **(call)**. `mod_can` returns false for a sanctioned caller, including a Keeper. It's an RLS predicate used everywhere, so read `banned_until` in its existing single-row lookup rather than adding a query. Overturning or expiry restores the powers. The client mirror in `moderation.js` can't read `banned_until`, so a sanctioned mod's Terminal must fail closed and not offer controls that error.

## Piece 3: Member votes

Only on the locked work of a **permanently** banned member **(Jeff)**.

**The prompt (Jeff):** signed-in members see "This writer is banned. Should this stay up?" with Keep and Remove, and must write why. Signed-out readers see nothing about it. It must load client-side, and the RPC must have no `anon` grant.

**Who can vote (Jeff):** one voice each, never the author, and not brand-new accounts. "Not brand-new" means an `auth.users` account at least 7 days old **(call)**. Sanctioned members can't vote **(call)**. A vote can't be changed once cast **(call)**.

**Enough Removes (Jeff; numbers are a call):** at least 3 Removes and more Removes than Keeps hides that piece. Keep the numbers in one place so Jeff can raise them as the site grows. It hides, never deletes. The author can still download it.

**What gets hidden (call):**

- A story, post or critique is replaced in place by a generic "Removed." with no author handle. Signed-out readers and crawlers can't tell why, so it never reveals a ban. Signed-in members also see that members voted it down, with the vote panel.
- A thread's opening post: its title and opener become "Removed." and replies stay readable. This follows Jeff's point about keeping dialog. Wiping a whole thread stays a mod action.

The existing tombstone says "Removed by its author", so this needs its own text. A voted-down story's page shouldn't be indexed.

**When votes count (call):** a vote counts when it's cast, and the threshold is checked then. Once a piece is hidden it stays hidden, even if the count later drops. If screening flags a reason, the reason is held back but the vote still counts, because a screening outage must not stop hides, and a hide is reversible. If a voter deletes their account, their vote and reason go with it, and a hide already triggered stands.

**Reversing (call):** a mod can restore a piece, after which it closes to further votes. **Every** way a permanent ban ends (overturned, revoked, or replaced by a suspension) restores every piece hidden by vote, and only those. A piece a mod hid stays hidden. So each hide must record that a vote caused it, and be logged in `mod_actions` with the reasons. `prevent_mod_status_reset` guards `mod_status`, so this needs the same kind of trusted path `apply_automated_mod_status` uses.

**Votes belong to one sanction (call):** when the ban ends, the panel disappears and signed-in members no longer see the reasons, but they stay in the case file. A later permanent ban starts with no votes.

**Not appealable (call):** a piece hidden by vote can't use the content Appeal button. The author's one answer and their ban appeal are their voice.

**The author answers (Jeff: "if they dig a deeper grave then so be it"):** once a piece has a vote, the author can post one written answer on it, shown beside the votes **(call: one answer, no edits, 2000 characters)**. Nowhere else. The Report button and mod removal apply. Votes never affect the ban itself **(call)**.

**Reasons are public to signed-in members, with handles (call).** This favors open dialog and discourages mobbing, but the banned author can see who voted. Reason length up to 280 characters **(call)**. Reasons and the author's answer run through existing screening **(call)**.

The ban itself is what's revealed to signed-in members, not the mod's reason **(call)**.

## Piece 4: Rules rewrite

**Jeff's brief:** `/rules` is a living document. It must be very accurate about what to expect, cut and dry, simple and to the point. It cuts both ways: in favor of writer freedom, but protecting real people.

**Process:** draft plain statements of what the site really does. Jeff edits and has the final word. Don't publish wording Jeff hasn't approved.

**Must cover or correct:**

- Replace "immediate exile (account termination)". Logins now stay.
- What a ban and a suspension do, and that work stays up, locked.
- One appeal, final either way, and who decides.
- Member votes, and that signed-in members can see a ban.
- The email fingerprint, in both Privacy and "Your Content, Your Call".
- The download promise.

**Open for Jeff at that point:** material that's illegal to even possess has to be erased, leaving nothing to download. How the rules word that exception, given the absolute download promise, is Jeff's call.

Keep the `#house-rules` and `#critique-code` anchors, which the footer, sign-in modal and `tests/rules.spec.js` use. The help page should link to the same statements.

## Left to the builder

Table and function names, exact RPC shapes, page routes, banner layout, where the fingerprint is computed (Edge Function or Postgres with Vault), and whether sign-up refusal uses a before-user-created hook or a trigger. Choose whichever gives a clear message instead of a generic database error, and verify it with both email and Google.

## Done means

Each behaviour below is proven in a rolled-back SQL rehearsal or unit tests, and checked live by Jeff where noted.

- A member downloads a zip with all their work, including a mod-hidden story, while banned.
- A permanently banned member sees the notice and reason, can't post or edit anywhere including their bio and avatar, and their work is still visible to a signed-out reader with no ban label in the HTML.
- They file one appeal, and a second is refused. The acting mod can't decide it; a Keeper can.
- Overturning lifts the ban, restores voted-down work and clears the email block. Upholding leaves it final. The member and the acting mod are both told, with the written reason, and it appears in the case file.
- Deleting the account and rejoining with the same email is refused, by both email and Google (Jeff checks live).
- A banned mod's `mod_can` is false everywhere.
- Votes appear only on a permanently banned member's work, only for eligible signed-in members. 3 Removes that outnumber Keeps hide the piece, and the author can answer once.
- `verify-grants.sql` returns zero rows after each migration.
- `/rules` matches all of the above, in words Jeff approved.
