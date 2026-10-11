import { describe, it, expect, vi, beforeEach } from 'vitest'

// Records every filter applied per table; each query resolves to that table's result.
const calls = []
let results = {}
const from = vi.fn((table) => {
  const entry = { table, filters: [] }
  calls.push(entry)
  const q = {
    select: () => q,
    eq: (...a) => { entry.filters.push(['eq', ...a]); return q },
    neq: (...a) => { entry.filters.push(['neq', ...a]); return q },
    gt: (...a) => { entry.filters.push(['gt', a[0]]); return q },
    is: (...a) => { entry.filters.push(['is', ...a]); return q },
    then: (res, rej) => Promise.resolve(results[table] ?? { count: 0, error: null }).then(res, rej),
  }
  return q
})
vi.mock('../supabaseClient', () => ({ supabase: { from: (...a) => from(...a) } }))

const { fetchSiteStats } = await import('./modActions')
const filtersFor = (table) => calls.filter((c) => c.table === table).map((c) => c.filters)

beforeEach(() => { calls.length = 0; results = {} })

describe('fetchSiteStats', () => {
  it('filters content on mod_status, the column that exists', async () => {
    await fetchSiteStats()
    for (const table of ['books', 'threads', 'book_comments']) {
      expect(filtersFor(table)[0]).toContainEqual(['eq', 'mod_status', 'live'])
      expect(JSON.stringify(filtersFor(table))).not.toContain('"status"')
    }
  })
  it('counts member stories, not the classics', async () => {
    await fetchSiteStats()
    expect(filtersFor('books')[0]).toContainEqual(['is', 'archive_author', null])
  })
  it('throws instead of showing 0 when a count fails', async () => {
    results.threads = { count: null, error: new Error('column threads.status does not exist') }
    await expect(fetchSiteStats()).rejects.toThrow(/does not exist/)
  })
  it('returns the counts', async () => {
    results.books = { count: 5, error: null }
    expect((await fetchSiteStats()).liveStories).toBe(5)
  })
})
