import { describe, it, expect } from 'vitest'
import { revisionErrorMessage } from './ritualRevision'

describe('revisionErrorMessage', () => {
  it('explains the known failures', () => {
    expect(revisionErrorMessage({ code: 'HW024' })).toMatch(/1 and 4000/)
    expect(revisionErrorMessage({ code: 'HW025' })).toMatch(/already under revision/)
    expect(revisionErrorMessage({ code: 'P0002' })).toMatch(/not under revision/)
    expect(revisionErrorMessage({ code: '42501' })).toMatch(/can't do that/)
  })
  it('falls back to the message', () => {
    expect(revisionErrorMessage({ message: 'boom' })).toBe('boom')
    expect(revisionErrorMessage(null)).toBe('Something went wrong.')
  })
})
