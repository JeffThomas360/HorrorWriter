// Pure decode/format helpers for a sealed writing bundle. No Deno or npm imports, so vitest can
// test it. A real bundle is versioned salt+iv+ciphertext (>= 45 bytes: 1 version byte + 16-byte
// salt + 12-byte iv + >=16-byte ciphertext) and always starts with BUNDLE_VERSION.
export const MIN_BUNDLE_BYTES = 45
export const BUNDLE_VERSION = 1

export function decodeBundle(base64: string): Uint8Array | null {
  let decoded: string
  try {
    decoded = atob(base64)
  } catch {
    return null
  }
  if (decoded.length < MIN_BUNDLE_BYTES) return null
  const bytes = new Uint8Array(decoded.length)
  for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i)
  if (bytes[0] !== BUNDLE_VERSION) return null
  return bytes
}

// 256-entry lookup table, built once, so formatting a multi-megabyte bundle as hex doesn't
// allocate a small string per byte.
const HEX_TABLE: string[] = new Array(256)
for (let i = 0; i < 256; i++) HEX_TABLE[i] = i.toString(16).padStart(2, '0')

export function toByteaHex(bytes: Uint8Array): string {
  const parts = new Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) parts[i] = HEX_TABLE[bytes[i]]
  return '\\x' + parts.join('')
}

const HEX_PAIR_RE = /^(?:[0-9a-fA-F]{2})*$/

// Parses PostgREST's bytea text representation ('\x' + lowercase hex) back into bytes. Returns
// null for anything malformed instead of throwing, so callers can fail closed on a corrupt row
// rather than leak partial bytes.
export function fromByteaHex(value: string): Uint8Array | null {
  if (typeof value !== 'string' || !value.startsWith('\\x')) return null
  const hex = value.slice(2)
  if (hex.length % 2 !== 0) return null
  if (!HEX_PAIR_RE.test(hex)) return null
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return bytes
}

// btoa(String.fromCharCode(...bytes)) blows the call stack on large bundles (spreading a
// megabyte-plus array as arguments). Chunking through String.fromCharCode.apply on subarrays
// keeps each call's argument list bounded.
const BASE64_CHUNK_SIZE = 32 * 1024

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK_SIZE) {
    const chunk = bytes.subarray(offset, offset + BASE64_CHUNK_SIZE)
    binary += String.fromCharCode.apply(null, chunk as unknown as number[])
  }
  return btoa(binary)
}
