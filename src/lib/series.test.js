import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { fetchSeriesWithBooks, fetchStorySeriesContext } from './series'

describe('series utilities', () => {
  it('fetches series with all books ordered by sort_order', async () => {
    const result = await fetchSeriesWithBooks('test-series-id')
    expect(result.series).toHaveProperty('id')
    expect(result.series).toHaveProperty('title')
    expect(result.books).toBeInstanceOf(Array)
    expect(result.books.length).toBeGreaterThan(0)
    // Verify sort order (books should be sorted by series_books.sort_order)
    for (let i = 0; i < result.books.length - 1; i++) {
      expect(result.books[i].sort_order).toBeLessThanOrEqual(result.books[i + 1].sort_order)
    }
  })

  it('returns null if series not found', async () => {
    const result = await fetchSeriesWithBooks('nonexistent-id')
    expect(result).toBeNull()
  })

  it('fetches story series context (current part + all parts)', async () => {
    const result = await fetchStorySeriesContext('test-book-id')
    expect(result).toHaveProperty('series')
    expect(result).toHaveProperty('allBooks')
    expect(result).toHaveProperty('currentIndex')
    expect(result.currentIndex).toBeGreaterThanOrEqual(0)
  })

  it('returns null if story is not part of any series', async () => {
    const result = await fetchStorySeriesContext('book-not-in-series')
    expect(result).toBeNull()
  })
})
