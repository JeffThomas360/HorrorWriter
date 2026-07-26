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
