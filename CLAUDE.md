# HorrorWriter — CLAUDE.md

A specialized, retro-aesthetic horror writing and critique community at **[horrorwriter.org](https://horrorwriter.org)**.
Solo-maintained by Jeff Thomas (`JeffThomas360`). Built with **Astro 7** (React islands) deployed to **Cloudflare Workers**, backed by **Supabase PostgreSQL**.

---

## 1. What This Project Is

HorrorWriter is an online sanctuary for horror authors, flash-fiction writers, and dark literature aficionados. It merges the analog nostalgia of **1980s VHS tape aesthetic and midnight horror radio** with a modern, high-performance web experience.

### Core Value Propositions:
1. **Unobstructed Reading (Amazon Kindle Experience)**:
   - Dedicated **Kindle Focus Mode** (`/library/read/[id]`) that strips away all navigation, sidebars, and comment threads into an authentic e-reader room.
   - Authentic Kindle themes: **Void Dark** (`#050505`), **Sepia Paperback** (`#F4EFEA` / `#2B231D`), and **Paper Light** (`#FAF9F6` / `#1A1A1A`).
   - Bookerly, Literata, Sans, and Monospace typography with adjustable sizing, margins, line spacing, and novel paragraph indentation.
   - Live telemetry tracking scroll progress (`XX%`) and estimated reading time left (`~X mins left`).
2. **Sensory & RTF Writing Studio (`MarkdownEditor.jsx`)**:
   - Full rich-text formatting toolbar: Bold, Italic, Underline (`<u>`), Strikethrough, Crimson Highlight (`<mark>`), Headings (H1/H2/H3), Scene Breaks (`* * *`), Dialogue Em-Dashes (`—`), Blockquotes, and Lists.
   - **Split View Typesetter**: Real-time side-by-side authoring with instant book-typeset preview.
   - Sensory immersion: Tactile mechanical typewriter audio clicks and ambient horror audio soundscapes (Rain, Tape Hum).
   - Document import for `.docx`, `.md`, and `.txt` manuscripts.
3. **Psychological Draw & Viral Acquisition**:
   - **Dread Spectrum Diagnostic**: A psychological archetype quiz matching writers to 4 horror profiles (*Lovecraftian Void*, *Slasher Visceral*, *Gothic Melancholy*, *Psychological Paranoia*) generating shareable Dread Dossiers.
   - **Whispers in the Void**: Ephemeral, anonymous micro-confessional stream for raw reader fears.
   - **Witching Hour Telemetry**: Live nocturnal status monitoring and midnight signal intercept (*Tape #00* Channel 13 terminal).
4. **Community Critique & Serial Fiction**:
   - Long-form story publishing, multi-part series arcs, constructive critique exchanges, and transparent community moderation.

---

## 2. Strategic Goals Going Forward

### A. Product & Community Goals
1. **Frictionless Reading & Retention**:
   - Keep reading unobstructed, beautiful, and distraction-free. Readers should feel like they are reading on a Kindle or holding a physical paperback.
   - Preserve soft single returns and book-style paragraph formatting across all stories.
2. **Writer Empowerment**:
   - Provide the premier editor for horror fiction: fast, distraction-free, rich formatting, sensory soundscapes, and autosaved drafts.
3. **Organic Search Dominance (Top 10 Google Ranking)**:
   - Maintain JSON-LD structured data (`CreativeWork`, `Book`, `DiscussionForumPosting`, `BreadcrumbList`, `WebSite`).
   - Keep dynamic XML sitemaps (`sitemap-stories.xml.js`, `sitemap-threads.xml.js`, `sitemap-profiles.xml.js`) auto-updating.
   - Ensure dynamic social share card generation (`/og/story/[id].png`) works seamlessly on Twitter/X, Reddit, and Discord.
4. **Low-Maintenance & High Reliability**:
   - Two hard constraints shape every engineering decision: **must stay simple and non-technical for writer users**, and **strictly low-maintenance to operate**.

---

## 3. Tech Stack & Architecture

- **Framework**: Astro 7 (`output: "static"`, `mode: "server"` via `@astrojs/cloudflare` adapter).
- **Frontend**: React 19 islands (`client:load` / `client:only="react"`).
- **Bundler & Compiler**: Vite 8 (overrides pinned in `package.json`).
- **Styling**: Tailwind CSS 4 + Vanilla CSS Design Tokens in `src/styles/global.css`.
- **Database & Auth**: Supabase PostgreSQL + PostgREST + Supabase Auth.
- **Edge Runtime**: Cloudflare Workers (Astro SSR + static asset pipeline).
- **Secondary Workers**: Audio transcription worker (`workers/transcribe/`).

---

## 4. Critical Traps & Engineering Guardrails

These have cost production outages or lengthy debugging sessions in the past:

1. **`withProviders` is a NAMED export** from `src/components/Providers.jsx`; the default export is `Providers`. A default import compiles cleanly, then crashes at SSR runtime with `Cannot read properties of null (reading 'useState')`.
2. **Hooks before early returns in React islands**: Placing hooks after conditional returns (`if (loading) return ...`) crashes React islands in production. Always declare all hooks at the top.
3. **Islands do NOT share React context**: Each `client:load` is a distinct React root. One page contains multiple `AuthProvider` instances. They coordinate via module-scoped globals in `AuthContext.jsx` (`globalInFlight`, `globalProfileCache`).
4. **Tailwind v4 Paragraph Reset**: Tailwind v4 resets all `<p>` margins to 0. All paragraph vertical spacing must be explicitly governed by `.prose-book p` and `.prose p` in `global.css`.
5. **Database Parity (`updated_at`)**: Every content table (`books`, `threads`, `posts`, `book_comments`, `profiles`) has `updated_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL` and trigger `touch_profile_updated_at()`. When adding columns or modifying tables, always create a numbered migration in `supabase/migrations/` and reload PostgREST cache via `NOTIFY pgrst, 'reload schema';`.
6. **CSP & Cloudflare `public/_headers`**:
   - `Permissions-Policy`: `microphone=(self)` must remain active for Dictate transcription.
   - `CSP script-src`: Must retain `'unsafe-inline'` because Astro hydrates React islands via inline module scripts. Dropping it disables all client hydration.
   - `_headers` is invisible to `npm run dev` (Cloudflare static hosting only). Verify header changes in production or staging builds.
7. **Color Tokens & WCAG AA Contrast**:
   - `--color-blood` (`#C8102E`) is **3.38:1** on dark surfaces. It passes WCAG AA **only for large display type** (≥24px or ≥18.66px bold).
   - `--color-ember` (`#FF3B2F`) is **5.61:1** and passes AA at any size. Use **ember for small text and interactive links/buttons**.
   - Use blood as a decorative border or solid background fill with white text. Never use blood for 12px body copy.

---

## 5. Development & Verification Workflow

```powershell
npm run dev          # Local development (http://localhost:4321)
npm run test:unit    # Vitest unit tests (18 test suites, 137 tests)
npm run build        # Astro Cloudflare production build verification
npx playwright test  # E2E browser test suite
```

### Protocol for Deployments:
1. Always run `npm run test:unit` and `npm run build` before pushing.
2. Commit with descriptive semantic messages (`feat: ...`, `fix: ...`, `chore: ...`).
3. Push to `main`: Cloudflare Pages auto-deploys via GitHub webhook.
4. Verify visually via browser subagent or headless Playwright script with screenshots saved to brain artifacts.
