# Story Series Writer-Side UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let writers create Story Series, assign their own published stories to a series (with
ordering), and delete a series they own — via a new `/my-stories` dashboard and an optional
"Part of a series?" field on the publish form.

**Architecture:** Extend `src/lib/series.js` with writer-mutation functions (create/add/remove/
reorder/delete), reusing the mocked-client unit-test pattern already established there. Build a
new React island `MyStories.jsx` (route `/my-stories`) using `@tanstack/react-query` for
fetch/mutate/invalidate, following the exact `useMutation` + `toast` conventions used in
`Profile.jsx`. Add one optional attach-only dropdown to `PublishStory.jsx`. All series deletion
is a real hard `DELETE` (no soft-delete/restore) per the 2026-07-19 deletion-policy correction.

**Tech Stack:** Astro 7 route + React 19 island, `@tanstack/react-query`, Supabase JS client,
`sonner` toasts, Tailwind v4 utility classes with the site's `--color-*` design tokens, Vitest
(mocked Supabase client) + Playwright E2E.

## Global Constraints

- One series per story (no multi-series membership).
- Series creation always includes exactly one initial story — no series is ever created empty.
- `PublishStory.jsx`'s series dropdown is **attach-only**: it lists the writer's existing series
  and never creates a new one.
- Series deletion is a **real hard delete** — no `deleted_at` column, no restore/undelete UI
  (`series_books` cascade-deletes automatically via the existing FK; the stories themselves are
  untouched).
- Ordering control is a plain numeric input bound to `sort_order` — no drag-and-drop dependency.
- `supabase` client can be null — every new exported function in `src/lib/series.js` must guard
  it (`if (!supabase) ...`), matching the rest of the codebase.
- No story-editing UI is introduced (none exists anywhere in the app today — out of scope).
- Follow existing conventions exactly: `withProviders(Component)` wrapping, `RequireAuth` gating
  for any authenticated-only page, Tailwind classes using `var(--color-bg-surface)` /
  `var(--color-text-primary)` / `var(--color-text-secondary)` / `var(--color-accent-crimson)` /
  `#2d2d2a` borders, `font-mono text-xs uppercase` for labels/buttons, `vintage-card` for card
  containers.

---

### Task 1: `src/lib/series.js` — writer-mutation and fetch helpers

**Files:**
- Modify: `src/lib/series.js`
- Test: `src/lib/series.test.js`

**Interfaces:**
- Consumes: `supabase` from `../supabaseClient` (existing import in this file).
- Produces (all exported, all async):
  - `fetchMySeriesWithBooks(authorId)` → `Array<{ id, title, description, created_at, books: Array<{ id, title, created_at, sort_order }> }>` (empty array if `!supabase`, no `authorId`, or no rows)
  - `fetchMyBooks(authorId)` → `Array<{ id, title, lede, created_at, comments_count, seriesId: string|null, seriesTitle: string|null }>`
  - `fetchAuthorSeriesOptions(authorId)` → `Array<{ id, title }>`
  - `createSeriesWithInitialStory({ authorId, title, description, initialBookId })` → `{ id }` (throws on error)
  - `addBookToSeries({ seriesId, bookId })` → `void` (throws on error; computes the next `sort_order` internally)
  - `removeBookFromSeries({ seriesId, bookId })` → `void` (throws on error)
  - `updateBookSortOrder({ seriesId, bookId, sortOrder })` → `void` (throws on error)
  - `deleteSeries(seriesId)` → `void` (throws on error; real `DELETE` on the `series` row)

- [ ] **Step 1: Write the failing tests**

Add to the bottom of `src/lib/series.test.js` (the file already has `makeQuery`, `mockSupabase`,
and the `vi.mock('../supabaseClient', ...)` setup at the top — these new tests reuse that same
mock, plus a couple of small additional query-builder helpers for insert/update/delete chains
defined right here):

