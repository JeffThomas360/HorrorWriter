# Human-Written Stories, PR 1: The Promise and the Stopgap — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The site says stories must be written by the member, asks for that promise at publish, lets members report a story as AI-written, and quietly files a mod-queue note when a story looks like raw chatbot output.

**Architecture:** One additive migration widens `reports.category` and adds a service-role RPC that files an automated report. `screening.ts` gains a story-only fifth question that is read apart from the four safety answers, so it can never hide content or fail closed. The site changes are a rule, a required tick box, and one report option.

**Tech Stack:** Astro 7 + React islands, Supabase (Postgres, Deno edge functions), TypeSafe System One, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-22-human-written-design.md` (the "PR 1" section). PR 2 (staff tag, evidence record) gets its own plan.

## Global Constraints

- Branch `feat/human-written`. Claude opens the PR; Jeff merges. Never push `main`.
- Jeff runs test suites himself. Each task ends with the exact command for him, not a run.
- The automatic check never changes `mod_status`, never notifies the author, never writes `mod_actions`.
- The four safety questions must behave exactly as today for every kind.
- A missing or invalid `machine_written` answer is ignored. It never throws.
- Threshold: `0.85`. Asked only when the kind is `story`.
- New category value: `ai_written`. Label everywhere: `Written by AI`.
- Migration file: `supabase/migrations/20261124000000_ai_written_reports.sql`, ending with `NOTIFY pgrst, 'reload schema';`.
- `file_automated_report` is `REVOKE`d from `PUBLIC, anon, authenticated` and granted to `service_role` only. `scripts/sql/verify-grants.sql` must return zero rows.
- Small or interactive red is `--color-ember`. No `#991B1B`.
- The tick box renders server-side with the form. It is not hidden until JS.
- Rule and tick-box copy is a draft. Jeff rewrites it in his own voice during review; do not polish it.
- Midnight Ritual entries are screened as `post`, so they are outside this PR.

## Review Focus

1. A story published while the edge function is still the old version: the site must publish normally with no note and no error.
2. `file_automated_report` failing (RPC missing because the function deployed before the migration, or the reverse): the publish response must still succeed and the safety screening result must be unchanged.
3. A story edited five times while its automated note is still open: one open note, not five.
4. A mod resolving a report that has no reporter: `resolve_report` must not fail on the null `reporter_id`.
5. A writer restoring a kept story (`KeptStories.jsx` screens as `story`): it gets the question like any publish, and no tick box is needed there.

---

### Task 1: Migration and its SQL test

**Files:**
- Create: `supabase/migrations/20261124000000_ai_written_reports.sql`
- Create: `scripts/sql/test-ai-written-reports.sql`

**Interfaces:**
- Produces: `public.file_automated_report(p_target_type text, p_target_id uuid, p_category text, p_details text) returns boolean`. `true` when a row was inserted, `false` when an open automated report with the same target and category already existed.
- Produces: `reports.category` accepts `'ai_written'`.

- [ ] **Step 1: Write the SQL test.** Copy the header, `begin;`, the `pg_temp.must` / `be` / `be_anon` / `u` / `refused` helpers and the closing `rollback;` shape from `scripts/sql/test-response-email.sql`. Use throwaway ids `...0000000ca0xx` for accounts and `...0000000da0xx` for one story. First block raises `FAIL: the migration is not loaded` when `to_regprocedure('public.file_automated_report(text,uuid,text,text)')` is null. Assertions, each through `pg_temp.must`:
  - as the admin role, `file_automated_report('story', <story>, 'ai_written', 'Automated check: machine_written 0.91')` returns `true`, and the row has `source = 'automated'`, `reporter_id is null`, `status = 'open'`, `category = 'ai_written'`
  - the same call again returns `false` and the count of matching rows is still 1
  - the story's `mod_status` is still `'live'`, and no `notifications` or `mod_actions` row exists for it
  - as a mod (give one throwaway account whatever `resolve_report` requires; read `supabase/migrations/20260610020000_mod_phase2_reports.sql`), `resolve_report(<that report>, 'dismissed', 'x')` succeeds
  - after that, `file_automated_report(...)` returns `true` again
  - as a signed-in member, inserting a `reports` row with `category = 'ai_written'` for the story succeeds
  - `pg_temp.refused` is true for `select public.file_automated_report(...)` as `authenticated` and as `anon`
  - final `select 'ALL PASS';`

- [ ] **Step 2: Write the migration.**
  - Drop and re-add the category check: `alter table public.reports drop constraint reports_category_check, add constraint reports_category_check check (category in ('harassment','spam','urgent','other','ai_written'));` Confirm the constraint's real name first with `npx supabase db query --remote` on `pg_constraint`; the baseline declared it inline.
  - `create function public.file_automated_report(...) returns boolean language plpgsql security definer set search_path = public`: return `false` if a row exists with the same `target_type`, `target_id`, `category`, `source = 'automated'`, `status = 'open'`; otherwise insert `(reporter_id null, target_type, target_id, category, details, source 'automated')` and return `true`.
  - `revoke all … from public, anon, authenticated; grant execute … to service_role;`
  - `NOTIFY pgrst, 'reload schema';`

