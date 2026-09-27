import { describe, it, expect } from 'vitest'
import { generateRecoveryCode, sealWriting, unsealWriting, normaliseCode, BUNDLE_VERSION } from './seal'
import { EFF_WORDS } from './eff-wordlist'

const payload = { v: 1, stories: [{ title: 'The Lath and the Marrow', content: 'x'.repeat(5000) }], series: [] }

describe('recovery code', () => {
  it('is six EFF words and a four-character suffix', () => {
    const code = generateRecoveryCode()
    const parts = code.split('-')
    expect(parts).toHaveLength(7)
    parts.slice(0, 6).forEach((w) => expect(EFF_WORDS).toContain(w.toLowerCase()))
    expect(parts[6]).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/)
  })
  it('differs every time', () => {
    expect(generateRecoveryCode()).not.toBe(generateRecoveryCode())
  })
  it('normalises what a member types', () => {
    expect(normaliseCode('  pale hound-ashes ')).toBe('PALE-HOUND-ASHES')
  })
})

describe('seal and unseal', () => {
  it('round-trips with the right code', async () => {
    const code = generateRecoveryCode()
    const bundle = await sealWriting(payload, code)
    expect(bundle[0]).toBe(BUNDLE_VERSION)
    expect(await unsealWriting(bundle, code.toLowerCase())).toEqual(payload)
  })
  it('compresses before encrypting', async () => {
    const bundle = await sealWriting(payload, generateRecoveryCode())
    expect(bundle.length).toBeLessThan(1000) // 5,000 repeated chars compress to a few dozen bytes
  })
  it('refuses the wrong code', async () => {
    const bundle = await sealWriting(payload, generateRecoveryCode())
    await expect(unsealWriting(bundle, generateRecoveryCode())).rejects.toThrow(/wrong-code/)
  })
  it('refuses a tampered bundle', async () => {
    const code = generateRecoveryCode()
    const bundle = await sealWriting(payload, code)
    bundle[bundle.length - 1] ^= 1
    await expect(unsealWriting(bundle, code)).rejects.toThrow(/wrong-code/)
  })
  it('never contains the code or the plaintext', async () => {
    const code = generateRecoveryCode()
    const text = new TextDecoder('latin1').decode(await sealWriting(payload, code))
    expect(text).not.toContain(code)
    expect(text).not.toContain('Lath and the Marrow')
  })
})
