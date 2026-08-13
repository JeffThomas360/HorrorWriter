# VHS Aesthetic Pass — Phase 1: Tokenize + Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the half-built design-token system with the full VHS palette and typeface set, so that no hardcoded colour values remain in `src/` and later phases can restyle by editing tokens alone.

**Architecture:** Tailwind v4 `@theme` in `src/styles/global.css` is the single source of colour truth. New tokens are added alongside temporary aliases that keep existing Tailwind utility classes (`bg-primary`, `text-accent-crimson`) working while call sites migrate file-by-file. A source-scanning vitest guard ratchets an allowlist down to empty, then the aliases are deleted. Fonts are self-hosted `woff2` under `public/fonts/`.

**Tech Stack:** Astro 7, React 19 islands, Tailwind CSS v4, vitest 4, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-12-vhs-aesthetic-design.md` (§2 palette, §3 typography, §4 tokenization debt)

## Global Constraints

- **Open-licence assets only.** All fonts OFL, self-hosted under `public/fonts/`. No CDN loading at runtime — `font-src 'self'` in `public/_headers` must keep working.
- **Never touch `Permissions-Policy` in `public/_headers`.** `microphone=(self)` must stay exactly as-is; `microphone=()` silently kills Dictate in production with no error anywhere.
- **`withProviders` is a NAMED export** from `src/components/Providers.jsx`. Never convert to a default import.
- **Hooks before early returns** in island components.
- **No new dependencies.** No `framer-motion`, no icon libraries, no CSS-in-JS.
- **`wrangler.toml` has no `main` or `[assets]` on purpose** — do not add them.
- **Do not downgrade vite** — `package.json` `overrides` pins `vite ^8`, plus `undici ^7.29.0` and `nanoid ^3.3.17` for CVE fixes.
- Every task ends green on `npx vitest run` and `npm run build`.

## Palette reference (exact values — copy verbatim)

| Token | Value |
|---|---|
| `--color-void` | `#08090C` |
| `--color-surface` | `#0F1116` |
| `--color-raised` | `#161922` |
| `--color-line` | `#232733` |
| `--color-line-hi` | `#333A4A` |
| `--color-bone` | `#E8E4DA` |
| `--color-ash` | `#8B8F98` |
| `--color-blood` | `#C8102E` |
| `--color-ember` | `#FF3B2F` |
| `--color-upside` | `#19A5B8` |

**Mechanical transform for the whole sweep — exactly two rules:**

- `#2d2d2a` (any case) → `var(--color-line)`
- `#991B1B` (any case) → `var(--color-blood)`

Inside Tailwind arbitrary values this stays in brackets: `border-[#2d2d2a]` → `border-[var(--color-line)]`. Do **not** convert to bare utilities (`border-line`) in this phase — bracketed `var()` is universally safe across `border-t`, `divide-`, `ring-`, and gradient positions, and keeps the diff reviewable.

## File Structure

| File | Responsibility |
|---|---|
| `public/fonts/*.woff2` | Self-hosted font binaries. Add Fraunces VF + IBM Plex Mono 400/500; delete both Cinzel files. |
| `src/styles/fonts.css` | `@font-face` declarations only. |
| `src/styles/global.css` | `@theme` token definitions + base element styling. The single source of colour truth. |
| `src/styles/designTokens.test.js` | **New.** Source-scanning guard: asserts token definitions exist and that no legacy hex survives outside a shrinking allowlist. |
| `src/pages/og/story/[id].png.js` | Runs in a Worker with no CSS — needs a **JS constant**, not a CSS variable. Special case. |

---

## Task 1: Font assets and `fonts.css`

**Files:**
- Create: `public/fonts/fraunces-variable-normal.woff2`, `public/fonts/ibm-plex-mono-400-normal.woff2`, `public/fonts/ibm-plex-mono-500-normal.woff2`
- Delete: `public/fonts/cinzel-400-normal.woff2`, `public/fonts/cinzel-700-normal.woff2`
- Modify: `src/styles/fonts.css`
- Test: `src/styles/designTokens.test.js` (created here, extended in Task 3)

**Interfaces:**
- Produces: font families `'Fraunces'` (weight 400–900 variable), `'IBM Plex Mono'` (400, 500), `'Merriweather'` (unchanged). Task 2 consumes these family names.

