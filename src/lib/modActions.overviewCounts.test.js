import { describe, it, expect, vi, beforeEach } from 'vitest'

// Records every filter applied per table; each query resolves to a count.
const calls = []
const from = vi.fn((table) => {
  const entry = { table, filters: [] }
  calls.push(entry)
  const q = {
    select: () => q,
    eq: (...a) => { entry.filters.push(['eq', ...a]); return q },
    not: (...a) => { entry.filters.push(['not', ...a]); return q },
    then: (res, rej) => Promise.resolve({ count: 3, error: null }).then(res, rej),
  }
  return q
})
const rpc = vi.fn(() => Promise.resolve({ data: [], error: null }))
vi.mock('../supabaseClient', () => ({ supabase: { from: (...a) => from(...a), rpc: (...a) => rpc(...a) } }))

const { fetchOverviewCounts } = await import('./modActions')

beforeEach(() => { calls.length = 0 })

describe('fetchOverviewCounts', () => {
  it('no longer counts Support: tickets live in the Work Queue now', async () => {
    const counts = await fetchOverviewCounts()
    expect(counts).not.toHaveProperty('openSupport')
    // One query per remaining count; none of them is the old site-report count.
    const siteCount = calls.filter((c) => c.table === 'reports'
      && c.filters.some((f) => f[0] === 'eq' && f[1] === 'target_type' && f[2] === 'site'))
    expect(siteCount).toHaveLength(0)
  })

  it('still keeps old site rows out of the content-report count', async () => {
    await fetchOverviewCounts()
    const reportFilters = calls.filter((c) => c.table === 'reports').map((c) => c.filters)
    expect(reportFilters).toContainEqual([['eq', 'status', 'open'], ['not', 'target_type', 'in', '(appeal,site)']])
  })

  it('returns the counts that remain', async () => {
    expect(await fetchOverviewCounts()).toEqual({
      openReports: 3, openAppeals: 3, pendingStorms: 3, activeSanctions: 0,
    })
  })
})
