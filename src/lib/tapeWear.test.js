import { describe, it, expect } from 'vitest'
import { hashString, seededRandom, wearLevel, readMinutes, tapeLook } from './tapeWear'

const NOW = new Date('2026-10-10T12:00:00Z').getTime()
const daysAgo = (n) => new Date(NOW - n * 86400000).toISOString()

describe('seeded randomness', () => {
  it('is stable for the same id and differs between ids', () => {
    expect(hashString('abc')).toBe(hashString('abc'))
    expect(hashString('abc')).not.toBe(hashString('abd'))
    const a = seededRandom(42), b = seededRandom(42)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })

  // The look must not change between visits or renders.
  it('gives the same tape the same look every time', () => {
    const story = { id: 'a4c1e000-0000-4000-8000-000000000001', created_at: daysAgo(30), comments_count: 1 }
    expect(tapeLook(story, NOW)).toEqual(tapeLook(story, NOW))
    expect(tapeLook(story, NOW)).not.toEqual(tapeLook({ ...story, id: 'other' }, NOW))
  })

  it('keeps the tilt subtle', () => {
    for (let i = 0; i < 50; i++) {
      const { tilt } = tapeLook({ id: `s-${i}` }, NOW)
      expect(Math.abs(tilt)).toBeLessThanOrEqual(1.6)
    }
  })
})

describe('wear comes only from real data', () => {
  it('a new story with no critiques is pristine', () => {
    expect(wearLevel({ created_at: daysAgo(0), comments_count: 0 }, NOW)).toBe(0)
  })
  it('wears with age', () => {
    expect(wearLevel({ created_at: daysAgo(10) }, NOW)).toBe(1)
    expect(wearLevel({ created_at: daysAgo(60) }, NOW)).toBe(3)
  })
  it('wears with critiques', () => {
    expect(wearLevel({ created_at: daysAgo(0), comments_count: 4 }, NOW)).toBe(2)
  })
  it('caps at 4: a classic from 1843 is the most worn tape', () => {
    expect(wearLevel({ created_at: '1843-01-01T00:00:00Z', comments_count: 0 }, NOW)).toBe(4)
  })
})

describe('readMinutes', () => {
  it('rounds to whole minutes at ~230 wpm, minimum 1', () => {
    expect(readMinutes('word '.repeat(2076))).toBe(9)
    expect(readMinutes('just a few words')).toBe(1)
  })
  it('is null without text, so the card shows no invented number', () => {
    expect(readMinutes('')).toBeNull()
    expect(readMinutes(undefined)).toBeNull()
  })
})