**Context the implementer needs:** Fraunces is a variable font with four axes — `opsz`, `wght`, `SOFT`, `WONK`. The design uses `SOFT 30` and `WONK 1` for flared terminals. **The Fontsource build (`fraunces:vf`) ships `wght` only and will silently ignore `SOFT`/`WONK`.** Use the Google-served file below, which carries all four axes (verified: 121 KB latin subset vs 36 KB for the wght-only build). If the axes ever fail to apply, the type still renders correctly at weight 900 — the design degrades gracefully rather than breaking.

- [ ] **Step 1: Download the three font files**

```bash
cd public/fonts
curl -sL -A "Mozilla/5.0 Chrome/120" \
  -o fraunces-variable-normal.woff2 \
  "https://fonts.gstatic.com/s/fraunces/v38/6NUV8FyLNQOQZAnv9ZwIlOk.woff2"
curl -sL -o ibm-plex-mono-400-normal.woff2 \
  "https://cdn.jsdelivr.net/fontsource/fonts/ibm-plex-mono@latest/latin-400-normal.woff2"
curl -sL -o ibm-plex-mono-500-normal.woff2 \
  "https://cdn.jsdelivr.net/fontsource/fonts/ibm-plex-mono@latest/latin-500-normal.woff2"
```

- [ ] **Step 2: Verify all three downloaded as real fonts, not error pages**

```bash
file public/fonts/fraunces-variable-normal.woff2 \
     public/fonts/ibm-plex-mono-400-normal.woff2 \
     public/fonts/ibm-plex-mono-500-normal.woff2
```

Expected: each reports `Web Open Font Format (Version 2)`. Approximate sizes: Fraunces ~121 KB, each Plex Mono ~15 KB. **If any file is under 1 KB it is an HTML error page — stop and re-fetch.**

- [ ] **Step 3: Write the failing test**

Create `src/styles/designTokens.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FONTS_CSS = join(__dirname, 'fonts.css')
const FONT_DIR = join(__dirname, '..', '..', 'public', 'fonts')

describe('self-hosted fonts', () => {
  const css = () => readFileSync(FONTS_CSS, 'utf8')

  it('declares the three approved families', () => {
    const src = css()
    expect(src).toMatch(/font-family:\s*'Fraunces'/)
    expect(src).toMatch(/font-family:\s*'IBM Plex Mono'/)
    expect(src).toMatch(/font-family:\s*'Merriweather'/)
  })

  it('no longer declares Cinzel', () => {
    expect(css()).not.toMatch(/Cinzel/i)
  })

  it('loads every font from a local path, never a CDN', () => {
    const urls = [...css().matchAll(/url\(([^)]+)\)/g)].map((m) => m[1].replace(/['"]/g, ''))
    expect(urls.length).toBeGreaterThan(0)
    for (const url of urls) expect(url.startsWith('/fonts/')).toBe(true)
  })

  it('every referenced font file exists on disk', () => {
    const urls = [...css().matchAll(/url\(([^)]+)\)/g)].map((m) => m[1].replace(/['"]/g, ''))
    for (const url of urls) {
      expect(existsSync(join(FONT_DIR, url.replace('/fonts/', '')))).toBe(true)
    }
  })

  it('sets font-display: swap on every face', () => {
    const faces = css().split('@font-face').slice(1)
    expect(faces.length).toBeGreaterThan(0)
    for (const face of faces) expect(face).toMatch(/font-display:\s*swap/)
  })

  it('declares Fraunces as a variable face spanning 400-900', () => {
    expect(css()).toMatch(/font-weight:\s*400\s+900/)
  })
})
```

- [ ] **Step 4: Run the test and confirm it fails**

Run: `npx vitest run src/styles/designTokens.test.js`
Expected: FAIL — Cinzel is still declared and Fraunces/IBM Plex Mono are not.

- [ ] **Step 5: Rewrite `src/styles/fonts.css`**

Replace the two Cinzel blocks with the following, and leave all five existing Merriweather blocks exactly as they are:

```css
@font-face {
  font-family: 'Fraunces';
  font-style: normal;
  font-weight: 400 900;
  font-display: swap;
  src: url('/fonts/fraunces-variable-normal.woff2') format('woff2-variations');
}

@font-face {
  font-family: 'IBM Plex Mono';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('/fonts/ibm-plex-mono-400-normal.woff2') format('woff2');
}

@font-face {
  font-family: 'IBM Plex Mono';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url('/fonts/ibm-plex-mono-500-normal.woff2') format('woff2');
}
```

- [ ] **Step 6: Delete the Cinzel binaries**

