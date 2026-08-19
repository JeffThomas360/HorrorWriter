import { describe, it, expect } from 'vitest'
import { countWords, validateStoryContent } from './storyValidation'

describe('storyValidation', () => {
  it('correctly counts words in story text', () => {
    expect(countWords('')).toBe(0)
    expect(countWords('   ')).toBe(0)
    expect(countWords('Hello world')).toBe(2)
    expect(countWords('One, two... three! Four.\n\nFive.')).toBe(5)
  })

  it('rejects stories under 50 words', () => {
    const shortText = Array(49).fill('word').join(' ')
    const result = validateStoryContent(shortText)
    expect(result.valid).toBe(false)
    expect(result.wordCount).toBe(49)
    expect(result.error).toMatch(/at least 50 words/)
  })

  it('accepts stories exactly 50 words', () => {
    const text50 = Array(50).fill('word').join(' ')
    const result = validateStoryContent(text50)
    expect(result.valid).toBe(true)
    expect(result.wordCount).toBe(50)
    expect(result.error).toBeUndefined()
  })

  it('accepts stories between 50 and 10000 words', () => {
    const text500 = Array(500).fill('horror').join(' ')
    const result = validateStoryContent(text500)
    expect(result.valid).toBe(true)
    expect(result.wordCount).toBe(500)
  })

  it('accepts stories exactly 10000 words', () => {
    const text10k = Array(10000).fill('darkness').join(' ')
    const result = validateStoryContent(text10k)
    expect(result.valid).toBe(true)
    expect(result.wordCount).toBe(10000)
  })

  it('rejects stories exceeding 10000 words', () => {
    const textOver = Array(10001).fill('spooky').join(' ')
    const result = validateStoryContent(textOver)
    expect(result.valid).toBe(false)
    expect(result.wordCount).toBe(10001)
    expect(result.error).toMatch(/exceed 10,000 words/)
  })
})
