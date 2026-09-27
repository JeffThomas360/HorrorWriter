import { describe, it, expect } from 'vitest'
import { decodeBundle, toByteaHex, fromByteaHex, bytesToBase64, MIN_BUNDLE_BYTES, BUNDLE_VERSION } from './bundle'

function b64FromBytes(bytes: number[]): string {
  return btoa(String.fromCharCode(...bytes))
}

function bundleBytes(length: number, firstByte: number): number[] {
  const bytes = new Array(length).fill(0)
  bytes[0] = firstByte
  return bytes
}

describe('decodeBundle', () => {
  it('rejects invalid base64', () => {
    expect(decodeBundle('not valid base64!!!')).toBeNull()
  })

  it('rejects whitespace', () => {
    expect(decodeBundle(' ')).toBeNull()
  })

  it('rejects a bundle below the minimum size', () => {
    expect(decodeBundle('AQID')).toBeNull()
  })

  it('rejects a 44-byte bundle even with a valid version byte', () => {
    expect(decodeBundle(b64FromBytes(bundleBytes(MIN_BUNDLE_BYTES - 1, BUNDLE_VERSION)))).toBeNull()
  })

  it('rejects a 45-byte bundle with the wrong version byte', () => {
    expect(decodeBundle(b64FromBytes(bundleBytes(MIN_BUNDLE_BYTES, 2)))).toBeNull()
  })

  it('accepts a 45-byte bundle with the correct version byte', () => {
    const bytes = bundleBytes(MIN_BUNDLE_BYTES, BUNDLE_VERSION)
    const result = decodeBundle(b64FromBytes(bytes))
    expect(result).not.toBeNull()
    expect(Array.from(result as Uint8Array)).toEqual(bytes)
  })
})

describe('toByteaHex', () => {
  it('formats bytes as a lowercase hex bytea literal', () => {
    expect(toByteaHex(new Uint8Array([0x01, 0xab, 0x00]))).toBe('\\x01ab00')
  })
})

describe('fromByteaHex', () => {
  it('round-trips with toByteaHex', () => {
    const bytes = new Uint8Array([0x01, 0xab, 0x00, 0xff, 0x10])
    expect(fromByteaHex(toByteaHex(bytes))).toEqual(bytes)
  })

  it('round-trips an empty byte array', () => {
    const bytes = new Uint8Array([])
    expect(fromByteaHex(toByteaHex(bytes))).toEqual(bytes)
  })

  it('rejects a value missing the leading \\x prefix', () => {
    expect(fromByteaHex('01ab00')).toBeNull()
  })

  it('rejects odd-length hex', () => {
    expect(fromByteaHex('\\x0')).toBeNull()
    expect(fromByteaHex('\\x01a')).toBeNull()
  })

  it('rejects non-hex characters', () => {
    expect(fromByteaHex('\\xzz')).toBeNull()
    expect(fromByteaHex('\\x01gg')).toBeNull()
  })

  it('accepts uppercase hex', () => {
    expect(fromByteaHex('\\x01AB')).toEqual(new Uint8Array([0x01, 0xab]))
  })
})

describe('bytesToBase64', () => {
  it('matches Buffer.from(...).toString("base64") for a small array', () => {
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255])
    expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'))
  })

  it('matches a Node Buffer reference for a >100 KB array and does not throw', () => {
    const length = 100_000 + 777
    const bytes = new Uint8Array(length)
    for (let i = 0; i < length; i++) bytes[i] = i % 256
    let result = ''
    expect(() => {
      result = bytesToBase64(bytes)
    }).not.toThrow()
    expect(result).toBe(Buffer.from(bytes).toString('base64'))
  })

  it('handles an empty array', () => {
    expect(bytesToBase64(new Uint8Array([]))).toBe('')
  })
})