```bash
rm public/fonts/cinzel-400-normal.woff2 public/fonts/cinzel-700-normal.woff2
```

- [ ] **Step 7: Run the test and confirm it passes**

Run: `npx vitest run src/styles/designTokens.test.js`
Expected: PASS, 6 tests.

- [ ] **Step 8: Confirm nothing else broke**

Run: `npx vitest run && npm run build`
Expected: full suite green, build clean. Headings will still *reference* Cinzel from `global.css` and now fall back to the generic `serif` — that is expected and Task 2 fixes it.

- [ ] **Step 9: Commit**

```bash
git add public/fonts src/styles/fonts.css src/styles/designTokens.test.js
git commit -m "feat(design): self-host Fraunces and IBM Plex Mono, drop Cinzel"
```

---

## Task 2: Palette tokens and base type

**Files:**
- Modify: `src/styles/global.css`
- Test: `src/styles/designTokens.test.js`

**Interfaces:**
- Consumes: font families from Task 1.
- Produces: the ten `--color-*` tokens listed in the palette reference, plus temporary aliases `--color-bg-primary`, `--color-bg-surface`, `--color-text-primary`, `--color-text-secondary`, `--color-accent-crimson`. Tasks 4–7 consume the new tokens; Task 8 deletes the aliases.

**Context:** The aliases exist because Tailwind v4 generates utility classes from `@theme` names — `--color-bg-primary` is what makes `bg-primary` work in `MainLayout.astro`, and `--color-accent-crimson` powers `selection:bg-accent-crimson`. Deleting them now would break markup across 37 files at once. **The aliases point at the new values**, so the full palette change lands in this one reviewable task and Tasks 4–7 stay mechanical.

- [ ] **Step 1: Write the failing test**

Append to `src/styles/designTokens.test.js`:

```js
const GLOBAL_CSS = join(__dirname, 'global.css')

const PALETTE = {
  '--color-void': '#08090C',
  '--color-surface': '#0F1116',
  '--color-raised': '#161922',
  '--color-line': '#232733',
  '--color-line-hi': '#333A4A',
  '--color-bone': '#E8E4DA',
  '--color-ash': '#8B8F98',
  '--color-blood': '#C8102E',
  '--color-ember': '#FF3B2F',
  '--color-upside': '#19A5B8',
}

describe('VHS palette tokens', () => {
  const css = () => readFileSync(GLOBAL_CSS, 'utf8')

  it.each(Object.entries(PALETTE))('defines %s as %s', (name, value) => {
    expect(css()).toMatch(new RegExp(`${name}\\s*:\\s*${value}\\s*;`, 'i'))
  })

  it('keeps the legacy aliases so existing Tailwind utilities keep resolving', () => {
    const src = css()
    for (const alias of [
      '--color-bg-primary',
      '--color-bg-surface',
      '--color-text-primary',
      '--color-text-secondary',
      '--color-accent-crimson',
    ]) {
      expect(src).toMatch(new RegExp(`${alias}\\s*:`))
    }
  })

  it('sets Fraunces on headings and Merriweather on body', () => {
    const src = css()
    expect(src).toMatch(/font-family:\s*'Fraunces'/)
    expect(src).toMatch(/font-family:\s*'Merriweather'/)
    expect(src).not.toMatch(/Cinzel/i)
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run src/styles/designTokens.test.js`
Expected: FAIL — none of the ten tokens exist and `global.css` still names Cinzel.

- [ ] **Step 3: Replace the `@theme` block and base styles in `src/styles/global.css`**

Replace lines 4–45 (the `@theme` block through the `h1,h2,h3,h4` rule) with:

```css
@theme {
  /* VHS palette — see docs/superpowers/specs/2026-08-12-vhs-aesthetic-design.md §2 */
  --color-void:     #08090C;
  --color-surface:  #0F1116;
  --color-raised:   #161922;
  --color-line:     #232733;
  --color-line-hi:  #333A4A;
  --color-bone:     #E8E4DA;
  --color-ash:      #8B8F98;
  --color-blood:    #C8102E;
  --color-ember:    #FF3B2F;
  --color-upside:   #19A5B8;

  /* TEMPORARY migration aliases — deleted in Task 8 of this phase.
     They keep existing Tailwind utilities (bg-primary, text-accent-crimson, …)
     resolving while call sites migrate. Do not add new usages. */
  --color-bg-primary:     var(--color-void);
  --color-bg-surface:     var(--color-surface);
  --color-text-primary:   var(--color-bone);
  --color-text-secondary: var(--color-ash);
  --color-accent-crimson: var(--color-blood);
}

html,
body {
  background-color: var(--color-void);
  color: var(--color-bone);
  font-family: 'Merriweather', serif;
  line-height: 1.7;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

main.shell {
  max-width: 64rem;
  margin: 0 auto;
  padding: 2rem 1.5rem;
}

.prose-book {
  max-width: 42rem;
  margin: 0 auto;
  font-size: 1.125rem;
  line-height: 1.75;
}

h1,
h2,
h3,
h4 {
  font-family: 'Fraunces', Georgia, serif;
  font-variation-settings: 'SOFT' 30, 'WONK' 1;
  color: var(--color-bone);
  letter-spacing: -0.015em;
}
```

