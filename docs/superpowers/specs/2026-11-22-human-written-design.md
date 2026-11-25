# Human-written stories: a promise, a quiet stopgap, a staff tag

2026-11-22. Revised the same day after Jeff's review: added the staff tag and the
evidence record. It has grown from a small change to two PRs.

## Why

Jeff wants HorrorWriter to hold amateur, organic writing: stories a person wrote
themselves. Today the site never says so. Nothing on `/rules`, nothing at publish,
no way for a member to report a machine-written story, and nowhere for staff to
record what they concluded.

Catching AI prose is cat and mouse, and Jeff accepts that. The site asks for a
promise and lets people enforce it. One cheap automatic check points staff at the
most obvious slop. Staff record their own judgment as a private tag, with whatever
evidence the site can honestly gather next to it.

## Goals

- The site says plainly that stories must be written by the member.
- A writer makes that promise each time they publish.
- A member can report a story as AI-written.
- Obvious raw chatbot output gets put in front of staff without a report.
- Staff can tag any submission "Suspected AI". The tag is recorded, with who and
  when, and staff can list everything that carries it.
- Each story carries a staff-only evidence record to judge by.

## Not doing

- Blocking AI crawlers, or visitors who arrive from a chatbot.
- Blocking paste, or any outside "AI detector" service.
- A public mark. The tag is staff-only: readers never see it, the writer is not told.
- A new sanction. Removal and appeal use the tools that exist.
- Any automatic consequence. The tag and the evidence change nothing by themselves.

## Would make it a failure

- An honest writer is accused, hidden, or notified by the machine.
- Clumsy, clichéd or unpolished writing gets flagged. Amateur quality is the point
  of the site, not a sign of AI.
- The evidence is read as proof. None of it is. A writer who drafts in Word and
  pastes the story in looks the same as a chatbot paste.
- The site gathers something its privacy section doesn't admit to.

## Approaches

For the automatic check:

1. **A fifth question on the existing TypeSafe call (picked).** Every story is
   already screened with one call at publish. One more yes/no costs no extra call.
   A trip stays quiet: the story stays live, and a note lands in the mod queue.
2. **Plain word-matching, no model.** Free and exact, but only catches leftovers
   like "As an AI". Too narrow on its own.
3. **A dedicated detector service.** Costs money and accuses real writers. Dropped.

For the tag: staff-only (picked by Jeff) over a public mark, because "most likely"
is not certain and a public mark on a wrongly tagged amateur is the failure above.

## PR 1: the promise and the stopgap

**The rule.** A new House Rule 4 on `/rules`, "Written by you." Draft wording for
Jeff to rewrite in his own voice: *Every story here was written by the member who
posted it. Spellcheck and dictation are fine. A story a chatbot wrote for you is
not, and will be removed.*

