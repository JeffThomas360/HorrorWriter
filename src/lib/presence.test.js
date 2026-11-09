import { test, expect, describe } from 'vitest'
import { splitPresence } from './presence'

describe('splitPresence', () => {
  test('signed-in writers are listed; guests are only counted', () => {
    const { writers, readers } = splitPresence([
      { id: 'u1', handle: 'beetlebub' },
      { id: 'anonymous-abc', handle: 'Guest' },
      { id: 'anonymous-def', handle: 'Guest' },
    ])
    expect(writers.map((w) => w.handle)).toEqual(['beetlebub'])
    expect(readers).toBe(2)
  })

  // A signed-in member whose handle hasn't loaded yet has no name to show.
  test('a member still loading their handle counts as reading, not as a nameless writer', () => {
    const { writers, readers } = splitPresence([
      { id: 'u2', handle: 'Summoning...' },
      { id: 'u3', handle: '' },
    ])
    expect(writers).toEqual([])
    expect(readers).toBe(2)
  })

  test('nobody online', () => {
    expect(splitPresence([])).toEqual({ writers: [], readers: 0 })
  })
})
