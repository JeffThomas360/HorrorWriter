import { describe, it, expect, vi, beforeEach } from 'vitest'

function makeQuery(result) {
  const q = {
    select: vi.fn(() => q), eq: vi.fn(() => q), order: vi.fn(() => q), limit: vi.fn(() => q),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  }
  return q
}
const mockSupabase = { from: vi.fn() }
vi.mock('../supabaseClient', () => ({ get supabase() { return mockSupabase } }))
const { fetchAuthorStories } = await import('./authorStories')

beforeEach(() => mockSupabase.from.mockReset())

describe('fetchAuthorStories', () => {
  it("returns the author's live, non-removed stories", async () => {
    const q = makeQuery({ data: [{ id: 'b1', title: 'T' }], error: null })
    mockSupabase.from.mockReturnValueOnce(q)
    expect(await fetchAuthorStories('u1')).toEqual([{ id: 'b1', title: 'T' }])
    expect(mockSupabase.from).toHaveBeenCalledWith('books')
    expect(q.eq).toHaveBeenCalledWith('author_id', 'u1')
    expect(q.eq).toHaveBeenCalledWith('mod_status', 'live')
    expect(q.eq).toHaveBeenCalledWith('removed_by_author', false)
  })

  it('returns [] on error', async () => {
    mockSupabase.from.mockReturnValueOnce(makeQuery({ data: null, error: { message: 'boom' } }))
    expect(await fetchAuthorStories('u1')).toEqual([])
  })

  it('returns [] without an author id, without querying', async () => {
    expect(await fetchAuthorStories(null)).toEqual([])
    expect(mockSupabase.from).not.toHaveBeenCalled()
  })
})