Then update the remaining rules further down the same file:

```css
.vintage-border {
  border: 1px solid var(--color-line);
}

.vintage-card {
  background-color: var(--color-surface);
  border: 1px solid var(--color-line);
  padding: 1.5rem;
}

a {
  transition: color 0.15s ease-in-out;
}

a:hover {
  color: var(--color-blood);
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run src/styles/designTokens.test.js`
Expected: PASS.

- [ ] **Step 5: Confirm the build is clean and look at the result**

Run: `npx vitest run && npm run build && npm run dev`
Open `http://localhost:5173`. Expected: the site is visibly darker and colder, headings are Fraunces, the red is brighter. Borders are still the old warm grey — that is correct at this point; Tasks 4–7 fix them.

- [ ] **Step 6: Commit**

```bash
git add src/styles/global.css src/styles/designTokens.test.js
git commit -m "feat(design): add VHS palette tokens and Fraunces heading type"
```

---

## Task 3: The migration ratchet guard

**Files:**
- Modify: `src/styles/designTokens.test.js`

**Interfaces:**
- Produces: the exported constant `NOT_YET_MIGRATED` — an array of repo-relative paths. Tasks 4–7 each delete entries from it. Task 8 asserts it is empty.

**Context:** This is the harness that makes the sweep safe and reviewable. It mirrors the existing source-scanning pattern in `src/components/Providers.import.test.js`, which already guards the `withProviders` trap the same way. Two tests: one fails if a legacy hex appears outside the allowlist, and one fails if the allowlist names a file that is *already* clean — so the list cannot silently rot.

- [ ] **Step 1: Add the guard to `src/styles/designTokens.test.js`**

First extend the **existing top-of-file imports** — ESM requires imports at module top level, so do not add these further down:

```js
// widen the existing node:fs import to include readdirSync
import { readFileSync, existsSync, readdirSync } from 'node:fs'
// widen the existing node:path import to include relative
import { join, dirname, relative } from 'node:path'
```

Then append the guard itself to the end of the file:

```js
const SRC = join(__dirname, '..')
const EXTS = ['.jsx', '.js', '.astro', '.css']

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (EXTS.some((e) => entry.name.endsWith(e)) && !entry.name.includes('.test.')) {
      out.push(full)
    }
  }
  return out
}

const BANNED = [
  { hex: '#2d2d2a', replacement: 'var(--color-line)' },
  { hex: '#991B1B', replacement: 'var(--color-blood)' },
]

// Files still carrying legacy hex values. Tasks 4-7 empty this list.
// Paths are relative to src/, with forward slashes.
const NOT_YET_MIGRATED = [
  'components/SeriesSidebar.jsx',
  'components/SeriesContextBar.jsx',
  'pages-react/SeriesHub.jsx',
  'pages-react/Profile.jsx',
  'pages-react/ReadStory.jsx',
  'pages-react/MyStories.jsx',
  'pages-react/Forum.jsx',
  'pages-react/Library.jsx',
  'pages-react/ThreadView.jsx',
  'pages-react/PublishStory.jsx',
  'pages-react/UserProfile.jsx',
  'pages-react/MyReports.jsx',
  'pages-react/CreateThread.jsx',
  'pages-react/Moderation.jsx',
  'components/MarkdownEditor.jsx',
  'components/SignInModal.jsx',
  'components/UserMenu.jsx',
  'components/NotificationsBell.jsx',
  'components/TranscribeModal.jsx',
  'components/TranscribeButton.jsx',
  'components/ShareBar.jsx',
  'components/ReportModal.jsx',
  'components/Footer.astro',
  'components/mod/RegistryTab.jsx',
  'components/mod/BadgesTab.jsx',
  'components/mod/UserModProfile.jsx',
  'components/mod/SanctionsTab.jsx',
  'components/mod/FilterRulesTab.jsx',
  'components/mod/SupportTab.jsx',
  'components/mod/ReportsTab.jsx',
  'layouts/MainLayout.astro',
  'pages/index.astro',
  'pages/rules.astro',
  'pages/transparency.astro',
  'pages/og/story/[id].png.js',
]

function offenders() {
  const found = new Map()
  for (const file of walk(SRC)) {
    const rel = relative(SRC, file).split('\\').join('/')
    const text = readFileSync(file, 'utf8')
    const hits = BANNED.filter((b) => new RegExp(b.hex, 'i').test(text)).map((b) => b.hex)
    if (hits.length) found.set(rel, hits)
  }
  return found
}

describe('legacy hex migration', () => {
  it('finds source files to scan', () => {
    expect(walk(SRC).length).toBeGreaterThan(20)
  })

  it('has no hardcoded legacy hex outside the allowlist', () => {
    const unexpected = [...offenders().keys()].filter((f) => !NOT_YET_MIGRATED.includes(f))
    expect(unexpected).toEqual([])
  })

  it('has no stale allowlist entries', () => {
    const dirty = offenders()
    const stale = NOT_YET_MIGRATED.filter((f) => !dirty.has(f))
    expect(stale).toEqual([])
  })
})
```

