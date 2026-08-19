import { describe, it, expect } from 'vitest'
import { filterOneExamplePerGroup } from './storyHelpers'

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
