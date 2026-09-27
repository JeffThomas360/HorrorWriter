import { describe, it, expect } from 'vitest'
import { checkDeleteRequest, FRESH_SIGN_IN_MS } from './deleteRequest'

const now = Date.parse('2026-09-27T12:00:00Z')
const fresh = new Date(now - 60_000).toISOString()

describe('checkDeleteRequest', () => {
  it('accepts an erase with a fresh sign-in', () => {
    expect(checkDeleteRequest({ mode: 'erase' }, fresh, now)).toBeNull()
  })

  it('requires a sign-in within the last 10 minutes', () => {
    const stale = new Date(now - FRESH_SIGN_IN_MS - 1).toISOString()
    expect(checkDeleteRequest({ mode: 'erase' }, stale, now)).toMatch(/sign in again/i)
    expect(checkDeleteRequest({ mode: 'erase' }, null, now)).toMatch(/sign in again/i)
  })

  it('rejects an unknown mode', () => {
    expect(checkDeleteRequest({ mode: 'vanish' }, fresh, now)).toMatch(/choose/i)
    expect(checkDeleteRequest(null, fresh, now)).toMatch(/choose/i)
  })
})
