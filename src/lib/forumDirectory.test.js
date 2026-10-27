import { describe, it, expect } from 'vitest'
import { buildDirectory } from './forumDirectory'

const categories = [
  { id: 'craft', name: 'Craft · Workshop talk' },
  { id: 'rituals', name: 'Midnight Rituals' },
  { id: 'empty', name: 'Empty Room' },
]
const threads = [
  { id: 't1', title: 'One', category_id: 'rituals' },
  { id: 't2', title: 'Two', category_id: 'craft' },
  { id: 't3', title: 'Three', category_id: 'craft' },
  { id: 't4', title: 'Orphan', category_id: 'gone' },
]

describe('buildDirectory', () => {
  it('groups threads under categories in category order, keeping thread order', () => {
    const out = buildDirectory(categories, threads)
    expect(out.map((c) => [c.id, c.threads.map((t) => t.id)])).toEqual([
      ['craft', ['t2', 't3']],
      ['rituals', ['t1']],
    ])
  })

  it('labels a category with the part before the dot', () => {
    expect(buildDirectory(categories, threads)[0].label).toBe('Craft')
  })

  it('drops empty categories and orphaned threads', () => {
    const ids = buildDirectory(categories, threads).map((c) => c.id)
    expect(ids).not.toContain('empty')
  })

  it('handles missing inputs', () => {
    expect(buildDirectory(null, null)).toEqual([])
  })
})
