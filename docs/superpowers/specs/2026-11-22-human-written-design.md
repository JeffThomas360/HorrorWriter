# Human-written stories: a promise, and a quiet stopgap

2026-11-22. Short design (a small change).

## Why

Jeff wants HorrorWriter to hold amateur, organic writing: stories a person wrote
themselves. Today the site never says so. Nothing on `/rules`, nothing at publish,
no way for a member to report a machine-written story.

Catching AI prose is cat and mouse, and Jeff accepts that. The site asks for a
promise and lets people enforce it. On top, one cheap automatic check points Jeff at
the most obvious slop.

## Goals

- The site says plainly that stories must be written by the member.
- A writer makes that promise each time they publish.
- A member can report a story as AI-written.
- Obvious raw chatbot output gets put in front of Jeff without anyone having to report it.

## Not doing

- Blocking AI crawlers, or visitors who arrive from a chatbot.
- Watching typing, blocking paste, or any outside "AI detector" service.
- A new sanction. Removal and appeal use the tools that exist.

## Would make it a failure

- An honest writer is accused, hidden, or notified by the machine. The automatic
  check never hides a story and never tells the writer anything.
- Clumsy, clichéd or unpolished writing gets flagged. Amateur quality is the point
  of the site, not a sign of AI.

## Approaches

1. **A fifth question on the existing TypeSafe call (picked).** Every story is
   already screened with one call at publish. One more yes/no costs no extra call.
   A trip stays quiet: the story stays live, and a note lands in the mod queue.
2. **Plain word-matching, no model.** Free and exact, but only catches leftovers
   like "As an AI". Too narrow on its own.
3. **A dedicated detector service.** Costs money and accuses real writers. Dropped.

Jeff picked 1, with the quiet flag.

## The design

**The rule.** A new House Rule 4 on `/rules`, "Written by you." Draft wording for
Jeff to rewrite in his own voice: *Every story here was written by the member who
posted it. Spellcheck and dictation are fine. A story a chatbot wrote for you is
not, and will be removed.*

**The promise.** `PublishStory.jsx` gets a required tick box above the submit
button, on new stories and on edits: "I wrote this myself. No AI wrote it for me."
It links to the rule. It renders server-side like the rest of the form. The tick is
not stored: no story can be published without it, so the rule and the publish date
are the record. (Claude's call.)

**The report reason.** `reports.category` gains `ai_written`. `ReportModal.jsx`
shows it as "Written by AI" when the target is a story. The mod queue needs a label
for it.

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

**Migration.** One numbered migration: widen the `reports.category` check, create
`file_automated_report` (revoked from public, anon, authenticated; granted to
`service_role`), `NOTIFY pgrst`. Additive, so no backup run is needed, but it is
rehearsed in `begin; … rollback;` like every migration.

## Left to the builder

- Where the mod queue lists reports, and how an automated report with no reporter
  reads there today.
- Whether Midnight Ritual entries are screened as `story`. If they are, they get the
  question too; if not, they stay out of this change.
- Tests: `screening` per-kind question sets and the quiet result, `ReportModal`
  option by target type, the publish tick box, a SQL test for the RPC and the
  duplicate guard.

## Shipping

Merge applies the migration and deploys the site. Then by hand:
`npx supabase functions deploy moderate-content --use-api`. Until that runs, the
rule, the promise and the report reason work and the stopgap is simply off.
