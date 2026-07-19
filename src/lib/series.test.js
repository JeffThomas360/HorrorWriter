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

const { fetchSeriesWithBooks, fetchStorySeriesContext } = await import('./series')

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