- [ ] **Step 2: Run it and confirm all three pass**

Run: `npx vitest run src/styles/designTokens.test.js`
Expected: PASS. If "no stale allowlist entries" fails, the listed files are already clean — delete them from `NOT_YET_MIGRATED` and re-run.

- [ ] **Step 3: Prove the guard actually catches a regression**

Temporarily add `border-[#2d2d2a]` to a `className` in `src/pages-react/Home.jsx` — or any file **not** on the list, e.g. `src/components/ProfileHead.jsx`. Run the test.
Expected: FAIL, naming that file. **Revert the edit** and confirm it passes again. Do not commit the temporary edit.

- [ ] **Step 4: Commit**

```bash
git add src/styles/designTokens.test.js
git commit -m "test(design): add ratcheting guard for legacy hex migration"
```

---

## Task 4: Migrate the Series components

**Files:**
- Modify: `src/components/SeriesSidebar.jsx` (23 inline `style={{}}` blocks, 5 × `#2d2d2a`, 16 × `#991B1B`)
- Modify: `src/components/SeriesContextBar.jsx` (6 inline blocks, 1 × `#2d2d2a`, 5 × `#991B1B`)
- Modify: `src/pages-react/SeriesHub.jsx` (2 × `#2d2d2a`, 6 × `#991B1B`)
- Modify: `src/styles/designTokens.test.js` (remove these three from `NOT_YET_MIGRATED`)

**Interfaces:**
- Consumes: tokens from Task 2, guard from Task 3.

**Context:** This is the riskiest task and deliberately comes first while attention is fresh. These three components hold **27 of the 29 hardcoded crimson values** and all 29 inline `style={{}}` blocks — the two problems are the same job. `work/story-series.md` deliberately deferred this migration to the VHS pass, so this closes that debt.

Inline styles stay inline in this phase — only the *values* change. Converting `style={{}}` to Tailwind classes is a Phase 2 concern and mixing it in here would make the diff unreviewable.

- [ ] **Step 1: Confirm the guard currently allows these files**

Run: `npx vitest run src/styles/designTokens.test.js`
Expected: PASS (they are on the allowlist).

- [ ] **Step 2: Replace every legacy hex in the three files**

Apply the two mechanical rules only:
- `#2d2d2a` → `var(--color-line)`
- `#991B1B` → `var(--color-blood)`

In JSX inline styles this looks like:

```jsx
// before
<div style={{ borderBottom: '1px solid #2d2d2a', color: '#991B1B' }}>
// after
<div style={{ borderBottom: '1px solid var(--color-line)', color: 'var(--color-blood)' }}>
```

In `className` arbitrary values:

```jsx
// before
className="border-b border-[#2d2d2a] text-[#991B1B]"
// after
className="border-b border-[var(--color-line)] text-[var(--color-blood)]"
```

Change nothing else — no restructuring, no class conversion, no layout edits.

- [ ] **Step 3: Verify no legacy hex survives in these three files**