- [ ] **Step 3: Rehearse.** Jeff runs, in the app terminal, and answers the CLI's production prompt:

```powershell
& .\scripts\sql\rehearse.ps1 -Test scripts\sql\test-ai-written-reports.sql -Migration supabase\migrations\20261124000000_ai_written_reports.sql
```

Expected: final row `ALL PASS`. Then `npx supabase db query --remote -f scripts/sql/verify-grants.sql` is checked after merge (the function only exists inside the rehearsal's rolled-back transaction).

- [ ] **Step 4: Commit** both files: `feat(db): ai_written report category and automated report filing`.

### Task 2: The fifth question in `screening.ts`

**Files:**
- Modify: `supabase/functions/_shared/screening.ts`
- Test: `supabase/functions/_shared/screening.test.ts`

**Interfaces:**
- Produces: `MACHINE_WRITTEN_THRESHOLD = 0.85`
- Produces: `questionsFor(kind: string): Record<string, unknown>`: `SCREEN_QUESTIONS` for every kind, plus `machine_written` when `kind === 'story'`.
- Produces: `parseMachineWritten(raw: unknown): number | null`: the noul probability, or `null` when absent, non-numeric, or outside 0..1. Never throws.
- Produces: `machineWrittenNote(p: number | null): string | null`: `` `Automated check: machine_written ${p.toFixed(2)}` `` when `p >= MACHINE_WRITTEN_THRESHOLD`, else `null`.
- `SCREEN_QUESTIONS`, `THRESHOLDS`, `parseAnswers`, `decide` are unchanged. (The spec said they would take the kind; reading the new answer separately gets the same behaviour with no change to the safety path.)

- [ ] **Step 1: Write the failing tests** (the existing tests stay as they are, which pins "safety path unchanged"):

```ts
describe('machine_written', () => {
  it('is asked for stories only', () => {
    expect(Object.keys(questionsFor('story')).sort()).toEqual(['harassment', 'hate_speech', 'machine_written', 'real_threat', 'sexual_minors'])
    for (const kind of ['post', 'thread', 'critique']) expect(Object.keys(questionsFor(kind))).not.toContain('machine_written')
  })
  it('tells the judge amateur quality is not evidence', () => {
    const q = questionsFor('story').machine_written as { type: string; criteria: { false: string } }
    expect(q.type).toBe('noul')
    expect(q.criteria.false).toMatch(/clumsy|clich|unpolished/i)
  })
  it('reads the probability, and reads anything odd as null without throwing', () => {
    expect(parseMachineWritten({ answers: { machine_written: { noul: 0.91 } } })).toBe(0.91)
    for (const raw of [null, {}, { answers: {} }, { answers: { machine_written: { noul: 'high' } } }, { answers: { machine_written: { noul: 1.5 } } }, { answers: { machine_written: { noul: NaN } } }]) {
      expect(parseMachineWritten(raw)).toBeNull()
    }
  })
  it('notes only at or over the threshold, in numbers only', () => {
    expect(machineWrittenNote(null)).toBeNull()
    expect(machineWrittenNote(MACHINE_WRITTEN_THRESHOLD - 0.01)).toBeNull()
    expect(machineWrittenNote(MACHINE_WRITTEN_THRESHOLD)).toBe('Automated check: machine_written 0.85')
    expect(machineWrittenNote(0.912)).toBe('Automated check: machine_written 0.91')
  })
  it('leaves the four safety answers parsing as before when the fifth is present', () => {
    const raw = { answers: { sexual_minors: { noul: 0.01 }, harassment: { noul: 0.01 }, hate_speech: { noul: 0.01 }, real_threat: { noul: 0.01 }, machine_written: { noul: 0.99 } } }
    expect(decide(parseAnswers(raw))).toEqual({ action: 'pass' })
  })
})
```

- [ ] **Step 2: Implement.** The question, with this exact wording:
  - `instructions`: `'The `content` is raw, unedited output from an AI chatbot, posted as a story.'`
  - `criteria.true`: `'Assistant chatter left in the text ("Certainly! Here is a horror story", "I hope you enjoy"), an echoed prompt, or chat-style headings and bullet scaffolding around the prose'`
  - `criteria.false`: `'Anything else. Clumsy, clichéd, purple or unpolished writing is NOT evidence, and neither is polished writing.'`

- [ ] **Step 3:** Jeff runs `npx vitest run supabase/functions/_shared/screening.test.ts`. Expected: all pass.

- [ ] **Step 4: Commit:** `feat(screening): story-only machine_written question, read apart from safety`.

### Task 3: Wire it into `moderate-content`

**Files:**
- Modify: `supabase/functions/moderate-content/index.ts`

**Interfaces:**
- Consumes: `questionsFor`, `parseMachineWritten`, `machineWrittenNote` (Task 2); `file_automated_report` (Task 1).

- [ ] **Step 1:** Pass `questions: questionsFor(targetType)` to `judge`.
- [ ] **Step 2:** Right after a successful `judge` and before the pass/screen branch: when `targetType === 'story'`, compute `machineWrittenNote(parseMachineWritten(raw))`. If it is a string, call `supabaseAdmin.rpc('file_automated_report', { p_target_type: 'story', p_target_id: targetId, p_category: 'ai_written', p_details: note })`. Log an RPC error with `console.error('[moderate-content] could not file ai_written note', error)` and carry on: it must not throw, and it must not change the response body.
- [ ] **Step 3:** The `judge` failure path stays as it is (screens for human review, files no note).
- [ ] **Step 4:** No unit test exists for `index.ts` (Deno). Re-read the diff against Review Focus 1 and 2. Commit: `feat(moderate-content): file a quiet note for machine-written stories`.

### Task 4: "Written by AI" report reason

**Files:**
- Create: `src/lib/reportCategories.js`
- Test: `src/lib/reportCategories.test.js`
- Modify: `src/components/ReportModal.jsx`, `src/components/ReportModal.test.jsx`
- Modify: `src/components/mod/ReportsTab.jsx`

**Interfaces:**
- Produces: `REPORT_CATEGORIES` (ordered `[{ value, label, only? }]`: the four existing options with their current labels, then `{ value: 'ai_written', label: 'Written by AI', only: 'story' }`), `categoriesFor(targetType)`, `categoryLabel(value)` (falls back to the raw value).

- [ ] **Step 1: Failing tests.** In `ReportModal.test.jsx`, the story test's expected list gains `'Written by AI'` as the last option; add a test that `targetType="post"` and `targetType="critique"` do not offer it. In `reportCategories.test.js`: `categoryLabel('ai_written') === 'Written by AI'`, `categoryLabel('mystery') === 'mystery'`.
- [ ] **Step 2: Implement.** `ReportModal` renders its options from `categoriesFor(targetType)`. `ReportsTab` shows `categoryLabel(r.category)` in the card heading, and where it prints the reporter, shows `Automated check` instead of `Unknown` when `r.source === 'automated'`. Include the label in the search haystack.
- [ ] **Step 3:** Jeff runs `npx vitest run src/components/ReportModal.test.jsx src/lib/reportCategories.test.js`. Expected: all pass.
- [ ] **Step 4: Commit:** `feat: report a story as written by AI`.

### Task 5: The rule and the promise

**Files:**
- Modify: `src/pages/rules.astro` (House Rules list, after rule 3)
- Modify: `src/pages-react/PublishStory.jsx` (the submit row, around line 432), `src/pages-react/PublishStory.test.jsx`
- Modify: `tests/library.spec.js` (both publish flows, lines ~39–57 and ~94–104)

- [ ] **Step 1: Failing tests** in `PublishStory.test.jsx`:
  - the form shows a checkbox with accessible name matching `/I wrote this myself/i`, unticked, for a new story and for `bookId="b1"`
  - submitting with title, lede and content filled but the box unticked shows `Tick the box to confirm you wrote this story yourself.` and does not insert (the `from('books')` insert mock is not called)
  - the label contains a link to `/rules/#house-rules`
- [ ] **Step 2: Rule 4** in `rules.astro`, same markup as rules 1–3. Title `4. Written by You.` Body: `Every story here was written by the member who posted it. Spellcheck and dictation are fine. A story a chatbot wrote for you is not, and will be removed.`
- [ ] **Step 3: The tick box.** State `wroteIt` (default `false`, not saved in the draft). A `<label>` wrapping `<input type="checkbox" required>` and the text `I wrote this myself. No AI wrote it for me.` followed by a link `House Rule 4` to `/rules/#house-rules`, placed directly above the submit row. `handleSubmit` checks it after the existing required-fields check and sets the error string from Step 1. The label is at least 44px tall to tap.
- [ ] **Step 4:** In `tests/library.spec.js`, tick the box (`page.getByRole('checkbox', { name: /I wrote this myself/i }).check()`) before each click on the publish button.
- [ ] **Step 5:** Jeff runs `npm run test:unit`, then `cmd /c npx playwright test tests/library.spec.js`. Expected: all pass.
- [ ] **Step 6: Commit:** `feat: house rule 4 and the "I wrote this myself" promise at publish`.

### Task 6: Open the PR

- [ ] **Step 1:** Push `feat/human-written`, open the PR against `main`. Body lists: what a member sees, what staff see, the rehearsal result, and the after-merge step `npx supabase functions deploy moderate-content --use-api`.
- [ ] **Step 2:** On the PR's Workers preview: `/rules` shows rule 4; `/library/publish` shows the tick box with JS disabled; a story's report dialog offers "Written by AI" and a forum post's does not.
- [ ] **Step 3:** After merge and function deploy, Jeff publishes a test story that opens with `Certainly! Here is a horror story about a haunted lighthouse:` and confirms it stays live and an `ai_written` report from `Automated check` appears in Moderation → Reports. Then he dismisses it and deletes the story.
