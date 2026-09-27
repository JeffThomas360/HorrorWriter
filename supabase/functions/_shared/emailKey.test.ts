import { describe, it, expect } from 'vitest'
import { emailKey } from './emailKey'

describe('emailKey', () => {
  it('is the same for the same address however it is typed', async () => {
    expect(await emailKey(' Writer@Example.com ', 's')).toBe(await emailKey('writer@example.com', 's'))
  })
  it('depends on the secret and never contains the address', async () => {
    const a = await emailKey('writer@example.com', 's1')
    expect(a).not.toBe(await emailKey('writer@example.com', 's2'))
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })
  it('refuses an empty secret', async () => {
    await expect(emailKey('writer@example.com', '')).rejects.toThrow()
  })
})
