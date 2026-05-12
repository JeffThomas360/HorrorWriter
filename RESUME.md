# Resume Here — Ship-Readiness Cleanup

**Paused:** 2026-05-11
**Plan file:** [`docs/superpowers/plans/2026-05-11-ship-readiness-cleanup.md`](docs/superpowers/plans/2026-05-11-ship-readiness-cleanup.md) — 18 tasks total.
**Execution mode:** Subagent-Driven Development (one agent per task + spec/quality reviews).

---

## State of the world

**Branch:** `main`
**Local commits ahead of `origin/main`:** 6 (none pushed yet)

```
b930aab refactor(rituals): replace permanently disabled buttons with Soon chips
ccf82e0 refactor(forum): replace dead affordances with Soon chip
0bb4fab feat(style): add .soon-chip class for not-yet-built feature placeholders
cc39f69 refactor(nav): hide Forum/Library/Rituals links until backend exists
edcaff1 refactor(home): remove fake waitlist 'Summon Me' form
37f34a1 refactor(home): remove fake 'writers active now' live strip
```

`origin/main` is still at `faceb4f` (the CSS-corruption fix). Cloudflare Pages live URL `https://horrorwriter.pages.dev` is currently serving the pre-cleanup build.

---

## Uncommitted Task 7 changes — decide before resuming

The Task 7 implementer edited two files but the changes are **not committed**:

```
 M src/components/SignInModal.jsx
 M src/style.css
```

The edits replace the passkey button's `alert('Passkeys coming soon')` with a real disabled state and add a generic `.btn:disabled` rule. Build passed locally. Two ways to resume:

**Option A — keep the changes and finish Task 7:**
```powershell
git add src/components/SignInModal.jsx src/style.css
git commit -m "refactor(auth): replace passkey alert() with proper disabled state

alert() was jarring against the modal aesthetic. Replaced with a real
disabled button and a 'soon' suffix. Added a generic .btn:disabled
rule so other disabled buttons share the visual treatment."
```
Then run a spec+quality review against the diff and move on to Task 8.

**Option B — discard and re-run Task 7 cleanly:**
```powershell
git checkout src/components/SignInModal.jsx src/style.css
```
Then re-dispatch the Task 7 implementer.

---

## Tasks completed (1-6)

| # | Subject | Commit |
|---|---|---|
| 1 | Remove fake live-strip from Home | `37f34a1` |
| 2 | Remove waitlist section from Home | `edcaff1` |
| 3 | Hide mock pages from primary nav | `cc39f69` |
| 4 | Add `.soon-chip` CSS class | `0bb4fab` |
| 5 | Replace disabled buttons with SOON chips on Forum | `ccf82e0` |
| 6 | Replace disabled buttons with SOON chips on Rituals | `b930aab` |

---

## Tasks remaining (7-18)

| # | Subject | Status |
|---|---|---|
| 7 | Replace passkey alert with disabled state | edits uncommitted |
| 8 | Clean up Footer dead links | not started |
| 9 | Global `:focus-visible` ring | not started |
| 10 | Per-route `document.title` via hook | not started |
| 11 | Extract `<ProfileHead>` + avatar `onError` fallback | not started |
| 12 | Move Profile/UserProfile/RequireAuth inline styles to `.status-panel` class | not started |
| 13 | Handle-change guard on Profile | not started |
| 14 | AuthContext race guard + better error logging | not started |
| 15 | Add `<ErrorBoundary>` at App level | not started |
| 16 | Mobile hero font fix + AuthCallback timeout | not started |
| 17 | Final build verification | not started |
| 18 | Deploy to Cloudflare Pages | not started |

Each task in the plan file has full code, exact files, and the commit message to use. Resume by re-loading the plan and continuing from wherever you left off.

---

## Notes for next session

- **Subagent git-permission caveat:** During Task 5 the implementer subagent hit a "permission denied" stop when running `git add`/`git commit`. Workaround used from Task 6 onward: subagent edits + builds, controller commits in the main session. Keep doing that.
- **Untracked files in working tree:** `TODO.md` and `docs/superpowers/plans/2026-05-11-ship-readiness-cleanup.md` are untracked. The plan file should probably be committed at some point (it's a useful artifact). `TODO.md` is older and may already be stale once the cleanup is deployed.
- **Supabase project name:** HorrorWriter V2, ref `bmvvugrfnuedjlucmlbw`. Pauses after ~1 week of inactivity on free tier — restore via dashboard if needed.
- **Wrangler / Cloudflare:** Authenticated in this Windows session. `wrangler whoami` will confirm. Pages project: `horrorwriter`, production branch `main`, deployed URL `https://horrorwriter.pages.dev`.
- **Last task pattern that worked well:**
  1. Mark task `in_progress` via TaskUpdate
  2. Dispatch implementer (Haiku for mechanical edits, Sonnet for substantive refactors). Tell it: "Do NOT run git commands. Edit + `npm run build` + report."
  3. Controller runs `git add ... && git commit -m "..."` using the exact message from the plan.
  4. Dispatch a single combined spec+quality reviewer (Haiku) for trivial tasks; separate spec then quality reviewers (Sonnet) for tasks touching ≥3 files.
  5. Mark task `completed`.

---

## Quick-start checklist for the next session

1. Read this file.
2. Decide: commit or discard the uncommitted Task 7 changes.
3. Open the plan: `docs/superpowers/plans/2026-05-11-ship-readiness-cleanup.md`.
4. Resume at Task 7 (or 8 if you accept the current edits and review them).
5. After Task 18, the live site at `https://horrorwriter.pages.dev` will be the cleaned-up build.
