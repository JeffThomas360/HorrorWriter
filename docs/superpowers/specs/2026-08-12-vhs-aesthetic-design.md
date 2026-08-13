# VHS aesthetic pass — design spec

**Date:** 2026-08-12
**Status:** approved in brainstorm, ready for planning
**Supersedes:** the direction-only note in `work/aesthetic-and-direction.md`
**Amends:** `docs/superpowers/specs/2026-08-12-story-editing-design.md` (critique badge colours — see §7)

## The thesis

**Light in the dark — not texture over everything.**

Stranger Things' visual signature is not grain, glitch, or scanlines. It is **volumetric coloured
light inside near-black**: red bleeding off the title card, the cold teal wash of the Upside Down,
a single practical light source doing all the work. Grain is the cheap read of that era. Lighting
is the real one.

That choice also settles the question the old direction note raised and never answered — *how much
VHS texture before it hurts reading long-form fiction?* Light sits **behind** content; texture sits
**on top of** it. Build the identity out of light and the reading column stays clean by
construction rather than by compromise.

**Two temperatures, carrying meaning rather than decorating:**

| Temperature | Means | Where |
|---|---|---|
| Hot red | The living side — action, community, authorship | Home, the Crypt/forum, publish + edit, CTAs, standalone stories |
| Cold teal | The archive — quiet, finished, catalogued things | The Library, series, critique metadata, version state |

Texture (scanlines, grain) is demoted to a **chrome material**: header, footer, cover art, card
edges. It never touches prose.

## 1. Standing constraint

**Open-licence assets only.** Jeff's call, 2026-08-12. ITC Benguiat — the actual Stranger Things
face — is commercial Monotype licensing and is explicitly out of scope. Every font below is OFL and
self-hosted as `woff2` under `public/fonts/`, matching how Merriweather and Cinzel are already
served. No CDN font loading (the CSP in `public/_headers` only allows `font-src 'self'`, and
keeping it that way is desirable).

## 2. Palette

Replaces the five-token `@theme` block in `src/styles/global.css`.

| Token | Value | Role |
|---|---|---|
| `--color-void` | `#08090C` | Page background. Colder and deeper than `#121212` so glow has somewhere to fall off. |
| `--color-surface` | `#0F1116` | Cards, panels. Blue-shifted charcoal. |
| `--color-raised` | `#161922` | Depth tier that does not exist today. |
| `--color-line` | `#232733` | Default border. **Replaces `#2d2d2a`.** |
| `--color-line-hi` | `#333A4A` | Hover/active border. |
| `--color-bone` | `#E8E4DA` | Body copy. |
| `--color-ash` | `#8B8F98` | Secondary text. Cooled to sit in a blue-black world. |
| `--color-blood` | `#C8102E` | Primary red. Brighter and more saturated than `#991B1B`. |
| `--color-ember` | `#FF3B2F` | **Glow only** — `box-shadow`, `text-shadow`, gradient stops. Never a fill, never a text colour. |
| `--color-upside` | `#19A5B8` | Teal counter-light. Used sparingly, on purpose. |

During Phase 1 only, keep the old names as temporary aliases (`--color-bg-primary` →
`--color-void`, etc.) so the sweep can proceed file by file rather than as one atomic rewrite.
**The aliases are deleted before Phase 1 is considered done** — leaving them in place would
recreate the exact two-parallel-systems problem described in §4.

### Measured contrast against `--color-void`

Computed, not estimated:

| Pair | Ratio | Verdict |
|---|---|---|
| `bone` on `void` | **15.7 : 1** | Passes AAA. Body copy. |
| `upside` on `void` | **6.7 : 1** | Passes AA normal text — **teal is safe for small labels**. |
| `ash` on `void` | **6.1 : 1** | Passes AA normal text. |
| `blood` on `void` | **3.4 : 1** | Passes AA **large text + UI graphics only** (3:1). |

The existing "never use crimson for body copy" trap survives unchanged — but note it improves:
`#991B1B` on `#121212` was ~2.2:1 and failed even the 3:1 graphics bar. `#C8102E` clears it. And
the red/teal asymmetry is load-bearing: **teal can carry small text where red cannot**, which is
part of why metadata, labels and version state are teal.

## 3. Typography

