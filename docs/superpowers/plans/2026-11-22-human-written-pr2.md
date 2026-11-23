# Human-Written Stories, PR 2: The Staff Tag and the Evidence — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Staff can tag any submission "Suspected AI" with a note, see everything tagged, and read a per-story evidence record (the machine's score, and how the text reached the editor) when they judge.

**Architecture:** Three staff-only tables (the tag, its history, the evidence) with RLS on and no policies; every read and write goes through security-definer RPCs, as `member_arrivals` does. The story editor counts typed, pasted, dictated and imported characters from each change's `inputType` and sends the counts once at publish. `moderate-content` saves the `machine_written` score for every story.

**Tech Stack:** Astro 7 + React islands, Supabase (Postgres, Deno edge functions), vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-22-human-written-design.md` (the "PR 2" section).

## Global Constraints

- Starts after PR 169 is merged. Branch `feat/suspected-ai-tag` from `main`. Claude opens the PR; Jeff merges.
- Jeff runs the full unit suite, Playwright and the rehearsal. Single test files may be run while building.
- Staff-only means staff-only: nothing here may write to `mod_actions`. `get_transparency_log()` publishes every `mod_actions` row (action, target id, reason) to the public. The tag's history lives in `ai_suspicion_log`.
- No client can select from or write to the three new tables. RLS on, no policies, table privileges revoked from `anon` and `authenticated`.
- Tagging and reading evidence need `mod_can('screen', mod_area(target_type))` (moderator, warden, keeper). The client gate is `modCan(profile, 'screen', area)`.
- The tag changes nothing else: no `mod_status` change, no notification, no public mark.
- Evidence is counts only. Never the keystrokes, never the pasted text. Every number is clamped in the database.
- The record is sent by the writer's own browser and can be faked. The caveat text (see Task 4) is shown wherever staff read it.
- When a submission is deleted its tag and evidence rows are deleted. When the author's account is deleted, all three tables cascade.
- Migration file: `supabase/migrations/20261125000000_ai_suspicion.sql` (take the next free number if that one is used). Ends with `NOTIFY pgrst, 'reload schema';`. Additive.
- Each client-callable RPC: `revoke all … from public, anon; grant execute … to authenticated;` and a row in the `scripts/sql/verify-grants.sql` allowlist. `record_machine_score` is `service_role` only.
- Hooks before early returns in islands. Small red is `--color-ember`.
- The privacy sentence on `/rules` ships in this PR and is a draft for Jeff to reword.

## Review Focus

1. A writer drafts over three evenings, restoring the draft each time: staff must see three sittings and the summed counts, not one two-minute sitting.
2. A writer imports a `.docx` with the editor's own import button: it must read as "imported", not as typed and not as a chatbot paste.
3. `record_compose_signals` called with junk (strings for numbers, negative or huge values, another member's story, extra keys): nothing is stored that the clamp does not allow, and the publish still succeeds.
4. A thread page with fifty posts opened by a moderator: one call for tag state, not fifty.
5. A member who is not staff: no RPC here returns anything to them, and no page shows the tick, the tab or the evidence.

---

### Task 1: Migration and its SQL test

**Files:**
- Create: `supabase/migrations/20261125000000_ai_suspicion.sql`
- Create: `scripts/sql/test-ai-suspicion.sql`
- Modify: `scripts/sql/verify-grants.sql` (allowlist rows)

**Interfaces — Produces:**

Tables:
- `ai_suspicions (target_type text check in ('story','critique','thread','post'), target_id uuid, author_id uuid references profiles on delete cascade, tagged_by uuid references profiles on delete set null, tagged_at timestamptz default now(), note text, primary key (target_type, target_id))`
- `ai_suspicion_log (id uuid pk default gen_random_uuid(), target_type text, target_id uuid, author_id uuid references profiles on delete cascade, actor_id uuid references profiles on delete set null, action text check in ('tag','untag'), note text, created_at timestamptz default now())`
- `submission_evidence (id uuid pk default gen_random_uuid(), story_id uuid not null, author_id uuid references profiles on delete cascade, source text check in ('machine','compose'), machine_score numeric, compose jsonb, recorded_at timestamptz default now())`, index on `(story_id, recorded_at desc)`. One row per writer per publish: the function writes a `machine` row, the browser a `compose` row. (The spec said one row per publish; two independent writers cannot share one without a join key.)

RPCs:
- `mod_set_ai_suspected(p_target_type text, p_target_id uuid, p_suspected boolean, p_note text) returns void`. Raises without `mod_can('screen', mod_area(p_target_type))`, on an unknown type, or when the target does not exist. Tagging upserts the tag (new note, tagger, time); untagging deletes it. Each call that changes something adds one `ai_suspicion_log` row. Author found the way `set_content_mod_status` finds it: `books`, `book_comments`, `threads`, `posts` by type.
- `mod_ai_suspected_list(p_author uuid default null) returns table (target_type text, target_id uuid, author_id uuid, author_handle text, title text, story_id uuid, thread_id uuid, note text, tagged_by_handle text, tagged_at timestamptz, machine_score numeric)`. Newest first. Only rows where `mod_can('screen', mod_area(target_type))`; a caller with none gets zero rows, not an error. `title` is the story or thread title, or `left(content, 120)` for a post or critique. `story_id` is set for a story (itself) and a critique (its book); `thread_id` for a thread (itself) and a post. `machine_score` is the latest `machine` row for a story, else null.
- `mod_ai_evidence(p_target_type text, p_target_id uuid) returns jsonb`: `{ "tag": {note, tagged_by_handle, tagged_at} | null, "machine": {score, recorded_at} | null, "compose": {…counts, recorded_at} | null, "history": [{action, note, actor_handle, created_at}], "reports": <count of reports on the target with category 'ai_written'> }`. `machine` and `compose` are the latest of each and are null for anything but a story. Raises without the `screen` permission.
- `record_compose_signals(p_story_id uuid, p_signals jsonb) returns void`. Silent no-op unless `auth.uid()` is the story's `author_id`. Reads exactly these keys, each `least(greatest(coalesce(value, 0), 0), cap)` and treated as 0 if not a number: `typed`, `pasted`, `dictated`, `imported`, `largest_paste`, `chars_at_open`, `chars_final` (cap 2000000); `pastes` (cap 10000); `sittings` (cap 1000); `active_ms` (cap 2592000000, thirty days). Stores only those keys. Keeps the newest 20 `compose` rows per story.
- `record_machine_score(p_story_id uuid, p_score numeric) returns void`. `service_role` only. No-op when the story does not exist or the score is outside 0..1. Keeps the newest 20 `machine` rows per story.
- Trigger function `forget_ai_records()` with the target type in `TG_ARGV[0]`, `AFTER DELETE` on `books`, `book_comments`, `threads`, `posts`: deletes the matching `ai_suspicions` row and, for a story, its `submission_evidence` rows.

- [ ] **Step 1: Write the SQL test** in the style of `scripts/sql/test-ai-written-reports.sql` (same helpers; ids `...0000000cb0xx`, content `...0000000db0xx`). Actors: a writer, a second member, a moderator with scope `library`, a warden with scope `all`, a sentinel with scope `all`. Content: one story, one critique on it, one thread, one post in it. Assertions:
  - not loaded → `FAIL: the migration is not loaded`
  - warden tags the story with a note → one `ai_suspicions` row, one `tag` log row; `books.mod_status` still `live`; no `notifications` row for the writer; **no `mod_actions` row for the story**; `get_transparency_log(200)` contains no row with the story's id
  - tagging again with a new note → still one tag row, note replaced, two log rows
  - untag → no tag row, an `untag` log row
  - library moderator can tag the story and the critique, and `pg_temp.refused` for the post and the thread
  - sentinel and plain member are refused by `mod_set_ai_suspected` and `mod_ai_evidence`; `mod_ai_suspected_list()` returns zero rows to both
  - library moderator's list shows the story and critique only; warden's shows all tagged; `p_author` filters
  - `record_compose_signals` as the writer with `{"typed": 100, "pasted": -5, "pastes": "many", "largest_paste": 99999999, "evil": "x"}` → one `compose` row whose `compose` is exactly the ten keys, `pasted` 0, `pastes` 0, `largest_paste` 2000000, no `evil`
  - the same call as the second member → no new row
  - 25 calls → 20 `compose` rows
  - `record_machine_score` as admin with 0.91 → a `machine` row; with 1.5 → none; refused for `authenticated` and `anon`
  - `mod_ai_evidence('story', …)` as warden has `machine.score = 0.91`, the clamped `compose`, the `history` in order, and `reports` counting one `ai_written` report inserted for the test
  - a member selecting from each of the three tables is refused
  - deleting the post removes its tag; deleting the story removes its tag and its evidence rows
  - `select 'ALL PASS';` then `rollback;`
- [ ] **Step 2: Write the migration** to the interfaces above. Enable RLS on the three tables and `revoke all on … from anon, authenticated`.
- [ ] **Step 3:** Add allowlist rows to `verify-grants.sql` for `mod_set_ai_suspected`, `mod_ai_suspected_list`, `mod_ai_evidence`, `record_compose_signals` (each `authenticated`, with a one-line why).
- [ ] **Step 4: Rehearse.** Jeff runs in the app terminal and answers the production prompt:

```powershell
& .\scripts\sql\rehearse.ps1 -Test scripts\sql\test-ai-suspicion.sql -Migration supabase\migrations\20261125000000_ai_suspicion.sql
```

Expected: final row `ALL PASS`. Then confirm the rollback with a read-only query: the three tables and the test accounts are absent.
- [ ] **Step 5: Commit:** `feat(db): staff-only AI suspicion tag, its history, and the evidence record`.

### Task 2: Counting how the text reached the editor

**Files:**
- Create: `src/lib/composeSignals.js`
- Test: `src/lib/composeSignals.test.js`

**Interfaces — Produces:**
- `classifyChange(event) → 'typed' | 'pasted' | 'imported'`. No `event.nativeEvent` → `'imported'` (the editor's toolbar and file import call `onChange` with a bare `{ target }`). `nativeEvent.inputType` of `insertFromPaste`, `insertFromDrop` or `insertFromYank` → `'pasted'`. Anything else → `'typed'`.
- `createComposeTracker(saved?, now = Date.now)` → `{ open(length), change(event, prevLength, nextLength), dictated(length), snapshot(finalLength) }`.
  - `open(length)`: sets `chars_at_open`, once; ignored when `saved` already carries one.
  - `change`: growth (`nextLength - prevLength`, ignored when ≤ 0) is added to the bucket `classifyChange` names. A paste also adds 1 to `pastes` and raises `largest_paste`. The time since the previous `change` or `dictated` is added to `active_ms` when it is under 60000 ms.
  - `dictated(length)`: adds to `dictated`.
  - `snapshot(finalLength)` → `{ typed, pasted, pastes, largest_paste, dictated, imported, active_ms, sittings, chars_at_open, chars_final }`.
  - `saved` is an earlier snapshot from the draft: counts carry on from it and `sittings` is its value plus 1. With none, `sittings` is 1.
- `recordComposeSignals(supabase, storyId, snapshot, timeoutMs = 4000) → Promise<void>`: calls the RPC `record_compose_signals`, raced against the timeout, never rejects (same shape as `src/lib/screenContent.js`).

- [ ] **Step 1: Failing tests** in `composeSignals.test.js`:
  - `classifyChange({ target: {} })` is `'imported'`; with `nativeEvent: { inputType: 'insertFromPaste' }` is `'pasted'`; with `insertText`, with `insertReplacementText`, and with a `nativeEvent` that has no `inputType` are `'typed'`
  - typing 10 one-character changes 1 s apart → `typed 10`, `active_ms 9000`, `pastes 0`
  - one paste of 4000 → `pasted 4000`, `pastes 1`, `largest_paste 4000`; a later paste of 500 leaves `largest_paste 4000`, `pastes 2`
  - a deletion (shorter text) changes no count
  - two changes 5 minutes apart add nothing to `active_ms`
  - `dictated(300)` → `dictated 300`
  - a tracker built from a saved snapshot `{ typed: 500, sittings: 2, chars_at_open: 0, … }` then 5 typed → `typed 505`, `sittings 3`
  - `snapshot(4200).chars_final` is `4200`
  - `recordComposeSignals` calls `rpc('record_compose_signals', { p_story_id, p_signals })`, resolves when the RPC rejects, resolves when it never settles (fake timers), and does nothing with a null `supabase` or id
- [ ] **Step 2: Implement.**
- [ ] **Step 3:** `npx vitest run src/lib/composeSignals.test.js`. Expected: all pass.
- [ ] **Step 4: Commit:** `feat: count typed, pasted, dictated and imported text in the story editor`.

### Task 3: Send the counts at publish; save the machine score

**Files:**
- Modify: `src/pages-react/PublishStory.jsx`, `src/pages-react/PublishStory.test.jsx`
- Modify: `supabase/functions/moderate-content/index.ts`
- Modify: `src/pages/rules.astro` (Privacy of the Void)

**Interfaces — Consumes:** Task 2's tracker and `recordComposeSignals`; Task 1's `record_compose_signals` and `record_machine_score`; PR 1's `parseMachineWritten`.

- [ ] **Step 1: Failing tests** in `PublishStory.test.jsx` (mock `../lib/composeSignals`'s `recordComposeSignals`, keep the real tracker):
  - publishing after typing into the manuscript calls `recordComposeSignals` with the new story's id and a snapshot whose `typed` is greater than 0 and `sittings` is 1
  - the autosaved draft in `localStorage` contains a `compose` object
  - restoring a draft that has `compose: { typed: 500, sittings: 1, … }` and then publishing sends `sittings: 2` and `typed` of at least 500
- [ ] **Step 2: PublishStory.** Hold one tracker in a ref. `open(length)` when the form first has its content (0 for a new story, the stored length for an edit). The manuscript's `onChange` calls `tracker.change(e, content.length, e.target.value.length)` before `setContent`. `TranscribeButton`'s `onTranscribed` calls `tracker.dictated(text.length)`. `saveDraft` adds `compose: tracker.snapshot(content.length)`. `handleRestoreDraft` rebuilds the tracker from `draft.compose`. In `onSuccess`, take the snapshot before `clearDraft`, and `await recordComposeSignals(supabase, data.id, snapshot)` right after `screenContent`.
- [ ] **Step 3: moderate-content.** For a story, after a successful `judge`, when `parseMachineWritten(raw)` is a number, call `supabaseAdmin.rpc('record_machine_score', { p_story_id: targetId, p_score })` inside the same guard as the note: an error is logged, never thrown. Do it after the safety decision has been applied, so it cannot delay a screen; move PR 1's note there too.
- [ ] **Step 4: Privacy line.** In `rules.astro`'s privacy paragraph, after the sentence about how you found us, add: `When you publish a story, we note how the text reached the editor: how much was typed, pasted, dictated or imported, and roughly how long it took. We never record the keystrokes or the pasted text. Staff use it only when a story is suspected of being machine-written.` Then check the paragraph's later claim "we do not record what you read" still stands unchanged.
- [ ] **Step 5:** `npx vitest run src/pages-react/PublishStory.test.jsx`. Expected: all pass.
- [ ] **Step 6: Commit:** `feat: record the evidence for each story at publish`.

### Task 4: The tick in the `[MOD]` strip

**Files:**
- Create: `src/lib/aiSuspicion.js`, `src/lib/aiSuspicion.test.js`
- Create: `src/components/mod/AiSuspicionControl.jsx`, `src/components/mod/AiSuspicionControl.test.jsx`
- Modify: `src/components/mod/InlineModControls.jsx`

**Interfaces — Produces** (`src/lib/aiSuspicion.js`):
- `fetchSuspected({ author } = {})` → rows of `mod_ai_suspected_list`.
- `fetchTaggedIds()` → `Promise<Set<string>>` of `target_id`s, from one `mod_ai_suspected_list` call shared by every strip on the page (module-level promise, dropped by `forgetTaggedIds()`).
- `fetchEvidence(targetType, targetId)` → the `mod_ai_evidence` object.
- `setSuspected(targetType, targetId, suspected, note)` → calls `mod_set_ai_suspected`, then `forgetTaggedIds()`.
- `suspicionHref(row)`: story → `/library/read/{target_id}/`; critique → `/library/read/{story_id}/`; thread → `/forum/thread/{target_id}/`; post → `/forum/thread/{thread_id}/#post-{target_id}`.
- `evidenceLine(evidence)` → a one-line string, parts joined by ` · `, each part present only when there is data: `Machine score 0.91`; `4,200 chars, 98% pasted in 1 paste` (percent is `pasted / (typed + pasted + dictated + imported)`, plus `, N% imported` and `, N% dictated` when over 0); `editor in use 2 min over 1 sitting`; `1 member report`. With nothing: `No evidence recorded for this submission.`
- `EVIDENCE_CAVEAT = "The writer's own browser reports these numbers, so they can be faked, and an honest writer who pastes from Word looks pasted. Use them as context, not proof."`

