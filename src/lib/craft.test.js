import { describe, it, expect } from 'vitest'
import { visibleCraft } from './craft'

const entry = (id, data) => ({ id, data: { order: 100, draft: false, title: id, ...data } })

describe('visibleCraft', () => {
  const entries = [
    entry('b', { order: 2 }),
    entry('draft', { draft: true, order: 0 }),
    entry('a', { order: 1 }),
    entry('c', { order: 2, title: 'aaa' }),
  ]
  it('never shows drafts in production', () => {
    expect(visibleCraft(entries).map((e) => e.id)).toEqual(['a', 'c', 'b'])
  })
  it('shows drafts in dev', () => {
    expect(visibleCraft(entries, { dev: true }).map((e) => e.id)).toEqual(['draft', 'a', 'c', 'b'])
  })
  it('is empty when nothing is published, so /craft/ is not built', () => {
    expect(visibleCraft([entry('x', { draft: true })])).toEqual([])
  })
})
