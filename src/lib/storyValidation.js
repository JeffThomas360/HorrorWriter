/**
 * Counts words in a string by whitespace splitting.
 */
export function countWords(str) {
  if (!str || typeof str !== 'string') return 0
  const trimmed = str.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).length
}

/**
 * Validates story content against bounds: 50 <= wordCount <= 10,000.
 * Returns { valid: boolean, wordCount: number, error?: string }
 */
export function validateStoryContent(content) {
  const wordCount = countWords(content)
  if (wordCount < 50) {
    return {
      valid: false,
      wordCount,
      error: `Story must contain at least 50 words (currently ${wordCount} words).`
    }
  }
  if (wordCount > 10000) {
    return {
      valid: false,
      wordCount,
      error: `Story cannot exceed 10,000 words (currently ${wordCount} words).`
    }
  }
  return { valid: true, wordCount }
}