```js
function makeMutationQuery(result) {
  const q = {
    insert: vi.fn(() => q),
    update: vi.fn(() => q),
    delete: vi.fn(() => q),
    select: vi.fn(() => q),
    eq: vi.fn(() => q),
    order: vi.fn(() => q),
    limit: vi.fn(() => Promise.resolve(result)),
    single: vi.fn(() => Promise.resolve(result)),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  }
  return q
}

const {
  fetchMySeriesWithBooks,
  fetchMyBooks,
  fetchAuthorSeriesOptions,
  createSeriesWithInitialStory,
  addBookToSeries,
  removeBookFromSeries,
  updateBookSortOrder,
  deleteSeries
} = await import('./series')

describe('fetchMySeriesWithBooks', () => {
  it('returns each series with its books ordered by sort_order', async () => {
    mockSupabase.from
      .mockReturnValueOnce(makeQuery({
        data: [{ id: 'series-1', title: 'The Hollow Chronicles', description: 'desc', created_at: '2026-01-01' }],
        error: null
      }))
      .mockReturnValueOnce(makeQuery({
        data: [
          { series_id: 'series-1', sort_order: 1, books: { id: 'book-1', title: 'Part One', created_at: '2026-01-01' } },
          { series_id: 'series-1', sort_order: 0, books: { id: 'book-0', title: 'Prologue', created_at: '2026-01-01' } }
        ],
        error: null
      }))

    const result = await fetchMySeriesWithBooks('author-1')
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('The Hollow Chronicles')
    expect(result[0].books.map(b => b.id)).toEqual(['book-0', 'book-1'])
  })

  it('returns an empty array when the author has no series', async () => {
    mockSupabase.from.mockReturnValueOnce(makeQuery({ data: [], error: null }))
    expect(await fetchMySeriesWithBooks('author-1')).toEqual([])
  })

  it('returns an empty array with no authorId', async () => {
    expect(await fetchMySeriesWithBooks(null)).toEqual([])
  })
})

describe('fetchMyBooks', () => {
  it('marks each book with its series assignment, if any', async () => {
    mockSupabase.from
      .mockReturnValueOnce(makeQuery({
        data: [
          { id: 'book-1', title: 'Part One', lede: 'lede1', created_at: '2026-01-01', comments_count: 2 },
          { id: 'book-2', title: 'Standalone', lede: 'lede2', created_at: '2026-01-02', comments_count: 0 }
        ],
        error: null
      }))
      .mockReturnValueOnce(makeQuery({
        data: [{ book_id: 'book-1', series: { id: 'series-1', title: 'The Hollow Chronicles' } }],
        error: null
      }))

    const result = await fetchMyBooks('author-1')
    expect(result.find(b => b.id === 'book-1')).toMatchObject({ seriesId: 'series-1', seriesTitle: 'The Hollow Chronicles' })
    expect(result.find(b => b.id === 'book-2')).toMatchObject({ seriesId: null, seriesTitle: null })
  })

  it('returns an empty array when the author has no books', async () => {
    mockSupabase.from.mockReturnValueOnce(makeQuery({ data: [], error: null }))
    expect(await fetchMyBooks('author-1')).toEqual([])
  })
})

describe('fetchAuthorSeriesOptions', () => {
  it('returns id/title pairs for the dropdown', async () => {
    mockSupabase.from.mockReturnValueOnce(makeQuery({
      data: [{ id: 'series-1', title: 'The Hollow Chronicles' }],
      error: null
    }))
    expect(await fetchAuthorSeriesOptions('author-1')).toEqual([{ id: 'series-1', title: 'The Hollow Chronicles' }])
  })
})

describe('createSeriesWithInitialStory', () => {
  it('inserts the series then links the initial book at sort_order 0', async () => {
    mockSupabase.from
      .mockReturnValueOnce(makeMutationQuery({ data: { id: 'series-new' }, error: null }))
      .mockReturnValueOnce(makeMutationQuery({ data: null, error: null }))

    const result = await createSeriesWithInitialStory({
      authorId: 'author-1', title: 'New Series', description: '', initialBookId: 'book-1'
    })
    expect(result).toEqual({ id: 'series-new' })
  })

  it('throws if the series insert fails', async () => {
    mockSupabase.from.mockReturnValueOnce(makeMutationQuery({ data: null, error: { message: 'boom' } }))
    await expect(createSeriesWithInitialStory({
      authorId: 'author-1', title: 'New Series', description: '', initialBookId: 'book-1'
    })).rejects.toBeTruthy()
  })
})

describe('addBookToSeries', () => {
  it('computes the next sort_order and inserts', async () => {
    mockSupabase.from
      .mockReturnValueOnce(makeMutationQuery({ data: [{ sort_order: 2 }], error: null }))
      .mockReturnValueOnce(makeMutationQuery({ data: null, error: null }))

    await expect(addBookToSeries({ seriesId: 'series-1', bookId: 'book-3' })).resolves.toBeUndefined()
  })

  it('uses sort_order 0 when the series has no books yet', async () => {
    mockSupabase.from
      .mockReturnValueOnce(makeMutationQuery({ data: [], error: null }))
      .mockReturnValueOnce(makeMutationQuery({ data: null, error: null }))

    await expect(addBookToSeries({ seriesId: 'series-1', bookId: 'book-3' })).resolves.toBeUndefined()
  })
})

describe('removeBookFromSeries', () => {
  it('deletes the series_books row', async () => {
    mockSupabase.from.mockReturnValueOnce(makeMutationQuery({ data: null, error: null }))
    await expect(removeBookFromSeries({ seriesId: 'series-1', bookId: 'book-1' })).resolves.toBeUndefined()
  })
})

describe('updateBookSortOrder', () => {
  it('updates the sort_order', async () => {
    mockSupabase.from.mockReturnValueOnce(makeMutationQuery({ data: null, error: null }))
    await expect(updateBookSortOrder({ seriesId: 'series-1', bookId: 'book-1', sortOrder: 5 })).resolves.toBeUndefined()
  })
})

describe('deleteSeries', () => {
  it('hard-deletes the series row', async () => {
    mockSupabase.from.mockReturnValueOnce(makeMutationQuery({ data: null, error: null }))
    await expect(deleteSeries('series-1')).resolves.toBeUndefined()
  })

  it('throws on error', async () => {
    mockSupabase.from.mockReturnValueOnce(makeMutationQuery({ data: null, error: { message: 'boom' } }))
    await expect(deleteSeries('series-1')).rejects.toBeTruthy()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit`
Expected: FAIL — `fetchMySeriesWithBooks`, `fetchMyBooks`, `fetchAuthorSeriesOptions`,
`createSeriesWithInitialStory`, `addBookToSeries`, `removeBookFromSeries`,
`updateBookSortOrder`, `deleteSeries` are not exported from `./series`.

- [ ] **Step 3: Implement the functions**

Append to `src/lib/series.js` (after the existing `fetchStorySeriesContext` function):