```bash
grep -n "2d2d2a\|991B1B" -i src/components/SeriesSidebar.jsx src/components/SeriesContextBar.jsx src/pages-react/SeriesHub.jsx
```

Expected: no output.

- [ ] **Step 4: Remove the three entries from `NOT_YET_MIGRATED`**

Delete these lines from the array in `src/styles/designTokens.test.js`:

```js
  'components/SeriesSidebar.jsx',
  'components/SeriesContextBar.jsx',
  'pages-react/SeriesHub.jsx',
```

- [ ] **Step 5: Run the guard and the full suite**

Run: `npx vitest run`
Expected: PASS. If "no stale allowlist entries" fails, a hex was missed — re-run the Step 3 grep.

- [ ] **Step 6: Verify the Series pages still render**

Run: `npm run build && npm run dev`
Visit `http://localhost:5173/library/series/00000000-0000-0000-0000-000000000000`.
Expected: **200 with the hub layout rendering**, not a 500. This route is the one that broke in production before ([[series-hub-500]]); any 500 here means a `withProviders` import got disturbed — check line 3 of `SeriesHub.jsx` is still `import { withProviders } from '../components/Providers'`.

- [ ] **Step 7: Commit**

```bash
git add src/components/SeriesSidebar.jsx src/components/SeriesContextBar.jsx \
        src/pages-react/SeriesHub.jsx src/styles/designTokens.test.js
git commit -m "refactor(design): tokenize colours in Series components"
```

---

## Task 5: Migrate the remaining `pages-react` islands

**Files:**
- Modify: `src/pages-react/` — `Profile.jsx` (17), `ReadStory.jsx` (12), `MyStories.jsx` (11), `Forum.jsx` (11), `Library.jsx` (10), `ThreadView.jsx` (8), `PublishStory.jsx` (6), `UserProfile.jsx` (5), `MyReports.jsx` (4), `CreateThread.jsx` (4), `Moderation.jsx` (3)
- Modify: `src/styles/designTokens.test.js`

**Context:** Purely mechanical — the same two rules as Task 4, no inline styles involved.

**One verified exception.** `PublishStory.jsx` line 18 holds its only `#991B1B`, and it is inside the `COVER_OPTIONS` array — it is cover-art data, not UI chrome:

```js
const COVER_OPTIONS = [
  { value: 'blood', label: 'Blood', color: '#991B1B' },
  ...
]
```

**Leave that one value untouched here.** It must change in lockstep with the mirrored `COVER_COLORS` map in the OG image Worker, which cannot use CSS variables — Task 7 does both together. Migrate this file's six `#2d2d2a` borders only, and **keep `pages-react/PublishStory.jsx` on the allowlist**.

- [ ] **Step 1: Apply the two mechanical rules across all eleven files**

- `#2d2d2a` → `var(--color-line)`
- `#991B1B` → `var(--color-blood)` — **except** `PublishStory.jsx` line 18, per the exception above

- [ ] **Step 2: Verify borders are clean and only the cover value remains**

```bash
grep -rn "2d2d2a" -i src/pages-react/     # expect: no output
grep -rn "991B1B" -i src/pages-react/     # expect: exactly one hit — PublishStory.jsx COVER_OPTIONS
```

- [ ] **Step 3: Remove the migrated files from `NOT_YET_MIGRATED`**

Delete every `pages-react/*` entry **except** `pages-react/PublishStory.jsx`, which stays until Task 7.

- [ ] **Step 4: Run the full suite and build**

Run: `npx vitest run && npm run build`
Expected: green and clean. The guard's "no stale allowlist entries" test confirms `PublishStory.jsx` is legitimately still dirty and correctly still listed.

- [ ] **Step 5: Commit**

```bash
git add src/pages-react src/styles/designTokens.test.js
git commit -m "refactor(design): tokenize colours in page islands"
```

---

## Task 6: Migrate `src/components/`

**Files:**
- Modify: `src/components/` — `MarkdownEditor.jsx` (8), `SignInModal.jsx` (5), `UserMenu.jsx` (4), `NotificationsBell.jsx` (4), `TranscribeModal.jsx` (3), `ShareBar.jsx` (2), `ReportModal.jsx` (2), `TranscribeButton.jsx` (1), `Footer.astro` (2)
- Modify: `src/components/mod/` — `RegistryTab.jsx` (3), `BadgesTab.jsx` (3), `UserModProfile.jsx` (2), `SanctionsTab.jsx` (2), `FilterRulesTab.jsx` (2), `SupportTab.jsx` (1), `ReportsTab.jsx` (1)
- Modify: `src/styles/designTokens.test.js`

