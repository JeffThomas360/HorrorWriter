import { describe, it, expect } from 'vitest'
import { formatEdited, ritualEditErrorMessage } from './ritualEntry'

describe('formatEdited', () => {
  it('formats in the reader\'s local time, 24-hour', () => {
    expect(formatEdited(new Date(2026, 9, 22, 16, 57))).toBe('Edited October 22nd, 2026 @ 1657')
    expect(formatEdited(new Date(2026, 0, 1, 0, 5))).toBe('Edited January 1st, 2026 @ 0005')
  })
  it('uses the right ordinals', () => {
    expect(formatEdited(new Date(2026, 5, 2, 9, 0))).toContain('June 2nd')
    expect(formatEdited(new Date(2026, 5, 3, 9, 0))).toContain('June 3rd')
    expect(formatEdited(new Date(2026, 5, 11, 9, 0))).toContain('June 11th')
    expect(formatEdited(new Date(2026, 5, 23, 9, 0))).toContain('June 23rd')
  })
  it('is empty when there was no edit', () => {
    expect(formatEdited(null)).toBe('')
    expect(formatEdited('not a date')).toBe('')
  })
})

describe('ritualEditErrorMessage', () => {
  it('explains the word range', () => {
    expect(ritualEditErrorMessage({ code: 'HW023' })).toMatch(/at least 100 words/)
    expect(ritualEditErrorMessage({ code: 'HW014' })).toMatch(/100 and 2000/)
  })
})
