import { describe, it, expect } from 'vitest'
import { escapeHtml, bearerMatches } from './security'

describe('escapeHtml', () => {
  it('neutralises markup in user text headed for an email body', () => {
    expect(escapeHtml('<a href="https://evil.example">click</a>')).toBe(
      '&lt;a href=&quot;https://evil.example&quot;&gt;click&lt;/a&gt;',
    )
  })

  it('escapes ampersands and single quotes', () => {
    expect(escapeHtml(`Tom & Jerry's`)).toBe('Tom &amp; Jerry&#39;s')
  })

  it('stringifies non-strings and treats null/undefined as empty', () => {
    expect(escapeHtml(42)).toBe('42')
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(undefined)).toBe('')
  })
})

describe('bearerMatches', () => {
  it('accepts the exact bearer token', () => {
    expect(bearerMatches('Bearer s3cret', 's3cret')).toBe(true)
  })

  it('rejects a wrong token, including one that shares a prefix', () => {
    expect(bearerMatches('Bearer nope', 's3cret')).toBe(false)
    expect(bearerMatches('Bearer s3cre', 's3cret')).toBe(false)
    expect(bearerMatches('Bearer s3cretX', 's3cret')).toBe(false)
  })

  it('rejects a missing header or a missing expected secret', () => {
    expect(bearerMatches(null, 's3cret')).toBe(false)
    expect(bearerMatches('Bearer s3cret', '')).toBe(false)
    expect(bearerMatches('Bearer ', '')).toBe(false)
    expect(bearerMatches('Bearer s3cret', undefined)).toBe(false)
  })

  it('requires the Bearer scheme', () => {
    expect(bearerMatches('s3cret', 's3cret')).toBe(false)
  })
})
