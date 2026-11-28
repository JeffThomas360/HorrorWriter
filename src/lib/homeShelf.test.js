import { describe, it, expect } from 'vitest'
import { storyTiles } from './homeShelf'
import { isThisWeeks } from './ritualSchedule'

const words = (n) => Array.from({ length: n }, () => 'dread').join(' ')

describe('storyTiles', () => {
  it('shows reading time, writer and a link to the story', () => {
    const [tile] = storyTiles([
      { id: 'abc', title: 'Little Bird', lede: ' A nest in the wall. ', content: words(2300), profiles: { handle: 'wren' } },
    ])
    expect(tile).toEqual({
      tag: '▸ STORY · 10 MIN READ',
      title: 'Little Bird',
      body: 'A nest in the wall.',
      meta: 'By @wren · read it →',
      href: '/library/read/abc/',
    })
  })

  it('never mentions how long a story has waited or that nobody replied', () => {
    const text = JSON.stringify(storyTiles([
      { id: 'abc', title: 'Cortex', lede: null, content: words(50), created_at: '2026-11-02T00:00:00Z', comments_count: 0, profiles: { handle: 'jc_' } },
    ])).toLowerCase()
    expect(text).not.toMatch(/waiting|no one|days/)
  })

  it('copes with a story that has no summary, no text and no writer', () => {
    expect(storyTiles([{ id: 'x', title: 'Untitled', lede: null, content: '', profiles: null }])).toEqual([
      { tag: '▸ STORY', title: 'Untitled', body: '', meta: 'Read it →', href: '/library/read/x/' },
    ])
  })

  it('returns nothing for no rows', () => {
    expect(storyTiles(null)).toEqual([])
  })
})

describe('isThisWeeks', () => {
  const now = new Date('2026-11-23T00:00:00Z').getTime()

  it('is true for a prompt released under a week ago', () => {
    expect(isThisWeeks('2026-11-20T08:00:00Z', now)).toBe(true)
  })

  it('is false for a prompt released over a week ago', () => {
    expect(isThisWeeks('2026-11-06T08:00:00Z', now)).toBe(false)
  })

  it('is false for a missing or unreadable date', () => {
    expect(isThisWeeks(undefined, now)).toBe(false)
    expect(isThisWeeks('not a date', now)).toBe(false)
  })
})
