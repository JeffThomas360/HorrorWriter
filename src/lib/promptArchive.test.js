import { describe, it, expect } from 'vitest'
import { buildArchive } from './promptArchive'

const prompts = [
  { id: 'p3', body: 'Third', goes_live_at: '2026-10-16T07:00:00Z' },
  { id: 'p2', body: 'Second', goes_live_at: '2026-10-09T07:00:00Z' },
  { id: 'p1', body: 'First', goes_live_at: '2026-10-02T07:00:00Z' },
]

describe('buildArchive', () => {
  it('lists every prompt, attaching thread and entry count where one exists', () => {
    const out = buildArchive(prompts, [{ id: 't2', prompt_id: 'p2', posts: [{ count: 3 }] }])
    expect(out.map((p) => [p.id, p.threadId, p.entries])).toEqual([
      ['p3', null, 0],
      ['p2', 't2', 3],
      ['p1', null, 0],
    ])
  })

  it('marks only the newest prompts as open', () => {
    expect(buildArchive(prompts, [], 2).map((p) => p.open)).toEqual([true, true, false])
  })

  it('treats a thread with no entries as zero', () => {
    expect(buildArchive(prompts, [{ id: 't1', prompt_id: 'p1', posts: [] }])[2]).toMatchObject({ threadId: 't1', entries: 0 })
  })

  it('handles missing inputs', () => {
    expect(buildArchive(null, null)).toEqual([])
  })
})
