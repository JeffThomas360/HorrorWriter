# PICKUP — Aesthetic redesign (2026-05-26)

Full visual overhaul. Functionality, routing, Supabase, auth, and data
shapes were NOT touched.

## What changed

**Design direction**: VHS / Stranger Things control-deck → **Gothic Editorial**
(magazine-grade typography, restrained horror accents).

**Layout shell**
- Sidebar control deck (320 px) → sticky top nav (68 px, frosted glass)
- Reading column max 1120 px, prose max 720 px
- `src/components/Layout.jsx` simplified; `src/components/Atmospherics.jsx`
  is now an inert stub (single grain + vignette applied via `body::before`
  and `body::after` in `style.css`)

**Type system**
- Display: **Fraunces** (700 / 900, italic for accents)
- Body: EB Garamond (unchanged)
- UI: **Inter** for nav, buttons, chips, metadata
- Mono: **JetBrains Mono** (replaces VT323)
- Cinzel reserved for the brand wordmark only
- Fonts loaded from Google in `index.html`

**Color tokens** (`:root` in `src/style.css`)
- `--paper #f6f1e6`, `--ink #0b0a10`, `--blood #e63946`, `--ember #ff7a45`
- Removed: Bebas Neue, the heavy CRT stack, all `.scanlines / .noise /
  .tracking / .grid-floor / .grid-wall / .particle` overlays
  (rules are kept with `display: none` for safety)

**Buttons**: pill-shaped. New `.btn.blood` (gradient + glow) is the
primary CTA. `.btn.primary` (paper-on-ink) is the secondary punch.
`.btn.ghost` and `.btn.cyan` retained.

**Home page** (`src/pages/Home.jsx`) — full rewrite
1. Editorial hero: massive Fraunces headline w/ italic blood accent
2. Stats strip: Writers / Stories / Threads / **0 Ads, ever**
3. Magazine 1+2 feature grid bound to recent threads
4. **Prompt of the Week** pull-quote card — designed to be screenshotted
5. Numbered I/II/III "Why" cards

**Other page polish**
- Forum: same data model; new chrome (cat list, search pill, thread row
  with hover slide-in, online-writers card)
- Library: 320 px poster covers, badge pills, hover lift
- ThreadView, ReadStory: shared `.card` pattern, cleaner author block
- PublishStory, CreateThread: forms use new field-input + pill cover-picker

**Meta**
- `index.html` now has Open Graph + Twitter card tags for proper unfurl
- Page `<title>` updated

## Verified

Local `npx vite build` is clean — 161 modules, 502 KB JS / 32 KB CSS.
No functional regressions: AuthContext, Supabase queries, react-query
keys, route paths are all untouched.

## Sandbox gotcha (worth knowing)

The Write tool occasionally truncated or null-padded files on the
`D:\` Windows mount. If a build error mentions "Unexpected end of file"
or `\x00`, the file got cut off. Workaround that worked:
overwrite from PowerShell, or use `cat > file << 'EOF'` in bash.

Files that hit this and were rewritten via bash heredoc:
- `index.html`, `src/style.css`, `src/pages/Home.jsx`,
  `src/components/Nav.jsx`, `src/components/Footer.jsx`

## To deploy

From PowerShell at `D:\CLAUDECODE\Projects\horrorwriter`:

```powershell
npm run build
npx wrangler pages deploy dist --project-name horrorwriter
```

Then commit + push to keep GitHub in sync (push does NOT auto-deploy).

## What I did NOT touch (still on the original "Next priorities" list)

1. `20260523000000_fix_replies_count.sql` — still needs `supabase db push`
2. Library → Supabase wiring (already real; CLAUDE.md may be stale on this)
3. Pagination on ThreadView
4. Turnstile site key in Cloudflare Pages env
5. Delete old Worker
6. Connect GitHub to Pages

## Suggested next aesthetic moves (when ready)

- Add OG share image at `public/og.png` (1200×630) and reference it from
  `index.html` (`<meta property="og:image">`) — the meta tags are wired,
  the image is the missing piece
- Add a real "Prompt of the Week" Supabase table so the pull-quote isn't
  hard-coded
- Per-story OG image generation in an Edge Function for shareable
  story-card URLs (huge viral lever)
- Light-mode toggle (the token system is centralized enough to support it)
