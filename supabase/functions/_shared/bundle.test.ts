import { describe, it, expect } from 'vitest'
import { decodeBundle, toByteaHex, MIN_BUNDLE_BYTES, BUNDLE_VERSION } from './bundle'

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
