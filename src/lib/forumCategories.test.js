import { describe, it, expect } from 'vitest'
import { getCategoryMeta, categorySidebarLabel, categoryOptionLabel } from './forumCategories'

describe('forumCategories', () => {
  it('replaces "The Crypt · Critique" with purposeful "First Lines & Snags" metadata', () => {
    const meta = getCategoryMeta({ id: 'crypt', name: 'The Crypt · Critique' })
    expect(meta.sidebarLabel).toBe('First Lines & Snags')
    expect(meta.fullTitle).toBe('First Lines & Snags · Workshop')
    expect(meta.mission).toMatch(/opening 250 words/i)
    expect(meta.staffOnly).toBe(false)
  })

  it('gives every core Crypt category a clear sidebar label and mission', () => {
    expect(categorySidebarLabel({ id: 'rituals', name: 'Midnight Rituals Critique Room' })).toBe('Midnight Rituals')
    expect(categorySidebarLabel({ id: 'seance', name: 'The Writing Desk · Craft' })).toBe('Craft & Anatomy')
    expect(categorySidebarLabel({ id: 'dispatch', name: 'Dispatches · Market' })).toBe('Markets & Calls')
    expect(categorySidebarLabel({ id: 'hours', name: 'After Hours' })).toBe('The Green Room')
    expect(categorySidebarLabel({ id: 'coven', name: 'Notice Board · Announcements' })).toBe('Notice Board')
    expect(getCategoryMeta('coven').staffOnly).toBe(true)
  })

  it('falls back to the text before · for custom or test categories', () => {
    expect(categorySidebarLabel({ id: 'craft', name: 'Craft · Workshop talk' })).toBe('Craft')
    expect(categoryOptionLabel({ id: 'cat-1', name: 'General Horror' })).toBe('General Horror')
  })
})
