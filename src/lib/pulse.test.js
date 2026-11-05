import { describe, it, expect } from 'vitest'
import { computePulse, weekOf } from './pulse'

const NOW = Date.UTC(2026, 10, 5, 12, 0, 0)
const ago = (days) => new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString()

const handles = { a: 'alice', b: 'bram', c: 'cass', k: 'keeper' }

describe('weekOf', () => {
  it('buckets by 7-day windows', () => {
    expect(weekOf(ago(0.5), NOW)).toBe('this')
    expect(weekOf(ago(6.9), NOW)).toBe('this')
    expect(weekOf(ago(7.1), NOW)).toBe('last')
    expect(weekOf(ago(14.1), NOW)).toBeNull()
    expect(weekOf(new Date(NOW + 1000).toISOString(), NOW)).toBeNull()
  })
})

describe('computePulse', () => {
  it('counts new members per week', () => {
    const p = computePulse({ members: [
      { id: 'a', handle: 'alice', created_at: ago(1) },
      { id: 'b', handle: 'bram', created_at: ago(2) },
      { id: 'c', handle: 'cass', created_at: ago(9) },
    ] }, NOW)
    expect(p.newMembers).toEqual({ this: 2, last: 1 })
  })

  it('does not count a thread opening post as a reply', () => {
    const threads = [{ id: 't1', title: 'Hello', author_id: 'a', created_at: ago(3), prompt_id: null, replies_count: 1 }]
    const th = { created_at: ago(3), prompt_id: null, title: 'Hello' }
    const posts = [
      { id: 'op', thread_id: 't1', author_id: 'a', parent_post_id: null, created_at: ago(3), threads: th },
      { id: 'r1', thread_id: 't1', author_id: 'b', parent_post_id: null, created_at: ago(2), threads: th },
    ]
    expect(computePulse({ threads, posts, handles }, NOW).critiques).toEqual({ this: 1, last: 0 })
  })

  it('counts ritual entries separately from critiques on them', () => {
    // An old ritual thread: its opening (prompt) post is outside the window.
    const th = { created_at: ago(60), prompt_id: 'p1', title: 'CH 13.0' }
    const posts = [
      { id: 'e1', thread_id: 'rt', author_id: 'a', parent_post_id: null, created_at: ago(1), threads: th },
      { id: 'e2', thread_id: 'rt', author_id: 'b', parent_post_id: null, created_at: ago(8), threads: th },
      { id: 'c1', thread_id: 'rt', author_id: 'c', parent_post_id: 'e2', created_at: ago(7.5), threads: th },
    ]
    const p = computePulse({ posts, handles }, NOW)
    expect(p.ritualEntries).toEqual({ this: 1, last: 1 })
    expect(p.critiques).toEqual({ this: 0, last: 1 })
  })

  it('in a new ritual thread, the prompt post is neither an entry nor a critique', () => {
    const th = { created_at: ago(2), prompt_id: 'p1', title: 'CH 14.0' }
    const posts = [
      { id: 'prompt', thread_id: 'rt', author_id: null, parent_post_id: null, created_at: ago(2), threads: th },
      { id: 'e1', thread_id: 'rt', author_id: 'a', parent_post_id: null, created_at: ago(1), threads: th },
    ]
    const p = computePulse({ posts, handles }, NOW)
    expect(p.ritualEntries).toEqual({ this: 1, last: 0 })
    expect(p.critiques).toEqual({ this: 0, last: 0 })
  })

  it('counts story critiques', () => {
    const comments = [{ author_id: 'a', created_at: ago(1) }, { author_id: 'b', created_at: ago(10) }]
    expect(computePulse({ comments, handles }, NOW).critiques).toEqual({ this: 1, last: 1 })
  })

  it('first-time posters: earliest-ever post this week, excluding anyone who posted before', () => {
    const comments = [
      { author_id: 'a', created_at: ago(1) },  // first ever → this week
      { author_id: 'b', created_at: ago(2) },  // b posted before the window → not a first-timer
      { author_id: 'c', created_at: ago(9) },  // first ever → last week…
      { author_id: 'c', created_at: ago(1) },  // …so this one doesn't make c a first-timer again
    ]
    const p = computePulse({ comments, priorAuthors: ['b'], handles }, NOW)
    expect(p.firstTimePosters).toEqual({ this: 1, last: 1 })
    expect(p.firstTimersThisWeek).toEqual(['alice'])
  })

  it('lists threads and stories with no reply after 2 days, longest wait first', () => {
    const threads = [
      { id: 't-new', title: 'Too new', author_id: 'a', created_at: ago(1), prompt_id: null, replies_count: 0 },
      { id: 't-wait', title: 'Quiet dread', author_id: 'a', created_at: ago(3), prompt_id: null, replies_count: 0 },
      { id: 't-ans', title: 'Answered', author_id: 'b', created_at: ago(4), prompt_id: null, replies_count: 2 },
    ]
    const stories = [
      { id: 's1', title: 'The Cellar', author_id: 'b', created_at: ago(5), comments_count: 0 },
      { id: 's-old', title: 'Ancient', author_id: 'b', created_at: ago(40), comments_count: 0 },
    ]
    const p = computePulse({ threads, stories, handles }, NOW)
    expect(p.waiting.map((w) => w.title)).toEqual(['The Cellar', 'Quiet dread'])
    expect(p.waiting[0]).toMatchObject({ kind: 'Story', href: '/library/read/s1/', handle: 'bram' })
    expect(p.waiting[1]).toMatchObject({ kind: 'Thread', href: '/forum/thread/t-wait/' })
  })

  it('lists ritual entries with no critique, and not ritual threads themselves', () => {
    const threads = [{ id: 'rt', title: 'CH 13.0', author_id: 'k', created_at: ago(60), prompt_id: 'p1', replies_count: 0 }]
    const th = { created_at: ago(60), prompt_id: 'p1', title: 'CH 13.0' }
    const posts = [
      { id: 'e1', title: 'Gurney', thread_id: 'rt', author_id: 'a', parent_post_id: null, created_at: ago(4), threads: th },
      { id: 'e2', thread_id: 'rt', author_id: 'b', parent_post_id: null, created_at: ago(5), threads: th },
      { id: 'c1', thread_id: 'rt', author_id: 'c', parent_post_id: 'e2', created_at: ago(3), threads: th },
    ]
    const p = computePulse({ threads, posts, handles }, NOW)
    expect(p.waiting).toHaveLength(1)
    expect(p.waiting[0]).toMatchObject({ kind: 'Ritual entry', title: 'Gurney', href: '/forum/thread/rt/#post-e1', handle: 'alice' })
  })

  it('lists newcomers who have not posted, newest first', () => {
    const members = [
      { id: 'a', handle: 'alice', created_at: ago(1) },
      { id: 'b', handle: 'bram', created_at: ago(3) },
      { id: 'c', handle: 'cass', created_at: ago(2) },
    ]
    const comments = [{ author_id: 'b', created_at: ago(2) }]
    const p = computePulse({ members, comments, handles }, NOW)
    expect(p.quietNewcomers.map((m) => m.handle)).toEqual(['alice', 'cass'])
    expect(p.quietNewcomers[0].href).toBe('/u/alice/')
  })
})
