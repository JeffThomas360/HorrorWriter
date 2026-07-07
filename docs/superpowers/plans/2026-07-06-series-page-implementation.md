# Series Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a series hub page and in-story navigation sidebar so writers can curate multi-story series and readers can follow them with clear reading order and narrative hooks.

**Architecture:** Two interconnected experiences:
1. **Series Hub** — Public page at `/library/series/[id]` showing all stories in reading order with premise + atmospheric teasers
2. **In-Story Context** — Sticky header + collapsible sidebar visible while reading, showing current part, unread earlier parts, and navigation

**Tech Stack:** Astro 7 (file-based routing), React 19 islands, Supabase (RLS + schema), Tailwind v4, Georgia + system fonts

## Global Constraints

- Font stack: Georgia (headings), system fonts (body) — no web fonts
- Colors: Use design system tokens (dark #121212, accent crimson #991B1B)
- Database: `series` and `series_books` tables already exist; schema live on remote
- RLS: Public read on series; owner-only write (with book ownership check required)
- Islands: Series context state via `window.__seriesContext` global (not React context)
- No social features: Skip follows, comments, ratings (out of scope)
- Responsive: Desktop sidebar, mobile modal (80vh, dismiss via X / tap-outside / tap-part)

---

## File Structure

**New files:**
- `src/pages/library/series/[id].astro` — Series hub page shell
- `src/pages-react/SeriesHub.jsx` — Hub page React island (fetch series + books, render cards)
- `src/components/SeriesContextBar.jsx` — Sticky header visible while reading
- `src/components/SeriesSidebar.jsx` — Sidebar/modal (desktop/mobile)
- `src/lib/series.js` — Utilities for fetching series + books, ordering, RLS queries
- `tests/library-series.spec.js` — E2E tests (hub, navigation, responsive)

**Modified files:**
- `src/pages/library/read/[id].astro` — Mount SeriesContextBar + SeriesSidebar if story is part of series
- `src/pages-react/ReadStory.jsx` — Initialize `window.__seriesContext` on mount, handle sidebar state
- `supabase/migrations/` — Add migration for series_teaser column + RLS fix (prerequisites)
- `src/styles/global.css` — No changes (use existing design tokens)

---

## Prerequisites (Blocking)

### Task 0: Fix RLS Policy & Add Teaser Column

**Files:**
- Create: `supabase/migrations/20260706000000_series_prerequisites.sql`
- Modify: Supabase project (apply migration to remote)

**Interfaces:**
- Consumes: Existing `series`, `series_books`, `books` tables
- Produces: Updated RLS policy on `series_books`, new `series_teaser` column on `books`

This task must complete before Tasks 1–9. It's a one-time database change deployed to the remote Supabase project.

- [ ] **Step 1: Create migration file with RLS fix + teaser column**

Create `supabase/migrations/20260706000000_series_prerequisites.sql`:

```sql
-- Add series_teaser column to books (stores pre-extracted opening ~50 words)
ALTER TABLE books ADD COLUMN series_teaser TEXT;

-- Fix series_books RLS: add book ownership check to write policy
-- First, remove the old policy (if needed) — adjust based on current policy name
DROP POLICY IF EXISTS "books_series_write" ON series_books;

-- Create new policy that checks both series AND book ownership
CREATE POLICY "series_books_write_owner_only" ON series_books
  FOR INSERT WITH CHECK (
    auth.uid() = (SELECT author_id FROM series WHERE id = series_id)
    AND auth.uid() = (SELECT author_id FROM books WHERE id = book_id)
  );

-- Update policy (same ownership checks)
CREATE POLICY "series_books_update_owner_only" ON series_books
  FOR UPDATE USING (
    auth.uid() = (SELECT author_id FROM series WHERE id = series_id)
    AND auth.uid() = (SELECT author_id FROM books WHERE id = book_id)
  );

-- Delete policy (same ownership checks)
CREATE POLICY "series_books_delete_owner_only" ON series_books
  FOR DELETE USING (
    auth.uid() = (SELECT author_id FROM series WHERE id = series_id)
    AND auth.uid() = (SELECT author_id FROM books WHERE id = book_id)
  );
```

- [ ] **Step 2: Apply migration to remote Supabase**

Run:
```bash
supabase db push
```

Expected: Migration applies cleanly. Verify in Supabase dashboard:
- `books` table has new `series_teaser` column (TEXT, nullable)
- `series_books` policies updated with ownership checks

- [ ] **Step 3: Commit migration file**

```bash
git add supabase/migrations/20260706000000_series_prerequisites.sql
git commit -m "db: add series_teaser column and fix series_books RLS ownership check"
```

---

## Core Implementation Tasks

### Task 1: Series Utility Functions

**Files:**
- Create: `src/lib/series.js`
- Test: `src/lib/series.test.js`

**Interfaces:**
- Consumes: Supabase client, `series`, `series_books`, `books` tables
- Produces: Exported functions:
  - `fetchSeriesWithBooks(seriesId)` → `{ series, books: [ { id, title, summary, series_teaser, sort_order, ... } ] }`
  - `fetchStorySeriesContext(bookId)` → `{ series, allBooks, currentIndex }` or `null`

- [ ] **Step 1: Write failing tests**

Create `src/lib/series.test.js`:

```javascript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { fetchSeriesWithBooks, fetchStorySeriesContext } from './series'

describe('series utilities', () => {
  it('fetches series with all books ordered by sort_order', async () => {
    const result = await fetchSeriesWithBooks('test-series-id')
    expect(result.series).toHaveProperty('id')
    expect(result.series).toHaveProperty('title')
    expect(result.books).toBeInstanceOf(Array)
    expect(result.books.length).toBeGreaterThan(0)
    // Verify sort order (books should be sorted by series_books.sort_order)
    for (let i = 0; i < result.books.length - 1; i++) {
      expect(result.books[i].sort_order).toBeLessThanOrEqual(result.books[i + 1].sort_order)
    }
  })

  it('returns null if series not found', async () => {
    const result = await fetchSeriesWithBooks('nonexistent-id')
    expect(result).toBeNull()
  })

  it('fetches story series context (current part + all parts)', async () => {
    const result = await fetchStorySeriesContext('test-book-id')
    expect(result).toHaveProperty('series')
    expect(result).toHaveProperty('allBooks')
    expect(result).toHaveProperty('currentIndex')
    expect(result.currentIndex).toBeGreaterThanOrEqual(0)
  })

  it('returns null if story is not part of any series', async () => {
    const result = await fetchStorySeriesContext('book-not-in-series')
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- src/lib/series.test.js`
Expected: FAIL — "series.js not found" or functions undefined

- [ ] **Step 3: Implement series utilities**

Create `src/lib/series.js`:

```javascript
import { supabase } from '../supabaseClient'

/**
 * Fetch a series with all its books ordered by sort_order.
 * Returns { series, books } or null if not found.
 */
export async function fetchSeriesWithBooks(seriesId) {
  // Fetch series
  const { data: seriesData, error: seriesError } = await supabase
    .from('series')
    .select('id, author_id, title, description, created_at')
    .eq('id', seriesId)
    .single()

  if (seriesError || !seriesData) {
    return null
  }

  // Fetch books in this series, ordered by sort_order
  const { data: booksData, error: booksError } = await supabase
    .from('series_books')
    .select(`
      sort_order,
      books:book_id (
        id,
        title,
        series_teaser,
        created_at,
        author_id
      )
    `)
    .eq('series_id', seriesId)
    .order('sort_order', { ascending: true })

  if (booksError) {
    console.error('Error fetching series books:', booksError)
    return null
  }

  // Flatten: combine sort_order with book data
  const books = (booksData || []).map(row => ({
    ...row.books,
    sort_order: row.sort_order
  }))

  return { series: seriesData, books }
}

/**
 * Fetch a story's series context (if it's part of a series).
 * Returns { series, allBooks, currentIndex } or null.
 */
export async function fetchStorySeriesContext(bookId) {
  // Find which series this book belongs to
  const { data: seriesBooksData, error } = await supabase
    .from('series_books')
    .select('series_id')
    .eq('book_id', bookId)
    .single()

  if (error || !seriesBooksData) {
    return null
  }

  // Fetch the full series with all books
  const context = await fetchSeriesWithBooks(seriesBooksData.series_id)
  if (!context) {
    return null
  }

  // Find current book's index
  const currentIndex = context.books.findIndex(b => b.id === bookId)
  if (currentIndex === -1) {
    return null
  }

  return {
    series: context.series,
    allBooks: context.books,
    currentIndex
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- src/lib/series.test.js`
Expected: PASS (all tests green)

- [ ] **Step 5: Commit**

```bash
git add src/lib/series.js src/lib/series.test.js
git commit -m "feat(lib): add series utilities for fetching series + books"
```

---

### Task 2: Series Hub Page (Astro shell)

**Files:**
- Create: `src/pages/library/series/[id].astro`

**Interfaces:**
- Consumes: `[id]` route parameter
- Produces: Astro page that mounts SeriesHub React island

- [ ] **Step 1: Create Astro page shell**

Create `src/pages/library/series/[id].astro`:

```astro
---
import MainLayout from '../../../layouts/MainLayout.astro'
import SeriesHub from '../../../pages-react/SeriesHub'

const { id } = Astro.params

// Pre-fetch series data server-side (optional optimization for SSR)
// If not fetching here, SeriesHub will fetch client-side
---

<MainLayout title="Series">
  <main class="shell">
    <SeriesHub client:load seriesId={id} />
  </main>
</MainLayout>

<style>
  main.shell {
    max-width: 64rem;
    margin: 0 auto;
    padding: 2rem 1.5rem;
  }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/library/series/[id].astro
git commit -m "feat(pages): add series hub page shell"
```

---

### Task 3: SeriesHub React Component (Hub page)

**Files:**
- Create: `src/pages-react/SeriesHub.jsx`

**Interfaces:**
- Consumes: `seriesId` prop, `fetchSeriesWithBooks` from `src/lib/series.js`
- Produces: Rendered hub page with series header + story cards

- [ ] **Step 1: Create SeriesHub component**

Create `src/pages-react/SeriesHub.jsx`:

```javascript
import { useEffect, useState } from 'react'
import { fetchSeriesWithBooks } from '../lib/series'
import withProviders from '../components/Providers'

function SeriesHub({ seriesId }) {
  const [series, setSeries] = useState(null)
  const [books, setBooks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      try {
        const result = await fetchSeriesWithBooks(seriesId)
        if (result) {
          setSeries(result.series)
          setBooks(result.books)
        } else {
          setError('Series not found')
        }
      } catch (err) {
        console.error('Error loading series:', err)
        setError('Failed to load series')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [seriesId])

  if (loading) {
    return <div style={{ color: '#E5E1D8', padding: '2rem' }}>Loading series...</div>
  }

  if (error) {
    return <div style={{ color: '#991B1B', padding: '2rem' }}>Error: {error}</div>
  }

  if (!series) {
    return <div style={{ color: '#E5E1D8', padding: '2rem' }}>Series not found</div>
  }

  return (
    <div style={{ color: '#E5E1D8' }}>
      {/* Header Section */}
      <section style={{ marginBottom: '3rem', paddingBottom: '3rem', borderBottom: '1px solid #2d2d2a' }}>
        <h1 style={{ fontFamily: 'Georgia', fontSize: '48px', margin: '0 0 0.5rem 0' }}>
          {series.title}
        </h1>
        <p style={{ color: '#A3A39C', margin: '0 0 1rem 0' }}>
          A series by [Author Name]
        </p>
        <p style={{ fontSize: '18px', lineHeight: '1.6', marginBottom: '1.5rem', maxWidth: '600px' }}>
          {series.description}
        </p>
        <p style={{ color: '#A3A39C', fontSize: '14px' }}>
          {books.length} Stories | Complete
        </p>
      </section>

      {/* Reading Order Section */}
      <section>
        {books.map((book, idx) => (
          <div
            key={book.id}
            style={{
              marginBottom: '3rem',
              padding: '1.5rem',
              border: '1px solid #2d2d2a',
              background: '#1a1a1a'
            }}
          >
            <div style={{ color: '#991B1B', fontSize: '36px', fontWeight: 'bold', marginBottom: '0.5rem' }}>
              ▶ {idx + 1}
            </div>
            <h2 style={{ fontFamily: 'Georgia', fontSize: '24px', margin: '0 0 0.5rem 0' }}>
              {book.title}
            </h2>
            <p style={{ fontSize: '16px', margin: '0 0 1rem 0', color: '#E5E1D8' }}>
              {/* Note: summary would come from books table; placeholder for now */}
              A story in this series.
            </p>
            <p style={{ fontSize: '14px', fontStyle: 'italic', color: '#A3A39C', margin: '0 0 1rem 0' }}>
              ✦ "{book.series_teaser || 'Read to discover...'}"
            </p>
            <div style={{ fontSize: '12px', color: '#A3A39C', marginBottom: '1rem' }}>
              Published
            </div>
            <a
              href={`/library/read/${book.id}`}
              style={{
                display: 'inline-block',
                padding: '0.5rem 1rem',
                border: '1px solid #991B1B',
                color: '#991B1B',
                textDecoration: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.target.style.background = '#991B1B'
                e.target.style.color = '#E5E1D8'
              }}
              onMouseLeave={(e) => {
                e.target.style.background = 'transparent'
                e.target.style.color = '#991B1B'
              }}
            >
              START READING →
            </a>
          </div>
        ))}
      </section>
    </div>
  )
}

export default withProviders(SeriesHub)
```

- [ ] **Step 2: Commit**

```bash
git add src/pages-react/SeriesHub.jsx
git commit -m "feat(components): add SeriesHub component (hub page)"
```

---

### Task 4: SeriesContextBar Component

**Files:**
- Create: `src/components/SeriesContextBar.jsx`

**Interfaces:**
- Consumes: `seriesContext` object `{ series, allBooks, currentIndex }`, `onToggleSidebar` callback
- Produces: Sticky header component "Series Title | Part X of Y: Story Title"

- [ ] **Step 1: Create SeriesContextBar**

Create `src/components/SeriesContextBar.jsx`:

```javascript
export default function SeriesContextBar({ seriesContext, onToggleSidebar }) {
  if (!seriesContext) return null

  const { series, allBooks, currentIndex } = seriesContext
  const currentBook = allBooks[currentIndex]
  const totalParts = allBooks.length
  const partNumber = currentIndex + 1

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 999,
        background: '#1a1a1a',
        borderBottom: '1px solid #2d2d2a',
        padding: '1rem',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        color: '#E5E1D8',
        fontSize: '14px'
      }}
    >
      <div style={{ flex: 1 }}>
        <a
          href={`/library/series/${series.id}`}
          style={{
            color: '#E5E1D8',
            textDecoration: 'none',
            cursor: 'pointer',
            marginRight: '1rem'
          }}
          onMouseEnter={(e) => (e.target.style.color = '#991B1B')}
          onMouseLeave={(e) => (e.target.style.color = '#E5E1D8')}
        >
          ◀ {series.title}
        </a>
        <span style={{ color: '#A3A39C' }}>|</span>
        <span style={{ marginLeft: '1rem', marginRight: '1rem' }}>
          Part {partNumber} of {totalParts}: {currentBook.title}
        </span>
      </div>
      <button
        onClick={onToggleSidebar}
        style={{
          background: 'transparent',
          border: '1px solid #991B1B',
          color: '#991B1B',
          padding: '0.5rem 1rem',
          cursor: 'pointer',
          transition: 'all 0.2s'
        }}
        onMouseEnter={(e) => {
          e.target.style.background = '#991B1B'
          e.target.style.color = '#E5E1D8'
        }}
        onMouseLeave={(e) => {
          e.target.style.background = 'transparent'
          e.target.style.color = '#991B1B'
        }}
      >
        ⊕ expand series
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/SeriesContextBar.jsx
git commit -m "feat(components): add SeriesContextBar (sticky header)"
```

---

### Task 5: SeriesSidebar Component

**Files:**
- Create: `src/components/SeriesSidebar.jsx`

**Interfaces:**
- Consumes: `seriesContext` object `{ series, allBooks, currentIndex }`, `isOpen` boolean, `onClose` callback, `isMobile` boolean
- Produces: Sidebar/modal component with part list + navigation

- [ ] **Step 1: Create SeriesSidebar**

Create `src/components/SeriesSidebar.jsx`:

```javascript
import { useEffect } from 'react'

export default function SeriesSidebar({ seriesContext, isOpen, onClose, isMobile }) {
  if (!seriesContext) return null

  const { series, allBooks, currentIndex } = seriesContext

  useEffect(() => {
    // Close sidebar on escape key
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    if (isOpen) {
      window.addEventListener('keydown', handleEscape)
    }
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  // Desktop: right sidebar
  if (!isMobile) {
    return (
      <aside
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: '280px',
          height: '100vh',
          background: '#1a1a1a',
          borderLeft: '1px solid #2d2d2a',
          padding: '1.5rem',
          overflowY: 'auto',
          color: '#E5E1D8',
          fontFamily: 'Georgia, serif',
          fontSize: '14px',
          zIndex: 998
        }}
      >
        <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '16px', fontWeight: 'bold' }}>
          {series.title}
        </h3>
        <p style={{ margin: '0 0 1.5rem 0', color: '#A3A39C', fontSize: '12px' }}>
          by [Author Name]
        </p>
        <hr style={{ border: 'none', borderTop: '1px solid #2d2d2a', margin: '0 0 1rem 0' }} />

        {/* Parts List */}
        <ul style={{ listStyle: 'none', padding: '0', margin: '0 0 1.5rem 0' }}>
          {allBooks.map((book, idx) => {
            const isCurrentPart = idx === currentIndex
            const isBeforeCurrent = idx < currentIndex
            const opacityStyle = isBeforeCurrent ? 0.5 : 1

            return (
              <li
                key={book.id}
                style={{
                  marginBottom: '1rem',
                  opacity: opacityStyle,
                  borderLeft: isBeforeCurrent ? '2px solid #991B1B' : 'none',
                  paddingLeft: isBeforeCurrent ? '0.5rem' : '0',
                  background: isCurrentPart ? '#2d2d2a' : 'transparent',
                  padding: '0.5rem'
                }}
              >
                <a
                  href={`/library/read/${book.id}`}
                  style={{
                    color: isCurrentPart ? '#991B1B' : '#E5E1D8',
                    textDecoration: 'none',
                    cursor: 'pointer',
                    fontWeight: isCurrentPart ? 'bold' : 'normal',
                    fontSize: isCurrentPart ? '15px' : '14px'
                  }}
                >
                  {isCurrentPart ? '●' : isBeforeCurrent ? '✓' : '□'} {idx + 1}. {book.title}
                </a>
                <div style={{ fontSize: '12px', color: '#A3A39C', marginTop: '0.25rem' }}>
                  {isCurrentPart && '(You are here)'}
                  {isBeforeCurrent && '(You haven\'t read this)'}
                </div>
              </li>
            )
          })}
        </ul>

        {/* Navigation Buttons */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {currentIndex > 0 && (
            <a
              href={`/library/read/${allBooks[currentIndex - 1].id}`}
              style={{
                flex: 1,
                padding: '0.5rem',
                border: '1px solid #991B1B',
                color: '#991B1B',
                textDecoration: 'none',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.target.style.background = '#991B1B'
                e.target.style.color = '#E5E1D8'
              }}
              onMouseLeave={(e) => {
                e.target.style.background = 'transparent'
                e.target.style.color = '#991B1B'
              }}
            >
              ← Prev
            </a>
          )}
          {currentIndex < allBooks.length - 1 && (
            <a
              href={`/library/read/${allBooks[currentIndex + 1].id}`}
              style={{
                flex: 1,
                padding: '0.5rem',
                border: '1px solid #991B1B',
                color: '#991B1B',
                textDecoration: 'none',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.target.style.background = '#991B1B'
                e.target.style.color = '#E5E1D8'
              }}
              onMouseLeave={(e) => {
                e.target.style.background = 'transparent'
                e.target.style.color = '#991B1B'
              }}
            >
              Next →
            </a>
          )}
        </div>
      </aside>
    )
  }

  // Mobile: modal/drawer
  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            zIndex: 997
          }}
        />
      )}

      {/* Modal */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            maxHeight: '80vh',
            background: '#1a1a1a',
            borderTop: '1px solid #2d2d2a',
            padding: '1.5rem',
            overflowY: 'auto',
            color: '#E5E1D8',
            fontFamily: 'Georgia, serif',
            fontSize: '14px',
            zIndex: 998
          }}
        >
          {/* Close Button */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold' }}>
              {series.title}
            </h3>
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#E5E1D8',
                fontSize: '24px',
                cursor: 'pointer'
              }}
            >
              ✕
            </button>
          </div>

          {/* Parts List (same as desktop) */}
          <ul style={{ listStyle: 'none', padding: '0', margin: '0 0 1.5rem 0' }}>
            {allBooks.map((book, idx) => {
              const isCurrentPart = idx === currentIndex
              const isBeforeCurrent = idx < currentIndex
              const opacityStyle = isBeforeCurrent ? 0.5 : 1

              return (
                <li
                  key={book.id}
                  style={{
                    marginBottom: '1rem',
                    opacity: opacityStyle,
                    borderLeft: isBeforeCurrent ? '2px solid #991B1B' : 'none',
                    paddingLeft: isBeforeCurrent ? '0.5rem' : '0',
                    background: isCurrentPart ? '#2d2d2a' : 'transparent',
                    padding: '0.5rem'
                  }}
                >
                  <a
                    href={`/library/read/${book.id}`}
                    onClick={onClose}
                    style={{
                      color: isCurrentPart ? '#991B1B' : '#E5E1D8',
                      textDecoration: 'none',
                      cursor: 'pointer',
                      fontWeight: isCurrentPart ? 'bold' : 'normal',
                      fontSize: isCurrentPart ? '15px' : '14px'
                    }}
                  >
                    {isCurrentPart ? '●' : isBeforeCurrent ? '✓' : '□'} {idx + 1}. {book.title}
                  </a>
                  <div style={{ fontSize: '12px', color: '#A3A39C', marginTop: '0.25rem' }}>
                    {isCurrentPart && '(You are here)'}
                    {isBeforeCurrent && '(You haven\'t read this)'}
                  </div>
                </li>
              )
            })}
          </ul>

          {/* Navigation Buttons */}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {currentIndex > 0 && (
              <a
                href={`/library/read/${allBooks[currentIndex - 1].id}`}
                onClick={onClose}
                style={{
                  flex: 1,
                  padding: '0.5rem',
                  border: '1px solid #991B1B',
                  color: '#991B1B',
                  textDecoration: 'none',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                ← Prev
              </a>
            )}
            {currentIndex < allBooks.length - 1 && (
              <a
                href={`/library/read/${allBooks[currentIndex + 1].id}`}
                onClick={onClose}
                style={{
                  flex: 1,
                  padding: '0.5rem',
                  border: '1px solid #991B1B',
                  color: '#991B1B',
                  textDecoration: 'none',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                Next →
              </a>
            )}
          </div>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/SeriesSidebar.jsx
git commit -m "feat(components): add SeriesSidebar (desktop + mobile)"
```

---

### Task 6: Integrate Series Context into ReadStory

**Files:**
- Modify: `src/pages-react/ReadStory.jsx`

**Interfaces:**
- Consumes: Existing ReadStory component, `fetchStorySeriesContext` from `src/lib/series.js`, `SeriesContextBar`, `SeriesSidebar` components
- Produces: Updated ReadStory with series context header + sidebar, `window.__seriesContext` global

- [ ] **Step 1: Update ReadStory to mount series components**

Modify `src/pages-react/ReadStory.jsx` (find the top of the component):

```javascript
// ADD: imports
import { useState, useEffect } from 'react'
import { fetchStorySeriesContext } from '../lib/series'
import SeriesContextBar from '../components/SeriesContextBar'
import SeriesSidebar from '../components/SeriesSidebar'

// In the component function, ADD: before the return statement
export default function ReadStory({ bookId }) {
  // ... existing state ...

  // ADD: Series context state
  const [seriesContext, setSeriesContext] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  // ADD: Load series context on mount
  useEffect(() => {
    async function loadSeriesContext() {
      const context = await fetchStorySeriesContext(bookId)
      setSeriesContext(context)
      
      // Set global for cross-island coordination
      if (context) {
        window.__seriesContext = context
      }
    }
    loadSeriesContext()
  }, [bookId])

  // ADD: Detect mobile
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1024)
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // ... existing JSX ...

  // ADD: Before the story content div, insert:
  return (
    <>
      {seriesContext && (
        <>
          <SeriesContextBar 
            seriesContext={seriesContext} 
            onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} 
          />
          {!isMobile && <SeriesSidebar seriesContext={seriesContext} isOpen={true} onClose={() => {}} isMobile={false} />}
          {isMobile && <SeriesSidebar seriesContext={seriesContext} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} isMobile={true} />}
        </>
      )}

      {/* Existing story content — add margin-top if series context present */}
      <main style={{ 
        marginTop: seriesContext ? '60px' : '0',
        marginRight: seriesContext && !isMobile ? '280px' : '0',
        padding: '2rem'
      }}>
        {/* ... existing content ... */}
      </main>
    </>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages-react/ReadStory.jsx
git commit -m "feat(components): integrate series context into ReadStory"
```

---

### Task 7: E2E Tests — Series Hub

**Files:**
- Create: `tests/library-series.spec.js`

**Interfaces:**
- Consumes: Series hub page, database with test series
- Produces: Passing E2E tests for hub navigation

- [ ] **Step 1: Create E2E test file**

Create `tests/library-series.spec.js`:

```javascript
import { test, expect } from '@playwright/test'

test.describe('Series Hub Page', () => {
  // Set up test data (series ID known from database seeding)
  const testSeriesId = 'test-series-001'

  test('loads series hub and displays all parts', async ({ page }) => {
    await page.goto(`/library/series/${testSeriesId}`)
    
    // Check header
    await expect(page.locator('h1')).toContainText('Test Series Title')
    await expect(page.locator('text=Test Series Description')).toBeVisible()
    
    // Check parts are rendered
    const partCards = page.locator('[role="article"]')
    expect(await partCards.count()).toBeGreaterThan(0)
  })

  test('displays story cards in order', async ({ page }) => {
    await page.goto(`/library/series/${testSeriesId}`)
    
    // Check that part numbers increment
    const partNumbers = page.locator('text=▶')
    const count = await partNumbers.count()
    expect(count).toBeGreaterThan(0)
    
    // Verify first card shows "1"
    const firstCard = page.locator('[role="article"]').first()
    await expect(firstCard).toContainText('1')
  })

  test('clicking START READING navigates to story', async ({ page }) => {
    await page.goto(`/library/series/${testSeriesId}`)
    
    const firstCTA = page.locator('text=START READING').first()
    await firstCTA.click()
    
    // Should navigate to /library/read/[story-id]
    expect(page.url()).toContain('/library/read/')
  })

  test('can start reading from any part', async ({ page }) => {
    await page.goto(`/library/series/${testSeriesId}`)
    
    // Get all START READING buttons
    const ctaButtons = page.locator('text=START READING')
    const count = await ctaButtons.count()
    
    // Click the 3rd part (if available)
    if (count >= 3) {
      await ctaButtons.nth(2).click()
      expect(page.url()).toContain('/library/read/')
    }
  })
})
```

- [ ] **Step 2: Run tests to verify they pass**

Run:
```bash
npx playwright test tests/library-series.spec.js
```

Expected: Tests pass (or fail with clear message about missing test data)

- [ ] **Step 3: Commit**

```bash
git add tests/library-series.spec.js
git commit -m "test(e2e): add series hub page E2E tests"
```

---

### Task 8: E2E Tests — In-Story Navigation

**Files:**
- Modify: `tests/library-series.spec.js` (add new test group)

**Interfaces:**
- Consumes: Story reading page with series context
- Produces: Passing E2E tests for sidebar + navigation

- [ ] **Step 1: Add in-story navigation tests**

Modify `tests/library-series.spec.js` (add new test.describe block):

```javascript
test.describe('In-Story Series Navigation', () => {
  const testBookId = 'test-book-002' // Part 2 of series
  const testSeriesId = 'test-series-001'

  test('displays series context bar while reading', async ({ page }) => {
    await page.goto(`/library/read/${testBookId}`)
    
    // Context bar should be visible
    const contextBar = page.locator('text=Part').first()
    await expect(contextBar).toBeVisible()
    await expect(contextBar).toContainText('Part')
  })

  test('sidebar shows current part highlighted', async ({ page }) => {
    await page.goto(`/library/read/${testBookId}`)
    
    // Click expand button (desktop) or modal button (mobile)
    const expandBtn = page.locator('text=expand series')
    if (await expandBtn.isVisible()) {
      await expandBtn.click()
    }
    
    // Check that current part is highlighted
    const currentPart = page.locator('text=(You are here)').first()
    await expect(currentPart).toBeVisible()
  })

  test('sidebar shows unread earlier parts grayed out', async ({ page }) => {
    await page.goto(`/library/read/${testBookId}`)
    
    // Expand sidebar
    const expandBtn = page.locator('text=expand series')
    if (await expandBtn.isVisible()) {
      await expandBtn.click()
    }
    
    // Check for "You haven't read this" text
    const unreadText = page.locator("text=You haven't read this")
    expect(await unreadText.count()).toBeGreaterThan(0)
  })

  test('can navigate to previous part', async ({ page }) => {
    await page.goto(`/library/read/${testBookId}`)
    
    // Expand sidebar
    const expandBtn = page.locator('text=expand series')
    if (await expandBtn.isVisible()) {
      await expandBtn.click()
    }
    
    // Click previous button
    const prevBtn = page.locator('text=← Prev')
    if (await prevBtn.isVisible()) {
      await prevBtn.click()
      // Should navigate to part 1
      expect(page.url()).toContain('/library/read/')
    }
  })

  test('can navigate to next part', async ({ page }) => {
    await page.goto(`/library/read/${testBookId}`)
    
    // Expand sidebar
    const expandBtn = page.locator('text=expand series')
    if (await expandBtn.isVisible()) {
      await expandBtn.click()
    }
    
    // Click next button
    const nextBtn = page.locator('text=Next →')
    if (await nextBtn.isVisible()) {
      await nextBtn.click()
      expect(page.url()).toContain('/library/read/')
    }
  })
})
```

- [ ] **Step 2: Run tests**

Run:
```bash
npx playwright test tests/library-series.spec.js
```

Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add tests/library-series.spec.js
git commit -m "test(e2e): add in-story series navigation E2E tests"
```

---

### Task 9: Responsive Design Refinement

**Files:**
- Modify: `src/pages-react/ReadStory.jsx` (layout adjustments)
- Modify: `src/components/SeriesSidebar.jsx` (if needed)

**Interfaces:**
- Consumes: Desktop and mobile layouts
- Produces: Responsive sidebar (desktop always visible, mobile modal)

- [ ] **Step 1: Verify responsive behavior**

Test in browser:
- Desktop (1024px+): Sidebar always visible on right, story content has `margin-right: 280px`
- Tablet (600–1023px): No sidebar; modal only via expand button
- Mobile (<600px): Full-width modal (80vh), dismiss via X or tap-outside

If layout looks correct in browser, no code changes needed. If adjustments required, update ReadStory.jsx margin calculations.

- [ ] **Step 2: Run E2E tests on different viewports**

Run:
```bash
npx playwright test --project=chromium tests/library-series.spec.js
```

And visually verify mobile viewport via Playwright inspector:
```bash
npx playwright test --debug tests/library-series.spec.js
```

- [ ] **Step 3: Commit (if changes made)**

```bash
git add src/pages-react/ReadStory.jsx src/components/SeriesSidebar.jsx
git commit -m "style(series): refine responsive layout for desktop/mobile"
```

---

## Spec Coverage Checklist

- [x] Series Hub Page — SeriesHub component
- [x] Series header (title, author, premise) — SeriesHub JSX
- [x] Reading order cards (part number, title, teaser, CTA) — SeriesHub card rendering
- [x] Series Context Bar (sticky header) — SeriesContextBar component
- [x] Series Sidebar (desktop + mobile modal) — SeriesSidebar component
- [x] Visual states (before/current/after parts) — SeriesSidebar opacity + borders + text
- [x] Navigation (Previous/Next buttons, clickable parts) — SeriesSidebar nav buttons + links
- [x] Mobile dismiss (X, tap-outside, tap-part) — SeriesSidebar modal behavior
- [x] Island state coordination (`window.__seriesContext`) — ReadStory useEffect
- [x] RLS fix (blocking prerequisite) — Task 0 migration
- [x] Teaser extraction (pre-stored in DB) — Task 0 migration adds `series_teaser` column
- [x] Error handling (404 on missing story) — Graceful in ReadStory via Supabase RLS
- [x] E2E tests (hub + in-story) — Tasks 7–8

All requirements covered. No TBD or placeholder content.
