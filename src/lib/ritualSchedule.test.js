import { describe, test, expect } from 'vitest'
import { formatSlot, splitQueue } from './ritualSchedule'

describe('formatSlot', () => {
  test('summer slot (EDT) reads as 03:00 ET', () => {
    // Fri 9 Oct 2026 03:00 EDT = 07:00Z
    expect(formatSlot('2026-10-09T07:00:00Z')).toBe('Fri 9 Oct, 03:00 ET')
  })
  test('winter slot (EST, after the 1 Nov change) still reads as 03:00 ET', () => {
    // Fri 6 Nov 2026 03:00 EST = 08:00Z
    expect(formatSlot('2026-11-06T08:00:00Z')).toBe('Fri 6 Nov, 03:00 ET')
  })
})

describe('splitQueue', () => {
  const now = new Date('2026-10-10T12:00:00Z')
  const row = (id, status, goes_live_at, created_at = '2026-10-01T00:00:00Z') =>
    ({ id, body: `prompt ${id}`, status, goes_live_at, source: 'keeper', created_at })

  test('separates live, upcoming and pending', () => {
    const rows = [
      row('old', 'scheduled', '2026-10-02T07:00:00Z'),
      row('live', 'scheduled', '2026-10-09T07:00:00Z'),
      row('next2', 'scheduled', '2026-10-23T07:00:00Z'),
      row('next1', 'scheduled', '2026-10-16T07:00:00Z'),
      row('p2', 'pending', null, '2026-10-05T00:00:00Z'),
      row('p1', 'pending', null, '2026-10-04T00:00:00Z'),
    ]
    const q = splitQueue(rows, now)
    expect(q.live.id).toBe('live')
    expect(q.upcoming.map((r) => r.id)).toEqual(['next1', 'next2'])
    expect(q.pending.map((r) => r.id)).toEqual(['p1', 'p2'])
  })

  test('nothing released yet means live is null', () => {
    const q = splitQueue([row('p', 'pending', null)], now)
    expect(q).toEqual({ live: null, upcoming: [], pending: [expect.objectContaining({ id: 'p' })] })
  })
})
