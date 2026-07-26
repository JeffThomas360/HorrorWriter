# SEO Implementation — Design Spec

**Date:** 2026-07-25
**Status:** Approved for planning

## Goal & scope

Improve organic (non-paid) search visibility for horrorwriter.org. Target is **brand +
community terms** (e.g. "Horror Writer", "horrorwriter.org", "post horror short story
online", "horror writing critique group") — not the broad head term "horror writing",
which is dominated by high-authority mega-sites and unwinnable through technical
implementation alone. This project is technical SEO only: no new content pages
(blog/journal), no backlink or content-marketing strategy — those are separate,
non-engineering efforts.

Out of scope: the error-boundary/Series-UI/CSP roadmap items tracked separately in
`CLAUDE.md`'s Current Roadmap — this spec does not touch them.

## Current state (as of audit)

- Per-route `title`/`description` already passed to `MainLayout.astro` on every page.
- Site-wide static Open Graph/Twitter card tags, one shared `/og.png`.
- `@astrojs/sitemap` generates a sitemap for **static** routes only.
- `robots.txt` disallows `moderation`, `my-reports`, `profile`, `library/publish`,
  `forum/new`, `auth/callback`.
- **Gap:** `/library/read/[id]` and `/forum/thread/[id]` are `prerender = false` (SSR at
  request time) — Astro's sitemap integration cannot enumerate per-ID routes, so
  individual stories and threads are not listed in the sitemap at all. They rely
  entirely on crawl discovery via internal links.
- No JSON-LD structured data anywhere.
- Stories have no image upload; `cover` is a 3-value color theme (blood/phantom/bone),
  not an uploaded asset. Adding real cover-image upload is a separate future feature,
  out of scope here.

## Design

### 1. Structured data (JSON-LD)

Add a shared component, `src/components/StructuredData.astro`, that accepts a JS object
and renders `<script type="application/ld+json">{JSON.stringify(data)}</script>` in the
page `<head>` (or MainLayout slot). Wire per page type:

| Page | Schema.org type | Key fields |
|---|---|---|
| `index.astro` | `WebSite` + `Organization` | name, url, description |
| `library/read/[id].astro` | `CreativeWork` | headline, author, datePublished, description |
| `forum/thread/[id].astro` | `DiscussionForumPosting` | headline, author, datePublished |
| `u/[handle].astro` | `ProfilePage` + `Person` | name, url |
| `library/series/[id].astro` | `CreativeWorkSeries` | name, description |

Data already fetched for `title`/`description` on these pages is reused — no new
queries beyond what each page's SSR block already selects, plus `author`/`created_at`
columns where not already selected.

### 2. Dynamic sitemaps for SSR content

Three new SSR endpoints (`export const prerender = false`) under `src/pages/`:

- `sitemap-stories.xml.js` — queries `books` where publicly visible
  (`mod_status = 'live'`), emits `<urlset>` of `/library/read/{id}` URLs with
  `<lastmod>` from `updated_at`/`created_at`.
- `sitemap-threads.xml.js` — same pattern for `threads`.
- `sitemap-profiles.xml.js` — same pattern for `profiles` (public handles only).

Each queries only public, `mod_status = 'live'` rows — same visibility rule already
enforced by RLS/`content_visible()` per `CLAUDE.md`'s moderation model. Astro's built-in
`sitemap()` integration continues to produce the static-route sitemap. A top-level
sitemap index (or an extension of the existing `sitemap-index.xml`) lists all four
sitemap URLs. `robots.txt`'s `Sitemap:` line is updated if the index filename changes.

### 3. Dynamic OG images for stories

New SSR image endpoint `src/pages/og/story/[id].png.js`, using `workers-og`
(satori + resvg, Cloudflare Workers–compatible) to render a branded card: story title,
author handle, and the story's existing color theme (blood/phantom/bone) as background
accent — matching the "1980s paperback" design tokens (dark bg, Cinzel/Merriweather
fonts if embeddable, crimson accent). No new upload feature; uses only data already on
the `books` row.

`library/read/[id].astro` passes this endpoint's URL as `og:image`/`twitter:image`
instead of the shared `/og.png`. Response sets `Cache-Control` (long max-age; content
per story ID is stable) since generation costs edge CPU per request.

Thread pages, series pages, and all other routes keep the existing shared `/og.png` —
lower payoff for a dynamic image there (no byline/cover-style asset to feature).

### 4. Metadata audit

Pass over existing per-page `title`/`description` values:
- Confirm none silently fall through to `MainLayout`'s generic default.
- Tighten any generic-sounding description copy (e.g. `my-stories.astro`,
  `library/series/[id].astro`) to be more specific/keyword-relevant where it doesn't
  compromise the site's voice.
- Add `og:image` overrides on story pages per section 3.

No new pattern — uses the existing `MainLayout` `title`/`description` props.

### 5. robots.txt / sitemap correctness

- Add new dynamic sitemap URLs (section 2) to the sitemap index.
- Audit the `Disallow` list against actual private routes — specifically confirm
  whether `/my-stories` (owner-only management page, no public SEO value) should be
  added; currently absent.

### 6. Core Web Vitals / performance pass

Run Lighthouse against representative pages (home, library index, a story read page, a
forum thread) and fix what it actually flags — this section is "audit then fix
findings," not a predetermined checklist. Likely candidate areas given the stack:
image lazy-loading in story/forum content, render-blocking script order, self-hosted
font-loading strategy (`font-display: swap` verification per `src/styles/fonts.css`).

## Testing

- Unit: none of the above introduces client-side logic requiring new `vitest` unit
  tests — sitemap/OG-image endpoints are server-rendered XML/image responses, verified
  by manual request during implementation, not unit-testable Supabase queries.
- E2E: extend `tests/mocks.js` if any Playwright spec needs to assert on JSON-LD
  presence or meta tag content on key pages (story read, thread, profile). Not required
  for sitemap/OG-image endpoints, which are outside the browser-driven E2E surface.
- Manual verification: fetch each new sitemap endpoint and the OG image endpoint
  directly; validate JSON-LD via Google's Rich Results Test; run Lighthouse before/after
  for the performance pass.

## Explicitly out of scope

- Content hub / blog / craft-articles section.
- Author-uploaded story cover images (would require a new Supabase Storage bucket +
  upload UI + moderation considerations — separate future feature).
- Backlink acquisition, content marketing, keyword research beyond what's implied by
  brand/community-term targeting above.
- Ranking for the broad term "horror writing" — not achievable via implementation work
  alone; flagged to the user during brainstorming.
