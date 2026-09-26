import { describe, it, expect } from 'vitest'
import { lookupOutcome } from './lookup'

// A page should 404 only when the record is definitely not there. An outage
// or an unexpected error must not tell Google to drop a real page.
describe('lookupOutcome', () => {
  it('is found when a row came back', () => {
    expect(lookupOutcome({ data: { id: 1 }, error: null })).toBe('found')
  })

  it('is missing when the query succeeded with no row', () => {
    expect(lookupOutcome({ data: null, error: null })).toBe('missing')
  })

  it('is missing for an id that is not a valid uuid', () => {
    expect(lookupOutcome({ data: null, error: { code: '22P02', message: 'invalid input syntax for type uuid' } })).toBe('missing')
  })

  it('is unknown for any other error', () => {
    expect(lookupOutcome({ data: null, error: { code: 'PGRST301', message: 'timeout' } })).toBe('unknown')
  })

  it('is unknown when there was no response at all', () => {
    expect(lookupOutcome(undefined)).toBe('unknown')
  })
})