| Role | Face | Licence | Usage |
|---|---|---|---|
| Display | **Fraunces** (variable, `SOFT 30`, `WONK 1`) | OFL | Hero, story titles, section headings, wordmark, drop caps |
| Body | **Merriweather** | OFL | All prose, ledes, critique text — **unchanged** |
| Utility | **IBM Plex Mono** | OFL | Eyebrows, labels, timecodes, buttons, bylines, metadata |

**Cinzel is removed.** It is a Trajan-style Roman inscriptional capital; its references are
antiquity and formal invitations, and it has no 1980s DNA. Fraunces was drawn explicitly in the
lineage of 1970s phototypesetting display serifs — the same era Benguiat came from — and its
`WONK` axis produces the flared, slightly irregular terminals that read as period-correct.

**Merriweather stays untouched.** It has a large x-height and generous spacing and was drawn for
screen reading. The product here is reading long-form fiction; this is the one part of the current
system that is already exactly right for its function.

**IBM Plex Mono replaces bare `font-mono`.** Today the site's most-repeated text — every byline,
label and button — renders in whatever monospace the visitor's OS supplies, so the chrome is
inconsistent across machines by default.

Fraunces is variable: ship one `woff2` covering weight 400–900 rather than separate files. Drop the
two Cinzel files.

## 4. ⚠️ Prerequisite: the system is only half-tokenized

Measured on `main` at `48bd4ab`:

