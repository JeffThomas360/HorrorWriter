import { afterEach, describe, expect, it } from 'vitest'
import { isPlaywrightTest } from './testMode'

describe('isPlaywrightTest', () => {
  afterEach(() => {
    delete globalThis.__PLAYWRIGHT_TEST__
  })

  it('is false when the build-time flag is absent (production, vitest)', () => {
    expect(isPlaywrightTest()).toBe(false)
  })

  it('is true only for the literal true the define injects', () => {
    globalThis.__PLAYWRIGHT_TEST__ = true
    expect(isPlaywrightTest()).toBe(true)
    globalThis.__PLAYWRIGHT_TEST__ = 'true'
    expect(isPlaywrightTest()).toBe(false)
  })
})