```js
/**
 * Fetch all of an author's series, each with its books ordered by sort_order.
 */
export async function fetchMySeriesWithBooks(authorId) {
  if (!supabase || !authorId) return []

  const { data: seriesRows, error: seriesError } = await supabase
    .from('series')
    .select('id, title, description, created_at')
    .eq('author_id', authorId)
    .order('created_at', { ascending: false })

  if (seriesError || !seriesRows || seriesRows.length === 0) return []

  const seriesIds = seriesRows.map(s => s.id)

  const { data: booksRows, error: booksError } = await supabase
    .from('series_books')
    .select('series_id, sort_order, books:book_id (id, title, created_at)')
    .in('series_id', seriesIds)
    .order('sort_order', { ascending: true })

  if (booksError) {
    console.error('Error fetching my series books:', booksError)
  }

  const booksBySeriesId = {}
  for (const row of booksRows || []) {
    if (!booksBySeriesId[row.series_id]) booksBySeriesId[row.series_id] = []
    booksBySeriesId[row.series_id].push({ ...row.books, sort_order: row.sort_order })
  }

  return seriesRows.map(s => ({
    ...s,
    books: booksBySeriesId[s.id] || []
  }))
}

/**
 * Fetch all of an author's published books, each marked with its current
 * series assignment (if any). One series per book, so seriesId is singular.
 */
export async function fetchMyBooks(authorId) {
  if (!supabase || !authorId) return []

  const { data: books, error: booksError } = await supabase
    .from('books')
    .select('id, title, lede, created_at, comments_count')
    .eq('author_id', authorId)
    .order('created_at', { ascending: false })

  if (booksError || !books || books.length === 0) return []

  const bookIds = books.map(b => b.id)

  const { data: seriesBooks, error: seriesBooksError } = await supabase
    .from('series_books')
    .select('book_id, series:series_id (id, title)')
    .in('book_id', bookIds)

  if (seriesBooksError) {
    console.error('Error fetching series assignment for my books:', seriesBooksError)
  }

  const seriesByBookId = {}
  for (const row of seriesBooks || []) {
    seriesByBookId[row.book_id] = row.series
  }

  return books.map(b => ({
    ...b,
    seriesId: seriesByBookId[b.id]?.id || null,
    seriesTitle: seriesByBookId[b.id]?.title || null
  }))
}

/**
 * Lightweight id/title list of an author's series, for the PublishStory
 * attach-only dropdown (and reusable anywhere a plain series picker is needed).
 */
export async function fetchAuthorSeriesOptions(authorId) {
  if (!supabase || !authorId) return []

  const { data, error } = await supabase
    .from('series')
    .select('id, title')
    .eq('author_id', authorId)
    .order('title', { ascending: true })

  if (error || !data) return []
  return data
}

/**
 * Create a new series and link its one required initial story in a single
 * flow. A series is never created empty.
 */
export async function createSeriesWithInitialStory({ authorId, title, description, initialBookId }) {
  if (!supabase) throw new Error('Supabase not configured')

  const { data: series, error: seriesError } = await supabase
    .from('series')
    .insert({ author_id: authorId, title: title.trim(), description: description?.trim() || null })
    .select('id')
    .single()

  if (seriesError) throw seriesError

  const { error: linkError } = await supabase
    .from('series_books')
    .insert({ series_id: series.id, book_id: initialBookId, sort_order: 0 })

  if (linkError) throw linkError

  return series
}

/**
 * Add a story to an existing series, appended after the current last story.
 */
export async function addBookToSeries({ seriesId, bookId }) {
  if (!supabase) throw new Error('Supabase not configured')

  const { data: existing, error: fetchError } = await supabase
    .from('series_books')
    .select('sort_order')
    .eq('series_id', seriesId)
    .order('sort_order', { ascending: false })
    .limit(1)

  if (fetchError) throw fetchError

  const nextSortOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0

  const { error } = await supabase
    .from('series_books')
    .insert({ series_id: seriesId, book_id: bookId, sort_order: nextSortOrder })

  if (error) throw error
}

/**
 * Unassign a story from a series. The story itself is untouched.
 */
export async function removeBookFromSeries({ seriesId, bookId }) {
  if (!supabase) throw new Error('Supabase not configured')

  const { error } = await supabase
    .from('series_books')
    .delete()
    .eq('series_id', seriesId)
    .eq('book_id', bookId)

  if (error) throw error
}

/**
 * Update a story's position within its series.
 */
export async function updateBookSortOrder({ seriesId, bookId, sortOrder }) {
  if (!supabase) throw new Error('Supabase not configured')

  const { error } = await supabase
    .from('series_books')
    .update({ sort_order: sortOrder })
    .eq('series_id', seriesId)
    .eq('book_id', bookId)

  if (error) throw error
}

/**
 * Permanently delete a series. series_books rows for it cascade-delete via
 * the existing FK; the stories themselves are untouched. Real delete, no
 * soft-delete/restore — see the 2026-07-19 deletion-policy correction.
 */
export async function deleteSeries(seriesId) {
  if (!supabase) throw new Error('Supabase not configured')

  const { error } = await supabase
    .from('series')
    .delete()
    .eq('id', seriesId)

  if (error) throw error
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit`
Expected: PASS — all tests in `series.test.js` green (existing 4 + new ones).

- [ ] **Step 5: Commit**

```bash
git add src/lib/series.js src/lib/series.test.js
git commit -m "feat(series): add writer-side mutation and fetch helpers"
```

---

### Task 2: `tests/mocks.js` — series and series_books route mocks

**Files:**
- Modify: `tests/mocks.js`

**Interfaces:**
- Consumes: `MOCK_USER_ID` (existing export in this file).
- Produces: `MOCK_SERIES`, `MOCK_SERIES_BOOKS` (new exports), a second entry added to the
  existing `MOCK_BOOKS` export, plus two new `page.route(...)` handlers registered inside the
  existing `setupSupabaseMocks(page, opts)` function.

- [ ] **Step 1: Add a second, unassigned book fixture**

`MOCK_BOOKS` currently has only one entry, and Step 2 below assigns that one book to
`MOCK_SERIES`. The "create a series" and "assign to series" flows both need at least one
*unassigned* book to select in their dropdowns, so add a second entry. In `tests/mocks.js`, change
the `MOCK_BOOKS` array (currently a single-object array ending around line 101) from:

```js
export const MOCK_BOOKS = [
  {
    id: 'book-1',
    title: 'The Shadow over Innsmouth',
    lede: 'A traveler discovers a degenerate breed of fish-people in a decaying seaport.',
    cover: 'blood',
    content: 'It was during the winter of 1927-28 that the Federal government initiated a secret investigation...',
    author_id: MOCK_USER_ID,
    chapters_info: 'Complete',
    comments_count: 3,
    badge: 'COMPLETE',
    created_at: '2026-05-26T10:00:00Z',
    profiles: { handle: 'testwriter' }
  }
];
```

to:

