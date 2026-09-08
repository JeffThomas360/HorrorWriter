import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  MIN_AGE, GATE_KEY, PASSED, BLOCKED,
  meetsMinimumAge, selectableYears, readGate, writeGate
} from './ageGate'

const NOW = new Date(Date.UTC(2026, 8, 8)) // 2026-09-08

describe('meetsMinimumAge', () => {
  it('allows someone comfortably over the minimum', () => {
    expect(meetsMinimumAge(1990, 5, NOW)).toBe(true)
  })

  it('allows someone who turned 13 earlier this year', () => {
    expect(meetsMinimumAge(2013, 1, NOW)).toBe(true)
  })

  it('blocks someone who turns 13 later this year', () => {
    // born Dec 2013 → 13 in Dec 2026, still 12 on 2026-09-08
    expect(meetsMinimumAge(2013, 12, NOW)).toBe(false)
  })

  it('blocks the birth month itself until the month has fully elapsed', () => {
    // Born Sept 2013. Youngest possible birthday is 2013-09-30, so they are not
    // certainly 13 until 2026-09-30. On the 8th we must block.
    expect(meetsMinimumAge(2013, 9, NOW)).toBe(false)
    expect(meetsMinimumAge(2013, 9, new Date(Date.UTC(2026, 8, 30)))).toBe(true)
  })

  it('blocks anyone clearly under age', () => {
    expect(meetsMinimumAge(2020, 1, NOW)).toBe(false)
  })

  it('rejects impossible, future and malformed input', () => {
    expect(meetsMinimumAge(2030, 1, NOW)).toBe(false)   // future
    expect(meetsMinimumAge(1800, 1, NOW)).toBe(false)   // implausible
    expect(meetsMinimumAge(2000, 13, NOW)).toBe(false)  // bad month
    expect(meetsMinimumAge(2000, 0, NOW)).toBe(false)
    expect(meetsMinimumAge(null, null, NOW)).toBe(false)
    expect(meetsMinimumAge('2000', '1', NOW)).toBe(false)
  })

  it('uses a minimum age of 13', () => {
    expect(MIN_AGE).toBe(13)
  })
})

describe('selectableYears', () => {
  it('starts at the current year and spans a century', () => {
    const years = selectableYears(NOW)
    expect(years[0]).toBe(2026)
    expect(years).toHaveLength(101)
    expect(years[years.length - 1]).toBe(1926)
  })
})

describe('gate storage', () => {
  beforeEach(() => { try { window.localStorage.clear() } catch { /* noop */ } })

  it('round-trips a verdict', () => {
    expect(readGate()).toBeNull()
    writeGate(PASSED)
    expect(readGate()).toBe(PASSED)
    writeGate(BLOCKED)
    expect(readGate()).toBe(BLOCKED)
  })

  it('ignores unrecognised stored values', () => {
    window.localStorage.setItem(GATE_KEY, 'maybe')
    expect(readGate()).toBeNull()
  })

  it('never throws when storage is unavailable', () => {
    const spy = vi.spyOn(window.localStorage.__proto__, 'getItem')
      .mockImplementation(() => { throw new Error('denied') })
    expect(readGate()).toBeNull()
    spy.mockRestore()

    const setSpy = vi.spyOn(window.localStorage.__proto__, 'setItem')
      .mockImplementation(() => { throw new Error('denied') })
    expect(() => writeGate(PASSED)).not.toThrow()
    setSpy.mockRestore()
  })
})