**Context:** Mechanical, same two rules. `TranscribeButton.jsx` and `TranscribeModal.jsx` are part of the Dictate feature — change colour values only; touch nothing related to microphone permissions or the Worker endpoint.

- [ ] **Step 1: Apply the two mechanical rules to all sixteen files**

- `#2d2d2a` → `var(--color-line)`
- `#991B1B` → `var(--color-blood)`

- [ ] **Step 2: Verify**

```bash
grep -rn "2d2d2a\|991B1B" -i src/components/
```

Expected: no output.

- [ ] **Step 3: Remove all `components/*` entries from `NOT_YET_MIGRATED`**

- [ ] **Step 4: Run the full suite and build**

Run: `npx vitest run && npm run build`
Expected: green and clean. `Providers.import.test.js` must still pass — 29 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components src/styles/designTokens.test.js
git commit -m "refactor(design): tokenize colours in shared components"
```

---

## Task 7: Migrate Astro pages, layout, and the OG generator

**Files:**
- Modify: `src/layouts/MainLayout.astro` (4), `src/pages/index.astro` (3), `src/pages/rules.astro` (5), `src/pages/transparency.astro` (1)
- Modify: `src/pages/og/story/[id].png.js` — **JS constant, not a CSS variable**
- Modify: `src/pages-react/PublishStory.jsx` — `COVER_OPTIONS`, if deferred from Task 5
- Modify: `src/styles/designTokens.test.js` — `NOT_YET_MIGRATED` becomes `[]`

**Context:** `src/pages/og/story/[id].png.js` renders Open Graph images inside a Cloudflare Worker via `workers-og`. **There is no CSS there — `var(--color-blood)` will not resolve and will produce a broken image.** It needs a literal hex. Its `COVER_COLORS` map mirrors `PublishStory.jsx`'s `COVER_OPTIONS`, and the file says so in a comment; the two must be changed together or story covers and their share images will disagree.

Per spec §10, the `cyan` cover option is currently `#312e81`, which is indigo, not cyan — it is mislabelled. Retarget the three cover colours to the new palette.

- [ ] **Step 1: Migrate the four Astro files**

Apply `#2d2d2a` → `var(--color-line)` and `#991B1B` → `var(--color-blood)`.

Note `MainLayout.astro` also uses Tailwind utility forms (`bg-primary`, `text-text-primary`, `selection:bg-accent-crimson`). **Leave those alone** — they resolve through the aliases and Task 8 handles them.

- [ ] **Step 2: Update the cover palette in `src/pages-react/PublishStory.jsx`**

```js
const COVER_OPTIONS = [
  { value: 'blood', label: 'Blood',   color: '#C8102E' },
  { value: 'cyan',  label: 'Phantom', color: '#19A5B8' },
  { value: 'bone',  label: 'Bone',    color: '#E8E4DA' },
]
```

- [ ] **Step 3: Update the mirrored map in `src/pages/og/story/[id].png.js`**

```js
// Mirrors PublishStory.jsx's COVER_OPTIONS and the design tokens in global.css.
// Literal hex is REQUIRED — this renders in a Worker with no CSS, so
// var(--color-blood) would not resolve.
const COVER_COLORS = {
  blood: '#C8102E',
  cyan: '#19A5B8',
  bone: '#E8E4DA'
}
```

- [ ] **Step 4: Verify the whole tree is clean**

```bash
grep -rn "2d2d2a\|991B1B" -i src/
```

Expected: no output.

- [ ] **Step 5: Empty the allowlist**

`NOT_YET_MIGRATED` becomes `[]`.

- [ ] **Step 6: Run the full suite and build**

Run: `npx vitest run && npm run build`
Expected: green and clean, with `sitemap-index.xml` emitted.

- [ ] **Step 7: Verify the OG image still renders**

Run: `npm run dev`, then open `http://localhost:5173/og/story/00000000-0000-0000-0000-000000000000.png`.
Expected: a PNG renders. **A blank or errored image means a CSS variable leaked into the Worker** — re-check Step 3.

- [ ] **Step 8: Commit**

```bash
git add src/layouts src/pages src/pages-react/PublishStory.jsx src/styles/designTokens.test.js
git commit -m "refactor(design): tokenize Astro pages and retarget cover/OG palette"
```

---

## Task 8: Delete the migration aliases