```js
export const MOCK_BOOKS = [
  {
    id: 'book-1',
    title: 'The Shadow over Innsmouth',
    lede: 'A traveler discovers a degenerate breed of fish-people in a decaying seaport.',
    cover: 'blood',
    content: 'It was during the winter of 1927-28 that the Federal government initiated a secret investigation...',
    author_id: MOCK_USER_ID,
    chapters_info: 'Complete',
    comments_count: 3,
    badge: 'COMPLETE',
    created_at: '2026-05-26T10:00:00Z',
    profiles: { handle: 'testwriter' }
  },
  {
    id: 'book-2',
    title: 'A Standalone Tale',
    lede: 'A story that has never belonged to any series.',
    cover: 'bone',
    content: 'It stood alone, as it always had.',
    author_id: MOCK_USER_ID,
    chapters_info: null,
    comments_count: 0,
    badge: null,
    created_at: '2026-06-01T09:00:00Z',
    profiles: { handle: 'testwriter' }
  }
];
```

(This is additive — existing tests that assert on `MOCK_BOOKS[0]` specifically are unaffected;
the `**/rest/v1/books*` GET-with-`id=eq.` route handler already returns `MOCK_BOOKS[0]`
unconditionally regardless of array length.)

- [ ] **Step 2: Add fixtures and route handlers**

Add these two exported constants right after `MOCK_BOOKS` in `tests/mocks.js`:

```js
export const MOCK_SERIES = [
  {
    id: 'series-1',
    author_id: MOCK_USER_ID,
    title: 'The Hollow Chronicles',
    description: 'A three-part descent into the house that remembers.',
    created_at: '2026-05-20T00:00:00Z',
    profiles: { handle: 'testwriter' }
  }
];

export const MOCK_SERIES_BOOKS = [
  {
    series_id: 'series-1',
    sort_order: 0,
    books: { id: 'book-1', title: 'The Shadow over Innsmouth', series_teaser: 'It was during the winter...', created_at: '2026-05-26T10:00:00Z', author_id: MOCK_USER_ID }
  }
];
```

Add these two route handlers inside `setupSupabaseMocks`, right after the existing
`**/rest/v1/books*` handler block (after its closing `});` — the one ending around the original
line 313):

```js
  await page.route('**/rest/v1/series*', async (route) => {
    const method = route.request().method();
    const url = route.request().url();
    if (method === 'GET') {
      if (url.includes('id=eq.')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_SERIES[0])
        });
      } else {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_SERIES)
        });
      }
    } else if (method === 'POST') {
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'series-new' })
      });
    } else if (method === 'DELETE') {
      route.fulfill({ status: 204, body: '' });
    }
  });

  await page.route('**/rest/v1/series_books*', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_SERIES_BOOKS)
      });
    } else if (method === 'POST') {
      route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({}) });
    } else if (method === 'PATCH' || method === 'PUT') {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok' }) });
    } else if (method === 'DELETE') {
      route.fulfill({ status: 204, body: '' });
    }
  });
```

- [ ] **Step 3: Verify existing suite still passes with the new mocks registered**

Run: `cmd /c npx playwright test`
Expected: PASS — 47/47 (these new routes and the added `MOCK_BOOKS` entry are additive; nothing
existing depends on `MOCK_BOOKS` having exactly one entry).

- [ ] **Step 4: Commit**

```bash
git add tests/mocks.js
git commit -m "test: add series and series_books mock route handlers"
```

---

### Task 3: `/my-stories` page

**Files:**
- Create: `src/pages/my-stories.astro`
- Create: `src/pages-react/MyStories.jsx`

**Interfaces:**
- Consumes: `fetchMySeriesWithBooks`, `fetchMyBooks`, `createSeriesWithInitialStory`,
  `addBookToSeries`, `removeBookFromSeries`, `updateBookSortOrder`, `deleteSeries` (from Task 1);
  `useAuth` (`src/components/AuthContext`); `withProviders`, `RequireAuth` (existing).
- Produces: the `/my-stories` route, entry points wired to it in Task 4.

- [ ] **Step 1: Create the route file**

`src/pages/my-stories.astro`:

```astro
---
import MainLayout from '../layouts/MainLayout.astro';
import MyStories from '../pages-react/MyStories.jsx';
---

<MainLayout title="My Stories | Horror Writer" description="Manage your published stories and story series.">
  <MyStories client:load />
</MainLayout>
```

- [ ] **Step 2: Create the island**

`src/pages-react/MyStories.jsx`:

