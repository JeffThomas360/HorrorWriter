import { describe, it, expect } from 'vitest'
import { filterOneExamplePerGroup, isStoryOwner, copyrightNotice, authorLabel, isTombstone, TOMBSTONE_TEXT, isArchive, storyAuthorLabel, storyKeyColumn, storyUrlKey } from './storyHelpers'

describe('storyHelpers', () => {
  it('passes through all real (non-example) stories', () => {
    const realStories = [
      { id: '1', title: 'Real 1', is_example: false, category_id: 'cat-1' },
      { id: '2', title: 'Real 2', is_example: false, category_id: 'cat-1' },
      { id: '3', title: 'Real 3', is_example: false, category_id: 'cat-2' }
    ]

    const result = filterOneExamplePerGroup(realStories)
    expect(result).toHaveLength(3)
  })

  it('limits example stories to at most one per category group', () => {
    const mixed = [
      { id: 'r1', title: 'Real 1', is_example: false, category_id: 'cat-1' },
      { id: 'ex1', title: 'Example 1', is_example: true, category_id: 'cat-1' },
      { id: 'ex2', title: 'Example 2', is_example: true, category_id: 'cat-1' },
      { id: 'ex3', title: 'Example 3', is_example: true, category_id: 'cat-2' },
      { id: 'ex4', title: 'Example 4', is_example: true, category_id: 'cat-2' }
    ]

    const result = filterOneExamplePerGroup(mixed)
    // Should include: r1, ex1 (for cat-1), ex3 (for cat-2). ex2 & ex4 filtered out!
    expect(result).toHaveLength(3)
    expect(result.map(s => s.id)).toEqual(['r1', 'ex1', 'ex3'])
  })
})

describe('isStoryOwner', () => {
  it('is true when the signed-in user wrote the story', () => {
    expect(isStoryOwner('u1', { author_id: 'u1' })).toBe(true)
  })

  it('is false for another user', () => {
    expect(isStoryOwner('u2', { author_id: 'u1' })).toBe(false)
  })

  // Seeded archive stories have no author_id; signed out, the user id is also
  // undefined, and undefined === undefined showed "Edit Story" to everyone.
  it('is false when signed out and the story has no author', () => {
    expect(isStoryOwner(undefined, { title: 'The Tell-Tale Heart' })).toBe(false)
    expect(isStoryOwner(null, { author_id: null })).toBe(false)
  })

  it('is false when signed out', () => {
    expect(isStoryOwner(undefined, { author_id: 'u1' })).toBe(false)
  })

  it('is false with no story', () => {
    expect(isStoryOwner('u1', null)).toBe(false)
  })
})

describe('copyrightNotice', () => {
  // Authors keep all rights (House Rules, rule 1). Every story says so.
  it('credits the author and the year of publication', () => {
    expect(copyrightNotice({ created_at: '2026-09-02T10:00:00Z', profiles: { handle: 'beetlebub' } }))
      .toBe('© 2026 @beetlebub. All rights reserved.')
  })

  // The classics are public domain: claiming copyright would be false.
  it('marks archive stories as public domain, never copyrighted', () => {
    const notice = copyrightNotice({ archive_author: 'Edgar Allan Poe', author_id: null, created_at: '1843-01-01T00:00:00Z', profiles: null })
    expect(notice).toBe('Public domain · first published 1843')
    expect(notice).not.toMatch(/©|rights reserved/i)
  })

  it('still credits the author when the handle is missing', () => {
    expect(copyrightNotice({ created_at: '2026-01-05T00:00:00Z', profiles: null }))
      .toBe('© 2026 the author. All rights reserved.')
  })

  it('returns nothing without a story', () => {
    expect(copyrightNotice(null)).toBeNull()
  })
})

describe('departed members and tombstones', () => {
  it('labels a present author by handle', () => {
    expect(authorLabel({ handle: 'night-owl' })).toBe('@night-owl')
  })
  it('labels a missing author as a departed member', () => {
    expect(authorLabel(null)).toBe('a departed member')
    expect(authorLabel({ handle: null })).toBe('a departed member')
  })
  it('recognises tombstones', () => {
    expect(isTombstone({ removed_by_author: true })).toBe(true)
    expect(isTombstone({ removed_by_author: false })).toBe(false)
    expect(isTombstone(null)).toBe(false)
    expect(TOMBSTONE_TEXT).toBe('Removed by its author.')
  })
})

describe('archive classics', () => {
  const poe = { id: 'a4c1e000-0000-4000-8000-000000000001', slug: 'archive-tell-tale-heart', archive_author: 'Edgar Allan Poe', author_id: null, profiles: null }
  const departed = { id: 'b0000000-0000-4000-8000-000000000009', slug: null, archive_author: null, author_id: null, profiles: null }

  // Both have author_id null; only one is a departed member's story.
  it('tells a classic from a departed member', () => {
    expect(isArchive(poe)).toBe(true)
    expect(isArchive(departed)).toBe(false)
    expect(storyAuthorLabel(poe)).toBe('Edgar Allan Poe')
    expect(storyAuthorLabel(departed)).toBe('a departed member')
    expect(storyAuthorLabel({ profiles: { handle: 'night-owl' } })).toBe('@night-owl')
  })

  // A slug sent to the uuid column is a PostgREST 400: the old archive-id bug.
  it('picks the lookup column from the URL key', () => {
    expect(storyKeyColumn('a4c1e000-0000-4000-8000-000000000001')).toBe('id')
    expect(storyKeyColumn('archive-tell-tale-heart')).toBe('slug')
  })

  it('links classics by slug and everything else by id', () => {
    expect(storyUrlKey(poe)).toBe('archive-tell-tale-heart')
    expect(storyUrlKey(departed)).toBe(departed.id)
  })
})
