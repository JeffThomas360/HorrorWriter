import { describe, it, expect, vi, beforeEach } from 'vitest'

// In-memory fixture data the mocked Supabase client serves
const SERIES = {
  id: 'series-1',
  author_id: 'author-1',
  title: 'The Hollow Chronicles',
  description: 'A three-part descent.',
  created_at: '2026-01-01T00:00:00Z',
  profiles: { handle: 'jeff-the-writer' }
}

const SERIES_BOOKS = [
  { sort_order: 2, books: { id: 'book-2', title: 'Part Two', series_teaser: 't2', created_at: '2026-01-02', author_id: 'author-1' } },
  { sort_order: 1, books: { id: 'book-1', title: 'Part One', series_teaser: 't1', created_at: '2026-01-01', author_id: 'author-1' } }
]

function makeQuery(result) {
  const q = {
    select: vi.fn(() => q),
    eq: vi.fn(() => q),
    in: vi.fn(() => q),
    order: vi.fn(() => Promise.resolve(result)),
    single: vi.fn(() => Promise.resolve(result)),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  }
  return q
}

const mockSupabase = { from: vi.fn() }

vi.mock('../supabaseClient', () => ({
  get supabase() { return mockSupabase }
}))

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
  fetchSeriesWithBooks,
  fetchStorySeriesContext,
  fetchMySeriesWithBooks,
  fetchMyBooks,
  fetchAuthorSeriesOptions,
  createSeriesWithInitialStory,
  addBookToSeries,
  removeBookFromSeries,
  updateBookSortOrder,
  deleteSeries
} = await import('./series')

beforeEach(() => {
  mockSupabase.from.mockReset()
})

describe('fetchSeriesWithBooks', () => {
  it('fetches series with books ordered by sort_order', async () => {
    const sorted = [...SERIES_BOOKS].sort((a, b) => a.sort_order - b.sort_order)
    mockSupabase.from
      .mockReturnValueOnce(makeQuery({ data: SERIES, error: null }))
      .mockReturnValueOnce(makeQuery({ data: sorted, error: null }))

    const result = await fetchSeriesWithBooks('series-1')
    expect(result.series).toMatchObject({ id: 'series-1', title: 'The Hollow Chronicles' })
    expect(result.books.map(b => b.id)).toEqual(['book-1', 'book-2'])
    expect(result.books[0].sort_order).toBe(1)
  })

  it('returns null if series not found', async () => {
    mockSupabase.from.mockReturnValueOnce(makeQuery({ data: null, error: { code: 'PGRST116' } }))
    expect(await fetchSeriesWithBooks('nonexistent')).toBeNull()
  })
})

describe('fetchStorySeriesContext', () => {
  it('returns series, allBooks, and currentIndex for a book in a series', async () => {
    const sorted = [...SERIES_BOOKS].sort((a, b) => a.sort_order - b.sort_order)
    mockSupabase.from
      .mockReturnValueOnce(makeQuery({ data: { series_id: 'series-1' }, error: null }))
      .mockReturnValueOnce(makeQuery({ data: SERIES, error: null }))
      .mockReturnValueOnce(makeQuery({ data: sorted, error: null }))

    const result = await fetchStorySeriesContext('book-2')
    expect(result.series.id).toBe('series-1')
    expect(result.allBooks).toHaveLength(2)
    expect(result.currentIndex).toBe(1)
  })

  it('returns null if the story is not part of any series', async () => {
    mockSupabase.from.mockReturnValueOnce(makeQuery({ data: null, error: { code: 'PGRST116' } }))
    expect(await fetchStorySeriesContext('lone-book')).toBeNull()
  })
})

describe('fetchMySeriesWithBooks', () => {
  it('returns each series with its books ordered by sort_order', async () => {
    mockSupabase.from
      .mockReturnValueOnce(makeQuery({
        data: [{ id: 'series-1', title: 'The Hollow Chronicles', description: 'desc', created_at: '2026-01-01' }],
        error: null
      }))
      .mockReturnValueOnce(makeQuery({
        data: [
          { series_id: 'series-1', sort_order: 0, books: { id: 'book-0', title: 'Prologue', created_at: '2026-01-01' } },
          { series_id: 'series-1', sort_order: 1, books: { id: 'book-1', title: 'Part One', created_at: '2026-01-01' } }
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

  it('deletes the series if the series_books insert fails', async () => {
    const linkError = { message: 'series_books insert failed' }
    mockSupabase.from
      .mockReturnValueOnce(makeMutationQuery({ data: { id: 'series-new' }, error: null }))
      .mockReturnValueOnce(makeMutationQuery({ data: null, error: linkError }))
      .mockReturnValueOnce(makeMutationQuery({ data: null, error: null }))

    await expect(createSeriesWithInitialStory({
      authorId: 'author-1', title: 'New Series', description: '', initialBookId: 'book-1'
    })).rejects.toMatchObject({ message: 'series_books insert failed' })

    // Verify that from was called 3 times: insert series, insert series_books, delete series
    expect(mockSupabase.from).toHaveBeenCalledTimes(3)
    expect(mockSupabase.from).toHaveBeenNthCalledWith(1, 'series')
    expect(mockSupabase.from).toHaveBeenNthCalledWith(2, 'series_books')
    expect(mockSupabase.from).toHaveBeenNthCalledWith(3, 'series')
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