```jsx
import { useState } from 'react'
import { useAuth } from '../components/AuthContext'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { withProviders } from '../components/Providers'
import RequireAuth from '../components/RequireAuth'
import {
  fetchMySeriesWithBooks,
  fetchMyBooks,
  createSeriesWithInitialStory,
  addBookToSeries,
  removeBookFromSeries,
  updateBookSortOrder,
  deleteSeries,
} from '../lib/series'

function postedAgo(dateString) {
  if (!dateString) return null
  const d = new Date(dateString)
  const now = new Date()
  const diffDays = Math.floor((now - d) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 30) return `${diffDays}d ago`
  const diffMonths = Math.floor(diffDays / 30)
  if (diffMonths < 12) return `${diffMonths}mo ago`
  return `${Math.floor(diffMonths / 12)}y ago`
}

function MyStories() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const [newSeriesOpen, setNewSeriesOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newInitialBookId, setNewInitialBookId] = useState('')

  const seriesQuery = useQuery({
    queryKey: ['my-series', user?.id],
    queryFn: () => fetchMySeriesWithBooks(user.id),
    enabled: !!user,
  })

  const booksQuery = useQuery({
    queryKey: ['my-books', user?.id],
    queryFn: () => fetchMyBooks(user.id),
    enabled: !!user,
  })

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['my-series', user?.id] })
    queryClient.invalidateQueries({ queryKey: ['my-books', user?.id] })
  }

  const createMutation = useMutation({
    mutationFn: createSeriesWithInitialStory,
    onSuccess: () => {
      toast.success('Series created')
      setNewSeriesOpen(false)
      setNewTitle('')
      setNewDescription('')
      setNewInitialBookId('')
      invalidateAll()
    },
    onError: (err) => toast.error(err.message || 'Failed to create series'),
  })

  const addMutation = useMutation({
    mutationFn: addBookToSeries,
    onSuccess: () => { toast.success('Added to series'); invalidateAll() },
    onError: (err) => toast.error(err.message || 'Failed to add to series'),
  })

  const removeMutation = useMutation({
    mutationFn: removeBookFromSeries,
    onSuccess: () => { toast.success('Removed from series'); invalidateAll() },
    onError: (err) => toast.error(err.message || 'Failed to remove from series'),
  })

  const reorderMutation = useMutation({
    mutationFn: updateBookSortOrder,
    onSuccess: () => invalidateAll(),
    onError: (err) => toast.error(err.message || 'Failed to update order'),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteSeries,
    onSuccess: () => { toast.success('Series deleted'); invalidateAll() },
    onError: (err) => toast.error(err.message || 'Failed to delete series'),
  })

  const loading = seriesQuery.isLoading || booksQuery.isLoading
  const series = seriesQuery.data || []
  const books = booksQuery.data || []
  const unassignedBooks = books.filter(b => !b.seriesId)

  const handleCreateSeries = (e) => {
    e.preventDefault()
    if (!newTitle.trim() || !newInitialBookId) return
    createMutation.mutate({
      authorId: user.id,
      title: newTitle,
      description: newDescription,
      initialBookId: newInitialBookId,
    })
  }

  const handleDeleteSeries = (s) => {
    if (!window.confirm(`Delete "${s.title}"? This can't be undone. Your stories won't be deleted — they'll just no longer be part of a series.`)) return
    deleteMutation.mutate(s.id)
  }

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] mt-8">
      <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-text-secondary)] animate-pulse">Loading your stories…</p>
    </div>
  )

  return (
    <div className="mt-8 max-w-3xl mx-auto">
      <div className="border-b border-[#2d2d2a] pb-6 mb-12">
        <span className="block font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-text-secondary)] mb-2">The Library</span>
        <h2 className="text-3xl font-serif font-black">My <em className="italic text-[var(--color-accent-crimson)] font-serif">stories</em></h2>
        <p className="text-xs text-[var(--color-text-secondary)] font-serif mt-1">Manage your published stories and the series they belong to.</p>
      </div>

      {/* ── Your Series ── */}
      <section className="mb-16">
        <h3 className="font-serif font-bold text-xl text-[var(--color-text-primary)] mb-6">Your Series</h3>

        {!newSeriesOpen ? (
          <button
            type="button"
            className="border border-[#2d2d2a] hover:border-white font-mono text-xs uppercase px-4 py-2 transition-colors mb-8 cursor-pointer"
            onClick={() => setNewSeriesOpen(true)}
          >
            + New Series
          </button>
        ) : (
          <form onSubmit={handleCreateSeries} className="vintage-card flex flex-col gap-4 mb-8">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-mono text-[var(--color-text-secondary)] uppercase">Title</label>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                required
                placeholder="The Hollow Chronicles"
                className="bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] border border-[#2d2d2a] px-3 py-2 text-sm focus:border-[var(--color-accent-crimson)] focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-mono text-[var(--color-text-secondary)] uppercase">Description (optional)</label>
              <input
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="A three-part descent into the house that remembers."
                className="bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] border border-[#2d2d2a] px-3 py-2 text-sm focus:border-[var(--color-accent-crimson)] focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-mono text-[var(--color-text-secondary)] uppercase">Starting story</label>
              <select
                value={newInitialBookId}
                onChange={(e) => setNewInitialBookId(e.target.value)}
                required
                className="bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] border border-[#2d2d2a] px-3 py-2 text-sm focus:border-[var(--color-accent-crimson)] focus:outline-none"
              >
                <option value="">Choose a story…</option>
                {unassignedBooks.map(b => (
                  <option key={b.id} value={b.id}>{b.title}</option>
                ))}
              </select>
              {unassignedBooks.length === 0 && (
                <span className="text-xs font-serif italic text-[var(--color-text-secondary)]">
                  All of your stories are already in a series.
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={createMutation.isPending || unassignedBooks.length === 0}
                className="bg-[var(--color-accent-crimson)] text-white font-mono text-xs uppercase px-5 py-2.5 hover:bg-red-700 transition-colors cursor-pointer"
              >
                {createMutation.isPending ? 'Creating…' : 'Create Series'}
              </button>
              <button
                type="button"
                className="border border-[#2d2d2a] hover:border-white font-mono text-xs uppercase px-4 py-2.5 transition-colors cursor-pointer"
                onClick={() => setNewSeriesOpen(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {series.length === 0 ? (
          <p className="font-serif italic text-xs text-[var(--color-text-secondary)]">
            No series yet — create one above to start grouping your stories.
          </p>
        ) : (
          <div className="flex flex-col gap-8">
            {series.map(s => (
              <div key={s.id} className="vintage-card flex flex-col gap-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h4 className="font-serif font-bold text-lg text-[var(--color-text-primary)]">{s.title}</h4>
                    {s.description && <p className="font-serif italic text-xs text-[var(--color-text-secondary)] mt-1">{s.description}</p>}
                  </div>
                  <button
                    type="button"
                    className="shrink-0 border border-[#2d2d2a] hover:border-[var(--color-accent-crimson)] hover:text-[var(--color-accent-crimson)] font-mono text-xs uppercase px-3 py-1.5 transition-colors cursor-pointer"
                    onClick={() => handleDeleteSeries(s)}
                    disabled={deleteMutation.isPending}
                  >
                    Delete Series
                  </button>
                </div>

                {s.books.length === 0 ? (
                  <p className="font-serif italic text-xs text-[var(--color-text-secondary)]">No stories in this series yet.</p>
                ) : (
                  <ul className="flex flex-col gap-2 border-t border-[#2d2d2a] pt-4">
                    {s.books.map(b => (
                      <li key={b.id} className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-[var(--color-text-primary)] font-serif">{b.title}</span>
                        <div className="flex items-center gap-3 shrink-0">
                          <label className="flex items-center gap-2 font-mono text-xs text-[var(--color-text-secondary)] uppercase">
                            Position
                            <input
                              type="number"
                              defaultValue={b.sort_order}
                              min={0}
                              className="w-14 bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] border border-[#2d2d2a] px-2 py-1 text-xs focus:border-[var(--color-accent-crimson)] focus:outline-none"
                              onBlur={(e) => {
                                const value = Number(e.target.value)
                                if (!Number.isNaN(value) && value !== b.sort_order) {
                                  reorderMutation.mutate({ seriesId: s.id, bookId: b.id, sortOrder: value })
                                }
                              }}
                            />
                          </label>
                          <button
                            type="button"
                            className="font-mono text-xs uppercase text-[var(--color-text-secondary)] hover:text-[var(--color-accent-crimson)] cursor-pointer"
                            onClick={() => removeMutation.mutate({ seriesId: s.id, bookId: b.id })}
                            disabled={removeMutation.isPending}
                          >
                            Remove
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Your Stories ── */}
      <section>
        <h3 className="font-serif font-bold text-xl text-[var(--color-text-primary)] mb-6">Your Stories</h3>

        {books.length === 0 ? (
          <p className="font-serif italic text-xs text-[var(--color-text-secondary)]">
            You haven't published any stories yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {books.map(b => (
              <li key={b.id} className="vintage-card flex items-center justify-between gap-4">
                <div>
                  <p className="font-serif font-bold text-[var(--color-text-primary)]">{b.title}</p>
                  <p className="font-mono text-xs text-[var(--color-text-secondary)] mt-1">
                    {postedAgo(b.created_at)} · {b.comments_count || 0} {b.comments_count === 1 ? 'critique' : 'critiques'}
                  </p>
                </div>

                {b.seriesId ? (
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono text-xs text-[var(--color-text-secondary)] uppercase">In: {b.seriesTitle}</span>
                    <button
                      type="button"
                      className="font-mono text-xs uppercase text-[var(--color-text-secondary)] hover:text-[var(--color-accent-crimson)] cursor-pointer"
                      onClick={() => removeMutation.mutate({ seriesId: b.seriesId, bookId: b.id })}
                      disabled={removeMutation.isPending}
                    >
                      Remove from series
                    </button>
                  </div>
                ) : series.length > 0 ? (
                  <AddToSeriesControl
                    book={b}
                    seriesOptions={series}
                    onAdd={(seriesId) => addMutation.mutate({ seriesId, bookId: b.id })}
                    isPending={addMutation.isPending}
                  />
                ) : (
                  <span className="shrink-0 font-mono text-xs text-[var(--color-text-secondary)] uppercase">Not in a series</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function AddToSeriesControl({ seriesOptions, onAdd, isPending }) {
  const [selected, setSelected] = useState('')
  return (
    <div className="flex items-center gap-2 shrink-0">
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] border border-[#2d2d2a] px-2 py-1.5 text-xs font-mono focus:border-[var(--color-accent-crimson)] focus:outline-none"
      >
        <option value="">Add to series…</option>
        {seriesOptions.map(s => (
          <option key={s.id} value={s.id}>{s.title}</option>
        ))}
      </select>
      <button
        type="button"
        className="font-mono text-xs uppercase border border-[#2d2d2a] hover:border-white px-2 py-1.5 transition-colors cursor-pointer disabled:opacity-50"
        disabled={!selected || isPending}
        onClick={() => { onAdd(selected); setSelected('') }}
      >
        Add
      </button>
    </div>
  )
}

function MyStoriesWithAuth(props) {
  return (
    <RequireAuth>
      <MyStories {...props} />
    </RequireAuth>
  )
}

export default withProviders(MyStoriesWithAuth)
```

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, sign in, navigate to `http://localhost:5173/my-stories`.
Expected: page loads with "Your Series" (empty state) and "Your Stories" (your published books,
or empty state if none). Create a series, confirm it appears with its initial story. Reorder,
remove, and delete a series, confirming each action.

- [ ] **Step 4: Commit**

```bash
git add src/pages/my-stories.astro src/pages-react/MyStories.jsx
git commit -m "feat(series): add /my-stories writer dashboard"
```

---

### Task 4: Entry-point links on Profile and Library

**Files:**
- Modify: `src/pages-react/Profile.jsx:186-188`
- Modify: `src/pages-react/Library.jsx:71-77`

**Interfaces:**
- Consumes: nothing new — plain `<a href="/my-stories">` links.
- Produces: nothing new — just navigation entry points into Task 3's route.

- [ ] **Step 1: Add the link to Profile.jsx**

In `src/pages-react/Profile.jsx`, the header currently reads (around line 186):

```jsx
        <a href="/my-reports" className="font-mono text-xs border border-[#2d2d2a] px-3 py-2 hover:border-white hover:text-[var(--color-accent-crimson)] transition-colors">
          View My Reports
        </a>
```

Change it to:

```jsx
        <div className="flex items-center gap-3">
          <a href="/my-stories" className="font-mono text-xs border border-[#2d2d2a] px-3 py-2 hover:border-white hover:text-[var(--color-accent-crimson)] transition-colors">
            My Stories
          </a>
          <a href="/my-reports" className="font-mono text-xs border border-[#2d2d2a] px-3 py-2 hover:border-white hover:text-[var(--color-accent-crimson)] transition-colors">
            View My Reports
          </a>
        </div>
```

- [ ] **Step 2: Add the link to Library.jsx**

In `src/pages-react/Library.jsx`, the signed-in publish CTA currently reads (around line 71-77):

```jsx
        {session ? (
          <a href="/library/publish" className="bg-[var(--color-accent-crimson)] text-white font-mono text-xs uppercase px-5 py-3 hover:bg-red-700 transition-colors inline-block text-center">
            Publish a Story
          </a>
        ) : (
          <span className="font-mono text-xs border border-[#2d2d2a] text-[var(--color-text-secondary)] px-3 py-1.5 uppercase">Sign in to publish</span>
        )}
```

Change it to:

```jsx
        {session ? (
          <div className="flex items-center gap-3">
            <a href="/my-stories" className="border border-[#2d2d2a] text-[var(--color-text-primary)] font-mono text-xs uppercase px-5 py-3 hover:border-white transition-colors inline-block text-center">
              My Stories
            </a>
            <a href="/library/publish" className="bg-[var(--color-accent-crimson)] text-white font-mono text-xs uppercase px-5 py-3 hover:bg-red-700 transition-colors inline-block text-center">
              Publish a Story
            </a>
          </div>
        ) : (
          <span className="font-mono text-xs border border-[#2d2d2a] text-[var(--color-text-secondary)] px-3 py-1.5 uppercase">Sign in to publish</span>
        )}
```

- [ ] **Step 3: Run the existing E2E suite to confirm no regression**

Run: `cmd /c npx playwright test`
Expected: PASS — 47/47. (`profile.spec.js` and `library.spec.js` assert on other elements; these
are additive links and shouldn't collide with existing selectors — if a selector match becomes
ambiguous, prefer `getByRole('link', { name: 'My Stories' })` in any new assertions added later.)

- [ ] **Step 4: Commit**

```bash
git add src/pages-react/Profile.jsx src/pages-react/Library.jsx
git commit -m "feat(series): add My Stories entry points on Profile and Library"
```

---

### Task 5: `PublishStory.jsx` — attach-only series dropdown

**Files:**
- Modify: `src/pages-react/PublishStory.jsx`

**Interfaces:**
- Consumes: `fetchAuthorSeriesOptions(authorId)`, `addBookToSeries({ seriesId, bookId })` (Task 1).
- Produces: nothing new for later tasks — this is a leaf change.

- [ ] **Step 1: Add the import and series-options query**

In `src/pages-react/PublishStory.jsx`, add to the imports at the top:

```jsx
import { useQuery } from '@tanstack/react-query'
import { fetchAuthorSeriesOptions, addBookToSeries } from '../lib/series'
```

(`useMutation` and `useQueryClient` are already imported from `@tanstack/react-query` on the
existing import line — add `useQuery` to that same import instead of a separate line.)

Inside the `PublishStory` function, after the existing `useState` declarations (after
`const [error, setError] = useState(null)`), add:

```jsx
  const [seriesId, setSeriesId] = useState('')

  const seriesOptionsQuery = useQuery({
    queryKey: ['my-series-options', session?.user?.id],
    queryFn: () => fetchAuthorSeriesOptions(session.user.id),
    enabled: !!session?.user?.id,
  })
  const seriesOptions = seriesOptionsQuery.data || []
```

- [ ] **Step 2: Attach to the series on successful publish**

Replace the existing mutation's `onSuccess` (currently):

```jsx
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['books'] })
      window.location.replace(data?.id ? `/library/read/${data.id}` : '/library')
    },
```

with:

```jsx
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ['books'] })
      if (seriesId && data?.id) {
        try {
          await addBookToSeries({ seriesId, bookId: data.id })
        } catch (err) {
          console.error('Failed to attach story to series:', err)
        }
      }
      window.location.replace(data?.id ? `/library/read/${data.id}` : '/library')
    },
```

(The attach is best-effort: publishing already succeeded, which is the primary action, so a
failure here is logged rather than blocking the redirect.)

- [ ] **Step 3: Add the dropdown to the form**

In the JSX, right after the "Cover Style" `<div>` block and before the "Story Content" block, add:

```jsx
        <div className="flex flex-col gap-2">
          <label className="text-xs font-mono text-[var(--color-text-secondary)] uppercase">Part of a series?</label>
          <select
            value={seriesId}
            onChange={(e) => setSeriesId(e.target.value)}
            className="bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] border border-[#2d2d2a] px-3 py-2 text-sm focus:border-[var(--color-accent-crimson)] focus:outline-none"
          >
            <option value="">None</option>
            {seriesOptions.map(s => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </select>
          <span className="font-mono text-xs text-[var(--color-text-secondary)] leading-relaxed">
            Manage series from <a href="/my-stories" className="underline hover:text-[var(--color-accent-crimson)]">My Stories</a>.
          </span>
        </div>
```

- [ ] **Step 4: Run the existing E2E suite to confirm no regression**

Run: `cmd /c npx playwright test`
Expected: PASS — 47/47. `library.spec.js`'s "Publish a story (authenticated)" test asserts the
POST body to `/rest/v1/books` equals an exact object with 5 keys (`title, lede, cover, content,
author_id`) — this change doesn't touch that insert payload, only adds a second, separate
`series_books` call after success, so that assertion still holds unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/pages-react/PublishStory.jsx
git commit -m "feat(series): add attach-only series dropdown to PublishStory"
```

---

### Task 6: E2E coverage for My Stories and the publish-time attach

**Files:**
- Create: `tests/mySeries.spec.js`
- Modify: `tests/library.spec.js`

**Interfaces:**
- Consumes: `setupMockAuth`, `setupSupabaseMocks`, `MOCK_SERIES`, `MOCK_SERIES_BOOKS`,
  `MOCK_BOOKS` (Task 2).

- [ ] **Step 1: Write `tests/mySeries.spec.js`**

```js
import { test, expect } from '@playwright/test';
import { setupMockAuth, setupSupabaseMocks, MOCK_SERIES, MOCK_SERIES_BOOKS, MOCK_BOOKS } from './mocks';

test.describe('My Stories', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockAuth(page);
    await setupSupabaseMocks(page);
  });

  test('shows existing series with their books', async ({ page }) => {
    await page.goto('/my-stories');

    await expect(page.getByText('Your Series')).toBeVisible();
    await expect(page.getByText(MOCK_SERIES[0].title)).toBeVisible();
    await expect(page.getByText(MOCK_SERIES_BOOKS[0].books.title)).toBeVisible();
  });

  test('creates a new series with an initial story', async ({ page }) => {
    await page.goto('/my-stories');

    await page.getByRole('button', { name: '+ New Series' }).click();
    await page.getByPlaceholder('The Hollow Chronicles').fill('A New Series');
    // book-1 is already assigned to MOCK_SERIES in the fixtures; book-2 ("A Standalone
    // Tale") is the one unassigned book available to seed a new series with.
    await page.locator('select').selectOption({ label: MOCK_BOOKS[1].title });

    const requestPromise = page.waitForRequest(req =>
      req.url().includes('/rest/v1/series') && req.method() === 'POST'
    );

    await page.getByRole('button', { name: 'Create Series' }).click();
    await requestPromise;

    await expect(page.getByText('Series created')).toBeVisible();
  });

  test('assigns an unassigned story to an existing series', async ({ page }) => {
    await page.goto('/my-stories');

    // book-2 ("A Standalone Tale") is unassigned in the fixtures and renders its own
    // "Add to series…" dropdown + Add button under "Your Stories".
    const storyRow = page.locator('li', { hasText: MOCK_BOOKS[1].title });
    await storyRow.locator('select').selectOption({ label: MOCK_SERIES[0].title });

    const requestPromise = page.waitForRequest(req =>
      req.url().includes('/rest/v1/series_books') && req.method() === 'POST'
    );

    await storyRow.getByRole('button', { name: 'Add' }).click();
    await requestPromise;

    await expect(page.getByText('Added to series')).toBeVisible();
  });

  test('reorders a story within a series', async ({ page }) => {
    await page.goto('/my-stories');

    const requestPromise = page.waitForRequest(req =>
      req.url().includes('/rest/v1/series_books') && ['PATCH', 'PUT'].includes(req.method())
    );

    const positionInput = page.getByLabel('Position');
    await positionInput.fill('3');
    await positionInput.blur();

    await requestPromise;
  });

  test('deletes a series after confirmation', async ({ page }) => {
    await page.goto('/my-stories');

    page.on('dialog', dialog => dialog.accept());

    const requestPromise = page.waitForRequest(req =>
      req.url().includes('/rest/v1/series') && req.method() === 'DELETE'
    );

    await page.getByRole('button', { name: 'Delete Series' }).click();
    await requestPromise;

    await expect(page.getByText('Series deleted')).toBeVisible();
  });

  test('lists the writer\'s own stories with series assignment', async ({ page }) => {
    await page.goto('/my-stories');

    await expect(page.getByText('Your Stories')).toBeVisible();
    await expect(page.getByText(MOCK_BOOKS[0].title).first()).toBeVisible();
  });
});
```

- [ ] **Step 2: Run the new spec to verify it passes**

Run: `cmd /c npx playwright test tests/mySeries.spec.js`
Expected: PASS — 6/6.

- [ ] **Step 3: Add a publish-flow case to `tests/library.spec.js`**

Add this test inside the existing `test.describe('Library Flows', ...)` block in
`tests/library.spec.js`, after the existing "Publish a story (authenticated)" test:

```js
  test('Publish a story with a series selected attaches it', async ({ page }) => {
    await setupMockAuth(page);
    await page.goto('/library/publish');

    await expect(page.getByText('Part of a series?')).toBeVisible();
    await page.locator('select').selectOption({ label: MOCK_SERIES[0].title });

    await page.locator('input[placeholder="The Tell-Tale Heart"]').fill('A Sequel');
    await page.locator('input[placeholder="A short hook to draw readers in…"]').fill('Continuing the descent.');
    await page.locator('textarea[placeholder^="True!—nervous—"]').fill('The house remembered.');

    const seriesRequestPromise = page.waitForRequest(req =>
      req.url().includes('/rest/v1/series_books') && req.method() === 'POST'
    );

    await page.getByRole('button', { name: /Publish Story/i }).click();
    await seriesRequestPromise;

    await page.waitForURL('**/library/read/**');
  });
```

Add `MOCK_SERIES` to the existing import line at the top of `tests/library.spec.js`:

```js
import { setupMockAuth, setupSupabaseMocks, MOCK_BOOKS, MOCK_BOOK_COMMENTS, MOCK_SERIES } from './mocks';
```

- [ ] **Step 4: Run the full suite**

Run: `cmd /c npx playwright test`
Expected: PASS — 54/54 (47 existing + 6 new in `mySeries.spec.js` + 1 new in `library.spec.js`).

- [ ] **Step 5: Run unit tests one more time for the full picture**

Run: `npm run test:unit`
Expected: PASS — 27/27 (13 existing — `moderation.test.js` 9 + `series.test.js` 4 — plus 14 new
tests added to `series.test.js` in Task 1).

- [ ] **Step 6: Commit**

```bash
git add tests/mySeries.spec.js tests/library.spec.js
git commit -m "test(series): add E2E coverage for My Stories and publish-time attach"
```

---

## Not covered by this plan (explicitly out of scope, per the spec)

- Tasks 7–8 from the original 2026-07-06 Story Series plan (reader-facing Series Hub/in-story-nav
  E2E) — these reuse the `MOCK_SERIES`/`MOCK_SERIES_BOOKS` fixtures added in Task 2 above, but are
  a separate task against `SeriesHub.jsx`/`SeriesSidebar.jsx`, not this plan.
- Task 9 from that same plan (responsive refinement, inline-style → token migration for
  `SeriesHub`/`SeriesSidebar`).
- Story editing (no edit UI exists anywhere in the app).
- Multi-series membership, drag-and-drop reordering (both explicitly excluded in the spec).
