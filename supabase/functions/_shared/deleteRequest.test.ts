import { describe, it, expect } from 'vitest'
import { checkDeleteRequest, FRESH_SIGN_IN_MS, MAX_BUNDLE_BYTES } from './deleteRequest'

const now = Date.parse('2026-09-27T12:00:00Z')
const fresh = new Date(now - 60_000).toISOString()

// Builds a base64 string whose decoded length is exactly byteLen, using real btoa so the
// padding matches what the production decoder will see.
function base64OfByteLength(byteLen: number): string {
  const chunk = 'A'.repeat(60000)
  let raw = ''
  while (raw.length < byteLen) raw += chunk
  raw = raw.slice(0, byteLen)
  return btoa(raw)
}

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

describe('checkDeleteRequest seal', () => {
  it('accepts a seal with a bundle', () => {
    expect(checkDeleteRequest({ mode: 'seal', bundle: 'AQID' }, fresh, now)).toBeNull()
  })
  it('rejects a seal without a bundle', () => {
    expect(checkDeleteRequest({ mode: 'seal' }, fresh, now)).toMatch(/sealed/i)
  })
  it('rejects an oversized bundle', () => {
    const huge = 'A'.repeat(Math.ceil((MAX_BUNDLE_BYTES + 1) * 4 / 3))
    expect(checkDeleteRequest({ mode: 'seal', bundle: huge }, fresh, now)).toMatch(/too large/i)
  })

  it('accepts a bundle whose exact decoded size is the cap', () => {
    const b64 = base64OfByteLength(MAX_BUNDLE_BYTES)
    expect(checkDeleteRequest({ mode: 'seal', bundle: b64 }, fresh, now)).toBeNull()
  })

  it('rejects a bundle whose exact decoded size is one byte over the cap', () => {
    const b64 = base64OfByteLength(MAX_BUNDLE_BYTES + 1)
    expect(checkDeleteRequest({ mode: 'seal', bundle: b64 }, fresh, now)).toMatch(/too large/i)
  })
})
