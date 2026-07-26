# SEO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give horrorwriter.org real technical SEO — structured data, full sitemap coverage of dynamic content, per-story social share images, and a Core Web Vitals pass — targeting brand/community search terms per `docs/superpowers/specs/2026-07-25-seo-implementation-design.md`.

**Architecture:** Two new `src/lib/` modules (`seo.js` for pure/testable builders, `sitemapQueries.js` for Supabase-backed fetchers, following the existing `src/lib/series.js` mocked-client test pattern) feed a shared `StructuredData.astro` component and three new SSR sitemap endpoints. A new SSR image endpoint renders per-story OG images with `workers-og`. `robots.txt` gains additional `Sitemap:` lines (Astro's existing `sitemap-index.xml` is untouched, so no filename collision).

**Tech Stack:** Astro 7 SSR endpoints (`prerender = false`), `@astrojs/sitemap` (existing), `workers-og` (new dependency, satori+resvg for Cloudflare Workers), Supabase client, `vitest`.

## Global Constraints

- No new content pages (blog/journal) — out of scope per spec.
- No author cover-image upload — dynamic OG images are generated server-side from existing `books` columns (`title`, `cover` theme, author handle) only.
- Sitemap/structured-data queries must only surface `mod_status = 'live'` rows (books, threads) and non-shadowbanned profiles (`is_shadowbanned = false`) — same visibility rule as RLS `content_visible()`.
- Follow existing code patterns: pure builder functions unit-tested directly; Supabase-backed fetchers unit-tested with the mocked-client pattern from `src/lib/series.test.js` (`makeQuery`/`mockSupabase.from`).
- Design tokens only for any new visual output (OG image background/accent colors) — reuse `--color-bg-primary` (`#121212`), `--color-accent-crimson` (`#991B1B`), `--color-text-primary` (`#E5E1D8`) hex values (JSON-LD/image renderers can't consume CSS vars, so hardcode the hex values with a comment noting the token they mirror).
- Windows dev: run `vitest`/`npx playwright test` via the Bash tool or `cmd /c`, per `CLAUDE.md`.

---

### Task 1: `seo.js` — pure structured-data and sitemap-XML builders

**Files:**
- Create: `src/lib/seo.js`
- Test: `src/lib/seo.test.js`

**Interfaces:**
- Produces:
  - `buildWebSiteSchema({ url, name, description })` → JSON-LD object (`@type: WebSite` + `Organization` as `@graph` array)
  - `buildCreativeWorkSchema({ url, title, description, authorName, datePublished })` → JSON-LD object
  - `buildDiscussionForumPostingSchema({ url, headline, authorName, datePublished })` → JSON-LD object
  - `buildProfilePageSchema({ url, name })` → JSON-LD object
  - `buildCreativeWorkSeriesSchema({ url, name, description })` → JSON-LD object
  - `buildSitemapXml(urls)` where `urls: Array<{ loc: string, lastmod?: string }>` → XML string (`<?xml version="1.0" encoding="UTF-8"?><urlset ...>...</urlset>`)

- [ ] **Step 1: Write the failing tests**

```javascript
// src/lib/seo.test.js
import { describe, it, expect } from 'vitest'
import {
  buildWebSiteSchema,
  buildCreativeWorkSchema,
  buildDiscussionForumPostingSchema,
  buildProfilePageSchema,
  buildCreativeWorkSeriesSchema,
  buildSitemapXml
} from './seo'

describe('buildWebSiteSchema', () => {
  it('returns a WebSite + Organization graph', () => {
    const result = buildWebSiteSchema({
      url: 'https://horrorwriter.org',
      name: 'Horror Writer',
      description: 'A circle for serious horror writers.'
    })
    expect(result['@context']).toBe('https://schema.org')
    expect(result['@graph']).toHaveLength(2)
    expect(result['@graph'][0]).toMatchObject({ '@type': 'WebSite', url: 'https://horrorwriter.org', name: 'Horror Writer' })
    expect(result['@graph'][1]).toMatchObject({ '@type': 'Organization', name: 'Horror Writer' })
  })
})

describe('buildCreativeWorkSchema', () => {
  it('returns a CreativeWork schema with author and date', () => {
    const result = buildCreativeWorkSchema({
      url: 'https://horrorwriter.org/library/read/book-1',
      title: 'The Hollow House',
      description: 'A short story.',
      authorName: 'jeff-the-writer',
      datePublished: '2026-01-01T00:00:00Z'
    })
    expect(result).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'CreativeWork',
      url: 'https://horrorwriter.org/library/read/book-1',
      headline: 'The Hollow House',
      description: 'A short story.',
      datePublished: '2026-01-01T00:00:00Z',
      author: { '@type': 'Person', name: 'jeff-the-writer' }
    })
  })
})

describe('buildDiscussionForumPostingSchema', () => {
  it('returns a DiscussionForumPosting schema', () => {
    const result = buildDiscussionForumPostingSchema({
      url: 'https://horrorwriter.org/forum/thread/thread-1',
      headline: 'How do you write quiet horror?',
      authorName: 'someone',
      datePublished: '2026-01-01T00:00:00Z'
    })
    expect(result).toMatchObject({
      '@type': 'DiscussionForumPosting',
      headline: 'How do you write quiet horror?',
      author: { '@type': 'Person', name: 'someone' }
    })
  })
})

describe('buildProfilePageSchema', () => {
  it('returns a ProfilePage + Person schema', () => {
    const result = buildProfilePageSchema({ url: 'https://horrorwriter.org/u/jeff', name: 'Jeff' })
    expect(result).toMatchObject({
      '@type': 'ProfilePage',
      mainEntity: { '@type': 'Person', name: 'Jeff' }
    })
  })
})

describe('buildCreativeWorkSeriesSchema', () => {
  it('returns a CreativeWorkSeries schema', () => {
    const result = buildCreativeWorkSeriesSchema({
      url: 'https://horrorwriter.org/library/series/series-1',
      name: 'The Hollow Chronicles',
      description: 'A three-part descent.'
    })
    expect(result).toMatchObject({
      '@type': 'CreativeWorkSeries',
      name: 'The Hollow Chronicles',
      description: 'A three-part descent.'
    })
  })
})

describe('buildSitemapXml', () => {
  it('builds a urlset with loc and lastmod', () => {
    const xml = buildSitemapXml([
      { loc: 'https://horrorwriter.org/library/read/book-1', lastmod: '2026-01-01T00:00:00Z' },
      { loc: 'https://horrorwriter.org/library/read/book-2' }
    ])
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
    expect(xml).toContain('<loc>https://horrorwriter.org/library/read/book-1</loc>')
    expect(xml).toContain('<lastmod>2026-01-01T00:00:00Z</lastmod>')
    expect(xml).toContain('<loc>https://horrorwriter.org/library/read/book-2</loc>')
    expect(xml).toContain('</urlset>')
  })

  it('returns an empty urlset for no URLs', () => {
    const xml = buildSitemapXml([])
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/seo.test.js`
Expected: FAIL with "Failed to resolve import './seo'" (file doesn't exist yet)

- [ ] **Step 3: Write the implementation**

```javascript
// src/lib/seo.js

export function buildWebSiteSchema({ url, name, description }) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', url, name, description },
      { '@type': 'Organization', name, url }
    ]
  }
}

export function buildCreativeWorkSchema({ url, title, description, authorName, datePublished }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    url,
    headline: title,
    description,
    datePublished,
    author: { '@type': 'Person', name: authorName }
  }
}

export function buildDiscussionForumPostingSchema({ url, headline, authorName, datePublished }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'DiscussionForumPosting',
    url,
    headline,
    datePublished,
    author: { '@type': 'Person', name: authorName }
  }
}

export function buildProfilePageSchema({ url, name }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    url,
    mainEntity: { '@type': 'Person', name }
  }
}

export function buildCreativeWorkSeriesSchema({ url, name, description }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CreativeWorkSeries',
    url,
    name,
    description
  }
}

export function buildSitemapXml(urls) {
  const body = urls.map(({ loc, lastmod }) =>
    `<url><loc>${loc}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`
  ).join('')
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/seo.test.js`
Expected: PASS, 7 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/seo.js src/lib/seo.test.js
git commit -m "feat(seo): add structured-data and sitemap-XML pure builders"
```

---

### Task 2: `sitemapQueries.js` — Supabase-backed sitemap row fetchers

**Files:**
- Create: `src/lib/sitemapQueries.js`
- Test: `src/lib/sitemapQueries.test.js`

**Interfaces:**
- Consumes: `supabase` from `../supabaseClient` (may be `null` — guard, following `series.js`'s pattern)
- Produces:
  - `fetchLiveStoryUrls()` → `Promise<Array<{ id: string, created_at: string }>>` — `books` where `mod_status = 'live'`
  - `fetchLiveThreadUrls()` → `Promise<Array<{ id: string, updated_at: string }>>` — `threads` where `mod_status = 'live'`
  - `fetchPublicProfileHandles()` → `Promise<Array<{ handle: string, updated_at: string }>>` — `profiles` where `is_shadowbanned = false` and `handle is not null`

- [ ] **Step 1: Write the failing tests**

```javascript
// src/lib/sitemapQueries.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'

function makeQuery(result) {
  const q = {
    select: vi.fn(() => q),
    eq: vi.fn(() => q),
    not: vi.fn(() => q),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  }
  return q
}

const mockSupabase = { from: vi.fn() }

vi.mock('../supabaseClient', () => ({
  get supabase() { return mockSupabase }
}))

const { fetchLiveStoryUrls, fetchLiveThreadUrls, fetchPublicProfileHandles } = await import('./sitemapQueries')

beforeEach(() => {
  mockSupabase.from.mockReset()
})

describe('fetchLiveStoryUrls', () => {
  it('returns id/created_at for live books', async () => {
    mockSupabase.from.mockReturnValueOnce(makeQuery({
      data: [{ id: 'book-1', created_at: '2026-01-01T00:00:00Z' }],
      error: null
    }))
    const result = await fetchLiveStoryUrls()
    expect(result).toEqual([{ id: 'book-1', created_at: '2026-01-01T00:00:00Z' }])
    expect(mockSupabase.from).toHaveBeenCalledWith('books')
  })

  it('returns an empty array on query error', async () => {
    mockSupabase.from.mockReturnValueOnce(makeQuery({ data: null, error: { message: 'boom' } }))
    expect(await fetchLiveStoryUrls()).toEqual([])
  })
})

describe('fetchLiveThreadUrls', () => {
  it('returns id/updated_at for live threads', async () => {
    mockSupabase.from.mockReturnValueOnce(makeQuery({
      data: [{ id: 'thread-1', updated_at: '2026-01-02T00:00:00Z' }],
      error: null
    }))
    const result = await fetchLiveThreadUrls()
    expect(result).toEqual([{ id: 'thread-1', updated_at: '2026-01-02T00:00:00Z' }])
    expect(mockSupabase.from).toHaveBeenCalledWith('threads')
  })
})

describe('fetchPublicProfileHandles', () => {
  it('returns handle/updated_at for non-shadowbanned profiles with a handle', async () => {
    mockSupabase.from.mockReturnValueOnce(makeQuery({
      data: [{ handle: 'jeff-the-writer', updated_at: '2026-01-03T00:00:00Z' }],
      error: null
    }))
    const result = await fetchPublicProfileHandles()
    expect(result).toEqual([{ handle: 'jeff-the-writer', updated_at: '2026-01-03T00:00:00Z' }])
    expect(mockSupabase.from).toHaveBeenCalledWith('profiles')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/sitemapQueries.test.js`
Expected: FAIL with "Failed to resolve import './sitemapQueries'"

- [ ] **Step 3: Write the implementation**

```javascript
// src/lib/sitemapQueries.js
import { supabase } from '../supabaseClient'

export async function fetchLiveStoryUrls() {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('books')
    .select('id, created_at')
    .eq('mod_status', 'live')
  if (error || !data) return []
  return data
}

export async function fetchLiveThreadUrls() {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('threads')
    .select('id, updated_at')
    .eq('mod_status', 'live')
  if (error || !data) return []
  return data
}

export async function fetchPublicProfileHandles() {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('profiles')
    .select('handle, updated_at')
    .eq('is_shadowbanned', false)
    .not('handle', 'is', null)
  if (error || !data) return []
  return data
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/sitemapQueries.test.js`
Expected: PASS, 4 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/sitemapQueries.js src/lib/sitemapQueries.test.js
git commit -m "feat(seo): add Supabase fetchers for dynamic sitemap rows"
```

---

### Task 3: Dynamic sitemap SSR endpoints + robots.txt wiring

**Files:**
- Create: `src/pages/sitemap-stories.xml.js`
- Create: `src/pages/sitemap-threads.xml.js`
- Create: `src/pages/sitemap-profiles.xml.js`
- Modify: `public/robots.txt`

**Interfaces:**
- Consumes: `fetchLiveStoryUrls`, `fetchLiveThreadUrls`, `fetchPublicProfileHandles` from `../lib/sitemapQueries` (Task 2); `buildSitemapXml` from `../lib/seo` (Task 1)

- [ ] **Step 1: Write `sitemap-stories.xml.js`**

```javascript
// src/pages/sitemap-stories.xml.js
export const prerender = false

import { fetchLiveStoryUrls } from '../lib/sitemapQueries'
import { buildSitemapXml } from '../lib/seo'

export async function GET() {
  const rows = await fetchLiveStoryUrls()
  const xml = buildSitemapXml(rows.map(r => ({
    loc: `https://horrorwriter.org/library/read/${r.id}`,
    lastmod: r.created_at
  })))
  return new Response(xml, { headers: { 'Content-Type': 'application/xml' } })
}
```

- [ ] **Step 2: Write `sitemap-threads.xml.js`**

```javascript
// src/pages/sitemap-threads.xml.js
export const prerender = false

import { fetchLiveThreadUrls } from '../lib/sitemapQueries'
import { buildSitemapXml } from '../lib/seo'

export async function GET() {
  const rows = await fetchLiveThreadUrls()
  const xml = buildSitemapXml(rows.map(r => ({
    loc: `https://horrorwriter.org/forum/thread/${r.id}`,
    lastmod: r.updated_at
  })))
  return new Response(xml, { headers: { 'Content-Type': 'application/xml' } })
}
```

- [ ] **Step 3: Write `sitemap-profiles.xml.js`**

```javascript
// src/pages/sitemap-profiles.xml.js
export const prerender = false

import { fetchPublicProfileHandles } from '../lib/sitemapQueries'
import { buildSitemapXml } from '../lib/seo'

export async function GET() {
  const rows = await fetchPublicProfileHandles()
  const xml = buildSitemapXml(rows.map(r => ({
    loc: `https://horrorwriter.org/u/${r.handle}`,
    lastmod: r.updated_at
  })))
  return new Response(xml, { headers: { 'Content-Type': 'application/xml' } })
}
```

- [ ] **Step 4: Update `robots.txt`**

Current content (from `public/robots.txt`):
```
User-agent: *
Disallow: /moderation
Disallow: /my-reports
Disallow: /profile
Disallow: /library/publish
Disallow: /forum/new
Disallow: /auth/callback

Sitemap: https://horrorwriter.org/sitemap-index.xml
```

Replace with:
```
User-agent: *
Disallow: /moderation
Disallow: /my-reports
Disallow: /profile
Disallow: /my-stories
Disallow: /library/publish
Disallow: /forum/new
Disallow: /auth/callback

Sitemap: https://horrorwriter.org/sitemap-index.xml
Sitemap: https://horrorwriter.org/sitemap-stories.xml
Sitemap: https://horrorwriter.org/sitemap-threads.xml
Sitemap: https://horrorwriter.org/sitemap-profiles.xml
```

(Adds `Disallow: /my-stories` — an owner-only management page with no public SEO value, currently missing from the list per the spec's section 5 audit — alongside the three new `Sitemap:` lines. `robots.txt` supports multiple `Sitemap:` directives, so no change to the existing Astro-generated `sitemap-index.xml` is needed.)

- [ ] **Step 5: Manually verify each endpoint**

Run: `npm run dev`, then in another terminal:
```bash
curl http://localhost:5173/sitemap-stories.xml
curl http://localhost:5173/sitemap-threads.xml
curl http://localhost:5173/sitemap-profiles.xml
```
Expected: each returns `200` with `Content-Type: application/xml` and a `<urlset>` body (empty `<urlset>...</urlset>` is fine if `.env.local` has no Supabase config in dev, or if the mocked/local DB has no rows).

- [ ] **Step 6: Commit**

```bash
git add src/pages/sitemap-stories.xml.js src/pages/sitemap-threads.xml.js src/pages/sitemap-profiles.xml.js public/robots.txt
git commit -m "feat(seo): add dynamic sitemaps for stories, threads, profiles"
```

---

### Task 4: `StructuredData.astro` component + wire into all five page types

**Files:**
- Create: `src/components/StructuredData.astro`
- Modify: `src/pages/index.astro`
- Modify: `src/pages/library/read/[id].astro`
- Modify: `src/pages/forum/thread/[id].astro`
- Modify: `src/pages/u/[handle].astro`
- Modify: `src/pages/library/series/[id].astro`

**Interfaces:**
- Consumes: `buildWebSiteSchema`, `buildCreativeWorkSchema`, `buildDiscussionForumPostingSchema`, `buildProfilePageSchema`, `buildCreativeWorkSeriesSchema` from `../lib/seo` (Task 1)
- Produces: `<StructuredData data={schemaObject} />` — renders one JSON-LD `<script>` tag

- [ ] **Step 1: Create `StructuredData.astro`**

```astro
---
// src/components/StructuredData.astro
interface Props {
  data: Record<string, unknown>;
}
const { data } = Astro.props;
---
<script type="application/ld+json" set:html={JSON.stringify(data)} />
```

- [ ] **Step 2: Wire into `index.astro`**

Add import and usage inside `<MainLayout>` (after the existing imports, before the `---` closes; then place the component as the first child inside `<MainLayout>` in the template):

```astro
import StructuredData from '../components/StructuredData.astro';
import { buildWebSiteSchema } from '../lib/seo';

const websiteSchema = buildWebSiteSchema({
  url: 'https://horrorwriter.org',
  name: 'Horror Writer',
  description: 'A circle for serious horror writers — forums, critique, and craft.'
});
```
```astro
<MainLayout title="Horror Writer" description="A circle for serious horror writers — forums, critique, and craft.">
  <StructuredData data={websiteSchema} />
  <!-- existing Hero Section etc. unchanged -->
```

- [ ] **Step 3: Wire into `library/read/[id].astro`**

The existing SSR block already fetches `book` (`title, lede`). Extend the `select` to include `author_id, created_at` and join the author's handle, then build the schema:

```astro
---
export const prerender = false;

import MainLayout from '../../../layouts/MainLayout.astro';
import StructuredData from '../../../components/StructuredData.astro';
import ReadStory from '../../../pages-react/ReadStory.jsx';
import { supabase } from '../../../supabaseClient';
import { buildCreativeWorkSchema } from '../../../lib/seo';

const { id } = Astro.params;

let book = null;
try {
  const isTest = typeof process !== 'undefined' && process.env.PLAYWRIGHT_TEST === 'true';
  if (supabase && !isTest) {
    const { data } = await supabase
      .from('books')
      .select('title, lede, created_at, profiles(handle)')
      .eq('id', id)
      .single();
    book = data;
  }
} catch (e) {
  console.error('Error fetching book details for SEO:', e);
}

const title = book ? `${book.title} | Library` : 'Reading Story';
const description = book?.lede || 'Read this chilling story on Horror Writer.';
const pageUrl = new URL(Astro.url.pathname, Astro.site).toString();
const creativeWorkSchema = book ? buildCreativeWorkSchema({
  url: pageUrl,
  title: book.title,
  description: book.lede,
  authorName: book.profiles?.handle || 'Unknown',
  datePublished: book.created_at
}) : null;
---

<MainLayout title={title} description={description}>
  {creativeWorkSchema && <StructuredData data={creativeWorkSchema} />}
  <ReadStory id={id} client:load />
</MainLayout>
```

- [ ] **Step 4: Wire into `forum/thread/[id].astro`**

Same pattern — extend the `select` to include `created_at` and the author handle:

```astro
---
export const prerender = false;

import MainLayout from '../../../layouts/MainLayout.astro';
import StructuredData from '../../../components/StructuredData.astro';
import ThreadView from '../../../pages-react/ThreadView.jsx';
import { supabase } from '../../../supabaseClient';
import { buildDiscussionForumPostingSchema } from '../../../lib/seo';

const { id } = Astro.params;

let thread = null;
try {
  const isTest = typeof process !== 'undefined' && process.env.PLAYWRIGHT_TEST === 'true';
  if (supabase && !isTest) {
    const { data } = await supabase
      .from('threads')
      .select('title, created_at, profiles(handle)')
      .eq('id', id)
      .single();
    thread = data;
  }
} catch (e) {
  console.error('Error fetching thread for SEO:', e);
}

const title = thread ? `${thread.title} | Forum` : 'Forum Thread';
const description = 'Join the discussion on Horror Writer.';
const pageUrl = new URL(Astro.url.pathname, Astro.site).toString();
const postingSchema = thread ? buildDiscussionForumPostingSchema({
  url: pageUrl,
  headline: thread.title,
  authorName: thread.profiles?.handle || 'Unknown',
  datePublished: thread.created_at
}) : null;
---

<MainLayout title={title} description={description}>
  {postingSchema && <StructuredData data={postingSchema} />}
  <ThreadView id={id} client:load />
</MainLayout>
```

- [ ] **Step 5: Wire into `u/[handle].astro`**

```astro
---
export const prerender = false;

import MainLayout from '../../layouts/MainLayout.astro';
import StructuredData from '../../components/StructuredData.astro';
import UserProfile from '../../pages-react/UserProfile.jsx';
import { supabase } from '../../supabaseClient';
import { buildProfilePageSchema } from '../../lib/seo';

const { handle } = Astro.params;

let profile = null;
try {
  const isTest = typeof process !== 'undefined' && process.env.PLAYWRIGHT_TEST === 'true';
  if (supabase && handle && !isTest) {
    const { data } = await supabase
      .from('profiles')
      .select('display_name, bio')
      .eq('handle', handle)
      .single();
    profile = data;
  }
} catch (e) {
  console.error('Error fetching user profile details for SEO:', e);
}

const displayName = profile?.display_name || `@${handle}`;
const title = `${displayName} | Horror Writer`;
const description = profile?.bio || `Read ${displayName}'s stories and critiques on Horror Writer.`;
const pageUrl = new URL(Astro.url.pathname, Astro.site).toString();
const profileSchema = buildProfilePageSchema({ url: pageUrl, name: displayName });
---

<MainLayout title={title} description={description}>
  <StructuredData data={profileSchema} />
  <UserProfile handle={handle} client:load />
</MainLayout>
```

- [ ] **Step 6: Wire into `library/series/[id].astro`**

```astro
---
export const prerender = false
import MainLayout from '../../../layouts/MainLayout.astro'
import StructuredData from '../../../components/StructuredData.astro'
import SeriesHub from '../../../pages-react/SeriesHub'
import { supabase } from '../../../supabaseClient'
import { buildCreativeWorkSeriesSchema } from '../../../lib/seo'

const { id } = Astro.params

let series = null
try {
  const isTest = typeof process !== 'undefined' && process.env.PLAYWRIGHT_TEST === 'true'
  if (supabase && !isTest) {
    const { data } = await supabase
      .from('series')
      .select('title, description')
      .eq('id', id)
      .single()
    series = data
  }
} catch (e) {
  console.error('Error fetching series details for SEO:', e)
}

const title = series ? `${series.title} | Series | Horror Writer` : 'Series | Horror Writer'
const description = series?.description || 'A multi-story series on Horror Writer.'
const pageUrl = new URL(Astro.url.pathname, Astro.site).toString()
const seriesSchema = series ? buildCreativeWorkSeriesSchema({ url: pageUrl, name: series.title, description: series.description }) : null
---

<MainLayout title={title} description={description}>
  {seriesSchema && <StructuredData data={seriesSchema} />}
  <div class="series-shell">
    <SeriesHub client:load seriesId={id} />
  </div>
</MainLayout>

<style>
  .series-shell {
    max-width: 64rem;
    margin: 0 auto;
    padding: 2rem 1.5rem;
  }
</style>
```

- [ ] **Step 7: Manually verify**

Run: `npm run dev`, load each of the five routes in a browser, view source, confirm a `<script type="application/ld+json">` tag is present with valid JSON. Paste each into Google's Rich Results Test (https://search.google.com/test/rich-results) to confirm no schema errors.

- [ ] **Step 8: Run existing unit + E2E suites to confirm no regression**

Run: `npx vitest run` — expect all existing tests still pass (13 baseline + Task 1/2's new tests).
Run: `cmd /c npx playwright test` — expect 47/47 still passing (structured data is additive, doesn't change rendered UI or DOM the E2E specs assert on).

- [ ] **Step 9: Commit**

```bash
git add src/components/StructuredData.astro src/pages/index.astro src/pages/library/read/[id].astro src/pages/forum/thread/[id].astro src/pages/u/[handle].astro src/pages/library/series/[id].astro
git commit -m "feat(seo): add JSON-LD structured data to all major page types"
```

---

### Task 5: Dynamic OG image endpoint for stories

**Files:**
- Modify: `package.json` (add `workers-og` dependency)
- Create: `src/pages/og/story/[id].png.js`
- Modify: `src/layouts/MainLayout.astro` (accept `ogImage` override prop)
- Modify: `src/pages/library/read/[id].astro` (pass the dynamic OG image URL)

**Interfaces:**
- Consumes: `book.cover` (one of `'blood' | 'cyan' | 'bone'`, per `PublishStory.jsx`'s `COVER_OPTIONS`), `book.title`, author handle
- Produces: `GET /og/story/{id}.png` → PNG image response

- [ ] **Step 1: Add the dependency**

Run: `npm install workers-og`

- [ ] **Step 2: Write the OG image endpoint**

```javascript
// src/pages/og/story/[id].png.js
export const prerender = false

import { ImageResponse } from 'workers-og'
import { supabase } from '../../../supabaseClient'

// Mirrors PublishStory.jsx's COVER_OPTIONS and the design tokens in global.css
const COVER_COLORS = {
  blood: '#991B1B',
  cyan: '#312e81',
  bone: '#E5E1D8'
}

export async function GET({ params }) {
  const { id } = params

  let book = null
  if (supabase) {
    const { data } = await supabase
      .from('books')
      .select('title, cover, profiles(handle)')
      .eq('id', id)
      .single()
    book = data
  }

  const title = book?.title || 'A story on Horror Writer'
  const author = book?.profiles?.handle ? `@${book.profiles.handle}` : 'Horror Writer'
  const accent = COVER_COLORS[book?.cover] || COVER_COLORS.blood

  const html = `
    <div style="display: flex; flex-direction: column; justify-content: center; width: 1200px; height: 630px; background: #121212; padding: 80px; font-family: sans-serif;">
      <div style="display: flex; width: 60px; height: 6px; background: ${accent}; margin-bottom: 40px;"></div>
      <div style="display: flex; font-size: 56px; color: #E5E1D8; line-height: 1.2; max-height: 380px; overflow: hidden;">${title}</div>
      <div style="display: flex; font-size: 28px; color: #A3A39C; margin-top: 40px;">${author} · Horror Writer</div>
    </div>
  `

  return new ImageResponse(html, {
    width: 1200,
    height: 630,
    headers: { 'Cache-Control': 'public, max-age=86400' }
  })
}
```

- [ ] **Step 3: Add an `ogImage` override prop to `MainLayout.astro`**

Modify the `Props` interface and the `og:image`/`twitter:image` tags:

```astro
interface Props {
  title?: string;
  description?: string;
  ogImage?: string;
}

const { title = "Horror Writer", description = "A premium community for dark fiction writers.", ogImage } = Astro.props;

const canonicalURL = new URL(Astro.url.pathname, Astro.site);
const ogImageURL = ogImage ? new URL(ogImage, Astro.site) : new URL('/og.png', Astro.site);
```

(The rest of the `<head>` block already references `ogImageURL` for both `og:image` and `twitter:image` — no further change needed there.)

- [ ] **Step 4: Pass the dynamic OG image from the story read page**

In `src/pages/library/read/[id].astro`, add below the existing `title`/`description` consts:

```astro
const ogImage = `/og/story/${id}.png`;
```

And update the `<MainLayout>` tag:

```astro
<MainLayout title={title} description={description} ogImage={ogImage}>
```

- [ ] **Step 5: Manually verify**

Run: `npm run dev`, visit `http://localhost:5173/og/story/<a-real-book-id>.png` directly — expect a `200` PNG response rendering title/author/accent color. Then visit a story's read page and view source to confirm `<meta property="og:image">` points at `/og/story/{id}.png`.

- [ ] **Step 6: Run unit + E2E suites**

Run: `npx vitest run` and `cmd /c npx playwright test` — expect no regressions (MainLayout's new prop is optional and defaults to existing behavior for every other page).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/pages/og/story/[id].png.js src/layouts/MainLayout.astro "src/pages/library/read/[id].astro"
git commit -m "feat(seo): generate per-story OG images with workers-og"
```

---

### Task 6: Metadata copy audit

**Files:**
- Modify: `src/pages/my-stories.astro`
- Modify: `src/pages/library/series/[id].astro` (fallback description only, when `series` is null)

**Interfaces:** None — copy-only change, no new exports.

- [ ] **Step 1: Tighten `my-stories.astro`'s description**

Current (`src/pages/my-stories.astro:6`):
```astro
<MainLayout title="My Stories | Horror Writer" description="Manage your published stories and story series.">
```
This page is `Disallow`-ed in `robots.txt` as of Task 3 (owner-only, no public SEO value) — leave the title/description as-is; no change needed here since the page won't be indexed. (This step exists to record that the audit considered it and found no action required — see the spec's section 4.)

- [ ] **Step 2: Tighten the `library/series/[id].astro` fallback description**

Current fallback (when `series` is null, e.g. deleted/not-found): `'A multi-story series on Horror Writer.'` — already reasonably specific for a not-found state; leave as-is. Confirm during this step that no page in `src/pages/` omits `title`/`description` entirely (re-run the earlier grep):

Run: `grep -rn "MainLayout" src/pages --include=*.astro | grep -v "title="`
Expected: no output (every `<MainLayout>` usage passes `title`)

- [ ] **Step 3: Commit (if any copy changed)**

If Steps 1–2 found nothing to change, skip the commit — this task is an audit, not a guaranteed diff. If a description was tightened, commit with:

```bash
git add src/pages/<changed-file>.astro
git commit -m "fix(seo): tighten page description copy"
```

---

### Task 7: Core Web Vitals audit and fixes

**Files:** Determined by Step 1's Lighthouse findings, not fixed in advance — Step 3 below specifies exactly how to act on whatever is flagged. Likely candidates given the stack: `src/layouts/MainLayout.astro` (script/font loading order), image-rendering markup inside `src/pages-react/ReadStory.jsx` and `src/pages-react/ThreadView.jsx` (lazy-loading).

**Interfaces:** None — this task modifies existing rendering code in place; it introduces no new exports.

- [ ] **Step 1: Run Lighthouse against representative pages**

Run: `npm run build && npm run preview` (production build, not dev server — dev server numbers are not representative)
Then run Lighthouse (Chrome DevTools → Lighthouse tab, or `npx lighthouse http://localhost:4321 --view` if the CLI is available) against:
- `/` (home)
- `/library` (library index)
- `/library/read/<a-real-book-id>` (story read page)
- `/forum/thread/<a-real-thread-id>` (forum thread)

Record each page's Performance score and the specific flagged issues (e.g. "Serve images in next-gen formats", "Eliminate render-blocking resources", "Ensure text remains visible during webfont load").

- [ ] **Step 2: Verify `font-display: swap` is already correct**

Already confirmed present on every `@font-face` rule in `src/styles/fonts.css` — no action needed here, but re-check with:

Run: `grep -c "font-display: swap" src/styles/fonts.css`
Expected: `7` (one per `@font-face` block)

- [ ] **Step 3: Fix each Lighthouse finding from Step 1**

For each flagged issue, make the targeted fix (e.g. add `loading="lazy"` to below-the-fold `<img>` tags in story/forum content renderers, reorder/defer any newly-flagged blocking script). Do not fix issues Lighthouse didn't flag — this is an audit-driven task, not a preemptive checklist.

- [ ] **Step 4: Re-run Lighthouse to confirm improvement**

Run the same Lighthouse pass from Step 1 again; confirm the Performance score improved or the specific flagged issues are resolved.

- [ ] **Step 5: Run full test suites**

Run: `npx vitest run` and `cmd /c npx playwright test` — expect no regressions from any DOM/attribute changes made in Step 3.

- [ ] **Step 6: Commit**

```bash
git add <files changed in Step 3>
git commit -m "perf(seo): fix Core Web Vitals findings from Lighthouse audit"
```

---

## Post-plan verification

- [ ] `npx vitest run` — all unit tests pass (baseline 13 + this plan's ~11 new)
- [ ] `cmd /c npx playwright test` — 47/47 E2E tests still pass
- [ ] All four sitemap URLs (`sitemap-index.xml`, `sitemap-stories.xml`, `sitemap-threads.xml`, `sitemap-profiles.xml`) return valid XML in production after deploy
- [ ] JSON-LD on all five page types validates in Google's Rich Results Test
- [ ] A story's `og:image` renders correctly when pasted into Slack/Discord/Twitter card validators
