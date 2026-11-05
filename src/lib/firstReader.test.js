import { describe, it, expect } from 'vitest'
import { computeWaiting } from './firstReader'

const NOW = Date.UTC(2026, 10, 5, 12, 0, 0)
const ago = (days) => new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString()
const handles = { a: 'alice', b: 'bram' }

const raw = {
  threads: [
    { id: 't1', title: 'Fresh', author_id: 'a', created_at: ago(0.2), prompt_id: null, replies_count: 0 },
    { id: 't2', title: 'Old quiet', author_id: 'b', created_at: ago(5), prompt_id: null, replies_count: 0 },
    { id: 't3', title: 'Answered', author_id: 'b', created_at: ago(5), prompt_id: null, replies_count: 1 },
  ],
  stories: [{ id: 's1', title: 'The Cellar', author_id: 'a', created_at: ago(3), comments_count: 0 }],
  handles,
}

describe('computeWaiting', () => {
  it('lists everything unanswered by default, longest wait first, with whole days waited', () => {
    const w = computeWaiting(raw, NOW)
    expect(w.map((x) => [x.title, x.days])).toEqual([['Old quiet', 5], ['The Cellar', 3], ['Fresh', 0]])
  })

  it('minAge drops work that is too new', () => {
    expect(computeWaiting(raw, NOW, { minAge: 2 * 86400000 }).map((x) => x.title)).toEqual(['Old quiet', 'The Cellar'])
  })

  it("excludeAuthor leaves out the viewer's own work", () => {
    expect(computeWaiting(raw, NOW, { excludeAuthor: 'a' }).map((x) => x.title)).toEqual(['Old quiet'])
  })

  it('returns plain data a server can hand to the browser', () => {
    const [first] = computeWaiting(raw, NOW)
    expect(JSON.parse(JSON.stringify(first))).toEqual(first)
    expect(first).toMatchObject({ kind: 'Thread', href: '/forum/thread/t2/', handle: 'bram' })
  })
})