| Finding | Count |
|---|---|
| `#2d2d2a` hardcoded (the site's most-used value, **has no token at all**) | **159** |
| `#991B1B` hardcoded, in parallel with its own existing token | **29** |
| Files containing hardcoded design values | **37** |
| Inline `style={{}}` blocks in `SeriesSidebar.jsx` / `SeriesContextBar.jsx` | **23 / 6** |

**Changing the `@theme` block alone would visibly fix almost nothing.** Phase 1 is therefore an
unglamorous tokenization sweep, and it is load-bearing — without it every later phase becomes hex
hunting across 37 files. This also finally absorbs the Series inline-style migration that
`work/story-series.md` deliberately deferred to this pass.

## 5. Signature element: Library covers become rental sleeves

Spend the boldness in one place. The Library is where a reader chooses what to read, it is the
weakest visual on the site today (a `#1a0a14` box with a faint crosshair SVG and the title set
twice), and it is already at 4:5 — near VHS sleeve proportion.

**Every decorative element reports real data. Nothing is texture alone.**

| Element | Encodes |
|---|---|
| Spine colour — red | Standalone story |
| Spine colour — teal | Part of a series |
| Spine text | Series name + position |
| Corner sticker | Critique count, or `SERIES` |
| Face label | Author handle + read time |

Shelving a story visually **is** the Series feature already shipped — the aesthetic surfaces a
feature rather than decorating over it.

Hover: `translateY(-3px)`, border to `--color-line-hi`, spine glow intensifies. That is the whole
interaction.

## 6. The reading page

The product. Protected by explicit rules, not by good intentions:

- Prose column: Merriweather 300, ~46ch measure, on **flat `--color-void`** — no gradient, no
  texture, no glow behind text.
- Scanline overlay masks to **zero opacity across the middle 46%** of the viewport
  (`mask-image: linear-gradient(90deg, …)`), so texture lives only in the outer margins.
- Red glow is confined **above the title**, never behind body text.
- The Fraunces drop cap on the first paragraph is the only display-face intrusion into the reading
  surface, and it is decorative rather than structural.
- All overlays are `pointer-events: none`.

## 7. Critique version badges — signal strength

**This amends the story-editing spec.** That spec specified green → yellow → orange → red
traffic-light badges for version drift. Those are four new accent colours in a two-colour palette;
dropped in, that block would look designed by someone else. Jeff chose the replacement on
2026-08-12 after seeing both side by side.

Same four steps, same information, expressed as a **signal degrading into static**:

| Drift | Badge | Card treatment |
|---|---|---|
| Current (v = latest) | 4 bars, full `--color-upside`, teal glow | Teal left rule, no overlay |
| 1 behind | 3 bars, desaturated teal | Teal left rule at 50%, scanline overlay 30% |
| 2 behind | 2 bars, grey-teal | Grey left rule, scanline 62%, text steps down to `#8A8F97` |
| 3+ behind | 1 bar, grey | Faint grey rule, scanline 100%, text `#70747B` |

Critiques are **never removed, hidden, or collapsed** at any drift level — unchanged from the
original requirement. Only the chrome degrades; the text stays fully present and legible (the
lowest step still clears AA).

## 8. Motion — exactly one set piece

**"Signal lock" on page load.** A VCR locking onto tape: RGB split resolves, the red glow blooms up
from zero, one horizontal distortion band sweeps down once.

- ~700ms, CSS only, **once per page load**, never loops
- **Content is never delayed or hidden** — text is present and readable from the first frame; the
  animation runs on top of it
- No layout shift (transforms and opacity only)
- **Fully disabled under `prefers-reduced-motion: reduce`** — including the band, the bloom, and the
  split

Everything else is hover feedback: sleeve lift, link colour, button glow. **Nothing animates while
someone is reading.** No `framer-motion` — CSS only, consistent with the standing stack decision.

Retire `animate-pulse` on the TRENDING badge in favour of a slow ember flicker that also respects
reduced motion.

## 9. Accessibility floor

Non-negotiable, verified rather than assumed:

- Contrast ratios per §2; red never used for small text
- **Visible keyboard focus on every interactive element** — the current site defines essentially
  none, so this is new work, not a carry-over. Use a 2px `--color-ember` outline with offset.
- `prefers-reduced-motion` respected everywhere per §8
- All texture/glow overlays `pointer-events: none` and never applied behind body copy
- Responsive to mobile — the sleeve grid reflows 4 → 2 → 1

## 10. Other surfaces

- **`PublishStory.jsx` `COVER_OPTIONS`** currently offers `blood #991B1B`, `cyan #312e81` (which is
  actually indigo — mislabelled), `bone #E5E1D8`. Retarget to the new palette and fix the misnamed
  value so the cyan option is genuinely `--color-upside`.
- **`.vintage-card`** is currently the only surface treatment, used identically for forum tiles,
  critiques, error states and empty states. Split into tiers: `surface` (default), `raised`
  (interactive/hover), and a distinct error treatment.
- **Header/footer** gain the scanline chrome material and a hairline `--color-line` border.

## Phasing

Five PRs. Each ships independently and leaves the site coherent.

| Phase | Scope | Notes |
|---|---|---|
| **1 — Tokenize + foundation** | Expand `@theme`; sweep 159 `#2d2d2a` + 29 `#991B1B` to tokens; migrate 29 Series inline-style blocks; add Fraunces + IBM Plex Mono `woff2`, drop Cinzel; base type styles | Load-bearing. Largest diff, least visual drama. |
| **2 — Chrome + surfaces** | Header/footer scanline material, card tiers, buttons, badges, focus states | |
| **3 — Signature** | Library sleeve component: spines, stickers, hover | Highest visible payoff. |
| **4 — Reading page** | Hero glow, masked texture, drop cap, critique signal badges | Badges depend on `books.version` from the story-editing spec — **sequence after that lands**. |
| **5 — Motion** | Signal-lock set piece, hover micro-interactions, reduced-motion guards | |

## Acceptance criteria

- [ ] No hardcoded `#2d2d2a` or `#991B1B` remains anywhere in `src/`
- [ ] Cinzel fully removed; Fraunces + IBM Plex Mono self-hosted, `font-display: swap`
- [ ] Measured contrast matches §2 on the shipped build
- [ ] Every interactive element has a visible keyboard focus state
- [ ] `prefers-reduced-motion: reduce` disables the load animation entirely
- [ ] Reading page: no texture or glow rendered behind body copy at any breakpoint
- [ ] Library sleeve spine colour correctly reflects series membership from real data
- [ ] Critique badges render all four drift states correctly
- [ ] Unit + E2E suites green; `npm run build` clean
- [ ] Dictate still records in production — `Permissions-Policy: microphone=(self)` untouched in
      `public/_headers` (long-standing trap; this pass edits nearby CSS but must not touch headers)

## Deliberately out of scope

- **Front page / onboarding redesign** (`work/aesthetic-and-direction.md`) — this pass restyles the
  existing home page; it does not restructure it or change the conversion path. Still its own project.
- **Core Web Vitals / Lighthouse work** — Jeff's standing instruction for the aesthetic track is
  perceived snappiness, not measured performance.
- **Any commercial font licence**, per §1.
