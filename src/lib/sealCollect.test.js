import { describe, it, expect } from 'vitest'
import { buildPayload } from './sealCollect'

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
    expect(buildPayload([], [], []).v).toBe(1)
  })
})
