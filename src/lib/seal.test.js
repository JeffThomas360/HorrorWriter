import { describe, it, expect } from 'vitest'
import { generateRecoveryCode, sealWriting, unsealWriting, normaliseCode, BUNDLE_VERSION } from './seal'
import { EFF_WORDS } from './eff-wordlist'

const payload = { v: 1, stories: [{ title: 'The Lath and the Marrow', content: 'x'.repeat(5000) }], series: [] }

describe('EFF wordlist', () => {
  it('is 7772 unique pure-lowercase words (no hyphens, which would break the dash-separated code)', () => {
    expect(EFF_WORDS).toHaveLength(7772)
    expect(new Set(EFF_WORDS).size).toBe(7772)
    EFF_WORDS.forEach((w) => expect(w).toMatch(/^[a-z]+$/))
  })
})

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
  it('refuses a tampered bundle (bad auth tag) as wrong-code', async () => {
    const code = generateRecoveryCode()
    const bundle = await sealWriting(payload, code)
    bundle[bundle.length - 1] ^= 1
    await expect(unsealWriting(bundle, code)).rejects.toThrow(/wrong-code/)
  })
  it('refuses a wrong version byte as corrupt-bundle', async () => {
    const code = generateRecoveryCode()
    const bundle = await sealWriting(payload, code)
    bundle[0] = BUNDLE_VERSION + 1
    await expect(unsealWriting(bundle, code)).rejects.toThrow(/corrupt-bundle/)
  })
  it('refuses a truncated bundle as corrupt-bundle', async () => {
    const code = generateRecoveryCode()
    const bundle = await sealWriting(payload, code)
    await expect(unsealWriting(bundle.slice(0, 20), code)).rejects.toThrow(/corrupt-bundle/)
  })
  it('never contains the code or the plaintext', async () => {
    const code = generateRecoveryCode()
    const text = new TextDecoder('latin1').decode(await sealWriting(payload, code))
    expect(text).not.toContain(code)
    expect(text).not.toContain('Lath and the Marrow')
  })
  it('unseals a code typed with spaces instead of dashes', async () => {
    const code = generateRecoveryCode()
    const bundle = await sealWriting(payload, code)
    const messy = '  ' + code.toLowerCase().replaceAll('-', ' ') + ' '
    expect(await unsealWriting(bundle, messy)).toEqual(payload)
  })
  it('uses a fresh salt and IV every time, even for the same payload and code', async () => {
    const code = generateRecoveryCode()
    const a = await sealWriting(payload, code)
    const b = await sealWriting(payload, code)
    expect(a.slice(1, 29)).not.toEqual(b.slice(1, 29))
  })
})
