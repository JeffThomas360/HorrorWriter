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

const mockSupabase = { from: vi.fn(), rpc: vi.fn() }

vi.mock('../supabaseClient', () => ({
  get supabase() { return mockSupabase }
}))

const { fetchLiveStoryUrls, fetchLiveThreadUrls, fetchPublicProfileHandles, hasPublicWork } = await import('./sitemapQueries')

beforeEach(() => {
  mockSupabase.from.mockReset()
  mockSupabase.rpc.mockReset()
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

// profiles come from the public_profile_handles() RPC (the shadowban flag is
// private since 20261020020000); the work tables are still read directly.
function mockTables({ profiles, ...results }) {
  const queries = {}
  for (const [table, result] of Object.entries(results)) queries[table] = makeQuery(result)
  mockSupabase.from.mockImplementation((table) => queries[table])
  mockSupabase.rpc.mockImplementation((fn) => fn === 'public_profile_handles' ? Promise.resolve(profiles) : Promise.resolve({ data: null, error: { message: `unknown rpc ${fn}` } }))
  return queries
}

describe('fetchPublicProfileHandles', () => {
  const profiles = {
    data: [
      { id: 'u1', handle: 'has-story', updated_at: '2026-01-03T00:00:00Z' },
      { id: 'u2', handle: 'has-reply', updated_at: '2026-01-04T00:00:00Z' },
      { id: 'u3', handle: 'empty', updated_at: '2026-01-05T00:00:00Z' },
    ],
    error: null
  }

  it('returns only profiles with a live story, thread or reply', async () => {
    mockTables({
      profiles,
      books: { data: [{ author_id: 'u1' }], error: null },
      threads: { data: [], error: null },
      posts: { data: [{ author_id: 'u2' }], error: null },
    })
    expect(await fetchPublicProfileHandles()).toEqual([
      { handle: 'has-story', updated_at: '2026-01-03T00:00:00Z' },
      { handle: 'has-reply', updated_at: '2026-01-04T00:00:00Z' },
    ])
  })

  it('does not filter posts on removed_by_author (the column does not exist there)', async () => {
    const q = mockTables({
      profiles,
      books: { data: [], error: null },
      threads: { data: [], error: null },
      posts: { data: [], error: null },
    })
    await fetchPublicProfileHandles()
    expect(q.posts.eq).not.toHaveBeenCalledWith('removed_by_author', false)
    expect(q.books.eq).toHaveBeenCalledWith('removed_by_author', false)
    expect(q.threads.eq).toHaveBeenCalledWith('removed_by_author', false)
  })

  it('returns an empty array when any lookup fails', async () => {
    mockTables({
      profiles,
      books: { data: null, error: { message: 'boom' } },
      threads: { data: [], error: null },
      posts: { data: [], error: null },
    })
    expect(await fetchPublicProfileHandles()).toEqual([])
  })
})

describe('hasPublicWork', () => {
  it('is true when any table has live work', async () => {
    mockTables({
      books: { count: 0, error: null },
      threads: { count: 0, error: null },
      posts: { count: 2, error: null },
    })
    expect(await hasPublicWork('u1')).toBe(true)
  })

  it('is false when every table answers zero', async () => {
    mockTables({
      books: { count: 0, error: null },
      threads: { count: 0, error: null },
      posts: { count: 0, error: null },
    })
    expect(await hasPublicWork('u1')).toBe(false)
  })

  it('is null (unknown) when a lookup fails, so a real writer is never noindexed by an error', async () => {
    mockTables({
      books: { count: null, error: { message: 'boom' } },
      threads: { count: 0, error: null },
      posts: { count: 0, error: null },
    })
    expect(await hasPublicWork('u1')).toBeNull()
  })

  it('is null without an author id', async () => {
    expect(await hasPublicWork(undefined)).toBeNull()
    expect(mockSupabase.from).not.toHaveBeenCalled()
  })
})
