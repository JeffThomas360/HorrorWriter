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
