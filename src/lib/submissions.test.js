import { describe, test, expect } from 'vitest'
import {
  SUBMISSION_KINDS,
  groupByKind,
  summarize,
  submissionHref,
  flagText,
  totalSubmissions,
  formatEdits,
} from './submissions'

const row = (over = {}) => ({
  kind: 'story', id: 'x', created_at: '2026-10-10T12:00:00Z', mod_status: 'live', reports: 0, ...over,
})

describe('SUBMISSION_KINDS', () => {
  test('lists the five kinds in the order the columns and tabs show them', () => {
    expect(SUBMISSION_KINDS.map((k) => k.label)).toEqual(['Stories', 'Rituals', 'Threads', 'Replies', 'Critiques'])
  })
})

describe('groupByKind', () => {
  test('sorts rows under their kind and keeps an empty list for the others', () => {
    const groups = groupByKind([row({ id: 'a' }), row({ id: 'b', kind: 'critique' }), row({ id: 'c' })])
    expect(groups.story.map((r) => r.id)).toEqual(['a', 'c'])
    expect(groups.critique.map((r) => r.id)).toEqual(['b'])
    expect(groups.thread).toEqual([])
  })
})

describe('summarize', () => {
  test('finds the first and last post whatever order the rows arrive in', () => {
    const s = summarize([
      row({ created_at: '2026-10-10T12:00:00Z' }),
      row({ created_at: '2026-11-02T12:00:00Z' }),
      row({ created_at: '2026-10-03T12:00:00Z' }),
    ])
    expect(s.first).toBe('2026-10-03T12:00:00Z')
    expect(s.last).toBe('2026-11-02T12:00:00Z')
  })

  test('adds up hidden rows, screening rows and reports', () => {
    const s = summarize([
      row({ mod_status: 'hidden', reports: 2 }),
      row({ mod_status: 'screening', reports: 1 }),
      row({ mod_status: 'hidden' }),
      row(),
    ])
    expect(s).toMatchObject({ hidden: 2, screening: 1, reports: 3 })
  })

  test('has no dates for a member with no submissions', () => {
    expect(summarize([])).toEqual({ first: null, last: null, hidden: 0, screening: 0, reports: 0 })
  })
})

describe('submissionHref', () => {
  test('a story opens its reading page', () => {
    expect(submissionHref(row({ id: 's1', story_id: 's1' }))).toBe('/library/read/s1/')
  })

  test('a critique on a story opens that story, not a page named after the critique', () => {
    expect(submissionHref(row({ kind: 'critique', id: 'c1', story_id: 's1' }))).toBe('/library/read/s1/')
  })

  test('a thread opens the thread', () => {
    expect(submissionHref(row({ kind: 'thread', id: 't1', thread_id: 't1' }))).toBe('/forum/thread/t1/')
  })

  test.each(['reply', 'ritual', 'critique'])('a %s stored as a post jumps to that post', (kind) => {
    expect(submissionHref(row({ kind, id: 'p1', thread_id: 't1' }))).toBe('/forum/thread/t1/#post-p1')
  })

  test('a row with nowhere to go has no link', () => {
    expect(submissionHref(row())).toBeNull()
  })
})

describe('flagText', () => {
  test('is empty when everything is live', () => {
    expect(flagText({ total: 3, hidden: 0, screening: 0 })).toBe('')
    expect(flagText(undefined)).toBe('')
  })

  test('names what is hidden and what is in screening', () => {
    expect(flagText({ total: 3, hidden: 1, screening: 2 })).toBe('1 hidden, 2 in screening')
    expect(flagText({ total: 3, hidden: 0, screening: 1 })).toBe('1 in screening')
  })
})

describe('totalSubmissions', () => {
  test('adds every kind together', () => {
    expect(totalSubmissions({ submissions: { story: { total: 3 }, critique: { total: 4 } } })).toBe(7)
  })

  test('is zero when a member has none', () => {
    expect(totalSubmissions({ submissions: {} })).toBe(0)
    expect(totalSubmissions({})).toBe(0)
  })
})

describe('formatEdits', () => {
  test('shows a known count as it is', () => {
    expect(formatEdits(row({ edits: 3, edits_is_minimum: false }))).toBe('3')
    expect(formatEdits(row({ edits: 0, edits_is_minimum: false }))).toBe('0')
  })

  test('marks a count that may be low because the edit came before counting began', () => {
    expect(formatEdits(row({ edits: 1, edits_is_minimum: true }))).toBe('1+')
  })
})
