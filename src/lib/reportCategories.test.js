import { describe, it, expect } from 'vitest'
import { categoriesFor, categoryLabel } from './reportCategories'

describe('report categories', () => {
  it('offers "Written by AI" for a story, last', () => {
    expect(categoriesFor('story').map((c) => c.label)).toEqual([
      'Harassment / Hate Speech', 'Spam / Bots', 'Urgent / Real-world Harm', 'Other Violation', 'Written by AI',
    ])
  })
  it('does not offer it for anything else', () => {
    for (const type of ['critique', 'thread', 'post', 'user']) {
      expect(categoriesFor(type).map((c) => c.value)).toEqual(['harassment', 'spam', 'urgent', 'other'])
    }
  })
  it('names a category for staff, and falls back to the raw value', () => {
    expect(categoryLabel('ai_written')).toBe('Written by AI')
    expect(categoryLabel('spam')).toBe('Spam / Bots')
    expect(categoryLabel('mystery')).toBe('mystery')
  })
})
