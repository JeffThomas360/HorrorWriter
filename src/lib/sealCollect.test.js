import { describe, it, expect, vi } from 'vitest'
import { buildPayload, collectWriting } from './sealCollect'

const books = [
  { id: 'b1', title: 'Live one', lede: 'l', content: 'c', cover: 'blood', badge: null, mod_status: 'live', created_at: 't1', updated_at: 't2', version: 3 },
  { id: 'b2', title: 'Under review', lede: 'l', content: 'c', cover: 'bone', badge: null, mod_status: 'screening', created_at: 't1', updated_at: 't2', version: 1 },
  { id: 'b3', title: 'Removed by a keeper', lede: 'l', content: 'c', cover: 'cyan', badge: null, mod_status: 'hidden', created_at: 't1', updated_at: 't2', version: 1 },
]
const series = [{ id: 's1', title: 'Cycle', description: 'd', created_at: 't0' }]
const seriesBooks = [{ series_id: 's1', book_id: 'b1', sort_order: 1 }, { series_id: 's1', book_id: 'b3', sort_order: 2 }]

describe('buildPayload', () => {
  it('includes live and under-review stories, never moderation-removed ones', () => {
    const p = buildPayload(books, series, seriesBooks)
    expect(p.stories.map((s) => s.title)).toEqual(['Live one', 'Under review'])
  })
  it('keeps series and drops parts pointing at excluded stories', () => {
    const p = buildPayload(books, series, seriesBooks)
    expect(p.series).toEqual([{ title: 'Cycle', description: 'd', created_at: 't0', parts: [{ story_key: 'b1', sort_order: 1 }] }])
  })
  it('is versioned', () => {
    expect(buildPayload([], [], [], null).v).toBe(2)
  })
  it('carries identity when a profile is given', () => {
    const p = buildPayload([], [], [], { handle: 'night-owl', display_name: 'Night Owl' })
    expect(p.identity).toEqual({ handle: 'night-owl', display_name: 'Night Owl' })
  })
  it('has null identity when no profile is given', () => {
    expect(buildPayload([], [], [], null).identity).toBe(null)
  })
})

describe('collectWriting', () => {
  function makeSupabase({ profileData = { handle: 'h', display_name: 'H' }, profileError = null } = {}) {
    const eq = vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: profileData, error: profileError }) })
    const profilesSelect = vi.fn().mockReturnValue({ eq })
    return {
      from: vi.fn((table) => {
        if (table === 'books') {
          return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }
        }
        if (table === 'series') {
          return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }
        }
        if (table === 'series_books') {
          return { select: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) }
        }
        if (table === 'profiles') {
          return { select: profilesSelect }
        }
        throw new Error('unexpected table ' + table)
      }),
    }
  }

  it('reads the profile and lands it in identity', async () => {
    const supabase = makeSupabase({ profileData: { handle: 'night-owl', display_name: 'Night Owl' } })
    const payload = await collectWriting(supabase, 'user-1')
    expect(payload.identity).toEqual({ handle: 'night-owl', display_name: 'Night Owl' })
    expect(supabase.from).toHaveBeenCalledWith('profiles')
  })

  it('rejects when the profile query errors', async () => {
    const supabase = makeSupabase({ profileData: null, profileError: new Error('boom') })
    await expect(collectWriting(supabase, 'user-1')).rejects.toThrow('boom')
  })
})