**The promise.** `PublishStory.jsx` gets a required tick box above the submit
button, on new stories and on edits: "I wrote this myself. No AI wrote it for me."
It links to the rule. It renders server-side like the rest of the form. The tick is
not stored: no story can be published without it. (Claude's call.)

**The report reason.** `reports.category` gains `ai_written`. `ReportModal.jsx`
shows it as "Written by AI" when the target is a story. The Reports tab needs a
label for it.

**The stopgap.** `_shared/screening.ts` gains a fifth question, `machine_written`,
asked only when `kind` is `story`:

- true: raw, unedited chatbot output. Assistant chatter left in ("Certainly! Here
  is a horror story…", "I hope you enjoy"), an echoed prompt, chat-style headings
  and bullet scaffolding around the prose.
- false: anything else. Clumsy, clichéd, purple or unpolished writing is NOT
  evidence, and neither is polished writing.

Kept vague and general on purpose. Threshold starts high (0.85, a placeholder to
tune on real stories).

It does not go through `decide()`'s screening path, because that hides the content
and notifies the author. Instead:

- `parseAnswers` and `decide` take the kind, so the four safety questions behave
  exactly as now for every kind, and a missing `machine_written` answer never
  fails closed.
- A trip returns a separate result. `moderate-content` then calls a new
  service-role-only RPC, `file_automated_report(p_target_type, p_target_id,
  p_category, p_details)`, which inserts an open `reports` row with
  `source = 'automated'`, no reporter, category `ai_written`, and the score in
  `details`. It skips the insert when an open automated `ai_written` report
  already exists for that story, so edits don't pile up notes.
- `mod_status` is untouched. No notification. No `mod_actions` row.
- If a safety question also trips, the story is screened as today and the note is
  still filed.

**Migration.** Widen the `reports.category` check, create `file_automated_report`
(revoked from public, anon, authenticated; granted to `service_role`),
`NOTIFY pgrst`. Additive.

## PR 2: the staff tag and the evidence

**The tag.** A new table, `ai_suspicions`: one row per tagged submission
(`target_type`, `target_id`, `author_id`, `tagged_by`, `tagged_at`, `note`), unique
on the target. One table rather than a column on four, so "everything tagged" and
"everything tagged from this member" are one query each. No client can read or
write it directly; everything goes through mod RPCs.

- `mod_set_ai_suspected(p_target_type, p_target_id, p_suspected, p_note)`: allowed
  for anyone who can screen that area (`mod_can('screen', area)`). Tagging inserts
  the row; untagging deletes it. Both write a row to a staff-only history table,
  `ai_suspicion_log`, with the note, so the trail survives an untag. (Corrected
  while planning: the first draft said `mod_actions`, but the public transparency
  log publishes every `mod_actions` row, which would have made the tag public.)
- Works on stories, Ritual entries, critiques, threads and replies.
- When the submission is deleted, its tag and evidence go with it. That is the
  site's deletion policy. The history rows stay until the author's account is deleted.

**Where staff see it.**

- `InlineModControls.jsx`, the `[MOD]` strip on every submission, gains a
  "Suspected AI" tick. Ticking opens the existing confirm dialog with a note field
  ("What makes you think so?"). The strip shows the tag's state, so a second mod
  sees it is already tagged.
- `UserSubmissions.jsx` (the case file) marks tagged rows and adds a count to the
  summary line, e.g. "2 suspected AI". This is where a pattern shows.
- A site-wide list of everything tagged, newest first, with the member, the note,
  and who tagged it. (Claude's call: a filter in the Reports tab, unless the
  builder finds a better home.)

**The evidence record.** A new staff-only table, `submission_evidence`, one row per
story per publish or edit. Stories only in this PR. It holds two things:

1. *The machine's opinion.* The `machine_written` score, saved for every story,
   not only the ones over the threshold. Written by `moderate-content`.
2. *How the text reached the editor.* Counted in the story editor and sent at
   publish: characters typed, characters pasted, number of pastes, the largest
   single paste, characters dictated, minutes the editor was in use, and how many
   sittings the draft was saved across. Counts only. Never the keystrokes, never
   the pasted text. Written by the author's own browser through an RPC that only
   accepts their own story and clamps every number.

Staff read it beside the tag: in the tick's dialog and on the tagged list, e.g.
"Machine score 0.91 · 4,200 chars, 98% pasted in 1 paste · editor open 2 min".
A mod's own note and members' reports sit with it, since reports already attach to
the story.

What the record is worth, said once on the screen where staff read it: the browser
reports these numbers, so a determined cheat can fake them, and an honest writer
who pastes from Word looks pasted. It is context for a human judgment.

**Privacy line.** Jeff approved recording this (2026-11-22). `/rules` says what the
site keeps, so the line ships in the same PR. Draft for Jeff to reword: *When you publish a story, we note how the
text reached the editor: how much was typed, pasted or dictated, and roughly how
long it took. We never record the keystrokes or the pasted text. Staff use it only
when a story is suspected of being machine-written.*
**Migration.** Create both tables with RLS on and no policies, the mod RPCs
(`GRANT EXECUTE … TO authenticated`, permission checked inside), the author's
evidence RPC, cleanup on delete, `NOTIFY pgrst`. Additive. After it,
`scripts/sql/verify-grants.sql` must return zero rows.

## Left to the builder

- How the Reports tab reads an automated report with no reporter today.
- Whether Midnight Ritual entries are screened as `story`. If they are, they get the
  question and the score; if not, they stay out.
- How `reports` rows are cleaned up when their target is deleted, and doing the same
  for the two new tables.
- Counting dictated text: how Dictate inserts into `MarkdownEditor`.
- Keeping the editor counts across a saved draft (`draftAutosave`), so a story
  written over three evenings isn't reported as one two-minute sitting.
- Tests: `screening` per-kind question sets and the quiet result, `ReportModal`
  option by target type, the publish tick box, the mod tick, the case-file marker,
  SQL tests for each RPC including who may call it.

## Shipping

Each PR's merge applies its migration and deploys the site; each migration is
rehearsed in `begin; … rollback;` first. After each merge, by hand:
`npx supabase functions deploy moderate-content --use-api`. Until that runs, the
rule, the promise, the report reason and the tag work, and the automatic check and
the machine score are simply off.