- [ ] **Step 1: Failing tests.** `aiSuspicion.test.js`: `evidenceLine` for the full example above, for a story with only a machine score, for a post (nothing), and for `imported` at 100%; `suspicionHref` for each type; `fetchTaggedIds` makes one RPC call for two callers. `AiSuspicionControl.test.jsx` (mock `../../lib/aiSuspicion`):
  - renders `Suspected AI` unticked for an untagged target and ticked (`aria-pressed="true"`) for a tagged one
  - clicking it opens a dialog titled `Tag as suspected AI?` showing the evidence line and `EVIDENCE_CAVEAT`, with a reason field labelled `What makes you think so?`
  - confirming calls `setSuspected('story', 'b1', true, 'reads like a chatbot')` and the control then shows ticked, with no page reload
  - on a tagged target the dialog is titled `Remove the suspected-AI tag?` and confirming calls `setSuspected(…, false, …)`
- [ ] **Step 2: Implement `AiSuspicionControl({ targetType, targetId })`.** State comes from `fetchTaggedIds()` on mount; evidence from `fetchEvidence` when the dialog opens. Uses `ConfirmDialog` with `withReason`.
- [ ] **Step 3:** In `InlineModControls`, render `<AiSuspicionControl>` inside the strip when `canScreen`. It is a child component, so the existing early return is untouched.
- [ ] **Step 4:** `npx vitest run src/lib/aiSuspicion.test.js src/components/mod/AiSuspicionControl.test.jsx`. Expected: all pass.
- [ ] **Step 5: Commit:** `feat(mod): tag a submission as suspected AI from the mod strip`.