**Files:**
- Modify: `src/styles/global.css`, `src/layouts/MainLayout.astro`, and any file still using an alias-derived utility
- Modify: `src/styles/designTokens.test.js`

**Context:** Leaving the aliases in place would recreate exactly the two-parallel-systems problem this phase exists to fix — spec §2 requires they be gone before Phase 1 is done.

- [ ] **Step 1: Find every remaining alias usage**

```bash
grep -rn "bg-primary\|bg-surface\|text-text-primary\|text-text-secondary\|accent-crimson\|color-bg-primary\|color-bg-surface\|color-text-primary\|color-text-secondary\|color-accent-crimson" src/
```

Record the list — it drives the next step.

- [ ] **Step 2: Rewrite each usage to the new token**

| Old | New |
|---|---|
| `bg-primary` | `bg-void` |
| `bg-surface` | `bg-surface` (unchanged name, now `#0F1116`) |
| `text-text-primary` | `text-bone` |
| `text-text-secondary` | `text-ash` |
| `accent-crimson` | `blood` (e.g. `selection:bg-accent-crimson` → `selection:bg-blood`) |
| `var(--color-bg-primary)` | `var(--color-void)` |
| `var(--color-bg-surface)` | `var(--color-surface)` |
| `var(--color-text-primary)` | `var(--color-bone)` |
| `var(--color-text-secondary)` | `var(--color-ash)` |
| `var(--color-accent-crimson)` | `var(--color-blood)` |

- [ ] **Step 3: Delete the alias block from `@theme` in `src/styles/global.css`**

Remove the five `--color-bg-primary` … `--color-accent-crimson` lines and their comment.

- [ ] **Step 4: Update the test to assert the aliases are gone**

Replace the "keeps the legacy aliases" test from Task 2 with:

```js
  it('no longer defines the temporary migration aliases', () => {
    const src = css()
    for (const alias of [
      '--color-bg-primary',
      '--color-bg-surface',
      '--color-text-primary',
      '--color-text-secondary',
      '--color-accent-crimson',
    ]) {
      expect(src).not.toMatch(new RegExp(`${alias}\\s*:`))
    }
  })

  it('has an empty migration allowlist', () => {
    expect(NOT_YET_MIGRATED).toEqual([])
  })
```

- [ ] **Step 5: Confirm no alias survives anywhere**

Re-run the Step 1 grep. Expected: no output.

- [ ] **Step 6: Full verification**

Run: `npx vitest run && npm run build`
Expected: all unit tests green, build clean.

- [ ] **Step 7: Run the E2E suite**

Run: `cmd /c npx playwright test`
Expected: all specs pass. **This must run on Jeff's machine** — Playwright's browser download is blocked in the agent sandbox.

- [ ] **Step 8: Walk the site**

Run `npm run dev` and check `/`, `/forum`, `/library`, a story page, `/library/series/<any-uuid>`, `/my-stories`, `/rules`, `/transparency`, and the moderation Terminal. Expected: cold near-black throughout, Fraunces headings, brighter red, consistent borders. **No warm-grey borders should remain anywhere.**

- [ ] **Step 9: Commit**

```bash
git add src/
git commit -m "refactor(design): remove temporary token aliases, completing Phase 1"
```

---

## Definition of done

- [ ] `grep -rn "2d2d2a\|991B1B" -i src/` returns nothing
- [ ] No `--color-bg-primary` / `--color-accent-crimson` style aliases remain
- [ ] Cinzel removed from `public/fonts/`, `fonts.css`, and `global.css`
- [ ] Fraunces + IBM Plex Mono self-hosted with `font-display: swap`
- [ ] `NOT_YET_MIGRATED` is `[]`
- [ ] Unit suite green; `npm run build` clean; E2E green on Jeff's machine
- [ ] `/library/series/<id>` returns 200
- [ ] `/og/story/<id>.png` renders a real PNG
- [ ] Dictate still records — `Permissions-Policy: microphone=(self)` untouched in `public/_headers`

## Observation for later — not in scope

The five Merriweather files are ~98 KB each (~488 KB total), which is characteristic of unsubset builds; Fontsource latin subsets run ~25 KB. Swapping them would cut roughly 370 KB and more than offset this phase's additions (Fraunces 121 KB + Plex Mono 30 KB − Cinzel 56 KB ≈ +95 KB net). Deliberately **not** done here: it risks dropping glyphs for writers who paste accented or non-Latin characters, which needs its own decision. Worth its own work note.