### Task 5: The tagged list, and the case-file marker

**Files:**
- Create: `src/components/mod/SuspectedAiTab.jsx`, `src/components/mod/SuspectedAiTab.test.jsx`
- Modify: `src/pages-react/Moderation.jsx`, `src/pages-react/Moderation.test.jsx`
- Modify: `src/components/mod/UserSubmissions.jsx`, `src/components/mod/UserSubmissions.test.jsx`

(The spec suggested a filter in the Reports tab. A tab of its own is used instead: the rows are submissions, not reports.)

- [ ] **Step 1: Failing tests.**
  - `Moderation.test.jsx`: add `SuspectedAiTab` to the mocked components; a moderator, warden and keeper see `Suspected AI` after `Storms`; a sentinel does not.
  - `SuspectedAiTab.test.jsx` (mock `fetchSuspected`): lists each row with its title linked to `suspicionHref(row)`, `@author_handle`, the note, `tagged by @handle`, the date, and `Machine score 0.91` when present; shows `EVIDENCE_CAVEAT` once above the list; shows `Nothing is tagged.` when empty; an author filter box narrows by handle.
  - `UserSubmissions.test.jsx` (mock `fetchSuspected` to return one of the member's rows): that row shows `Suspected AI` in ember beside its status, and the summary line includes `1 suspected AI`.
- [ ] **Step 2: Implement.** The tab is gated `modCan(profile, 'screen', 'all')` with id `suspected`. `UserSubmissions` calls `fetchSuspected({ author: userId })` beside `fetchUserSubmissions` and matches rows by `id === target_id`; if that call fails the submissions still render, without markers.
- [ ] **Step 3:** `npx vitest run src/pages-react/Moderation.test.jsx src/components/mod/SuspectedAiTab.test.jsx src/components/mod/UserSubmissions.test.jsx`. Expected: all pass.
- [ ] **Step 4: Commit:** `feat(mod): list everything tagged as suspected AI, and mark it in the case file`.

### Task 6: Open the PR

- [ ] **Step 1:** Push, open the PR against `main`. Body: what staff see, what is recorded about a writer and the new privacy sentence, the rehearsal result, and the after-merge step `npx supabase functions deploy moderate-content --use-api`.
- [ ] **Step 2:** Jeff runs `npm run test:unit` and `cmd /c npx playwright test`.
- [ ] **Step 3:** After merge and function deploy, Jeff publishes a test story by pasting it in, opens it, and confirms: the `[MOD]` strip shows `Suspected AI`; the dialog shows a machine score and a paste percentage near 100; tagging it makes it appear under Moderation → Suspected AI and in his own case file; the public transparency log shows nothing about it; signed out, the story page shows no tag. Then he untags and deletes the story, and the list is empty again.
- [ ] **Step 4:** `npx supabase db query --remote -f scripts/sql/verify-grants.sql` returns zero rows.
