// Sealing a departing member's writing. Everything here runs in the member's
// browser; the recovery code and the key derived from it never leave it.
// Bundle: version(1) || salt(16) || iv(12) || AES-256-GCM(gzip(JSON)) incl. tag.
import { EFF_WORDS } from './eff-wordlist'

export const BUNDLE_VERSION = 1
export const PBKDF2_ITERATIONS = 600000
const SUFFIX_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export class SealError extends Error {}

// Uniform integer in [0, n) without modulo bias.
function randomBelow(n) {
  const limit = Math.floor(0x100000000 / n) * n
  const buf = new Uint32Array(1)
  do { crypto.getRandomValues(buf) } while (buf[0] >= limit)
  return buf[0] % n
}

export function generateRecoveryCode() {
  const words = Array.from({ length: 6 }, () => EFF_WORDS[randomBelow(EFF_WORDS.length)].toUpperCase())
  const suffix = Array.from({ length: 4 }, () => SUFFIX_ALPHABET[randomBelow(SUFFIX_ALPHABET.length)]).join('')
  return [...words, suffix].join('-')
}

export function normaliseCode(code) {
  return String(code).trim().toUpperCase().split(/[\s-]+/).filter(Boolean).join('-')
}

async function deriveKey(code, salt) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(normaliseCode(code)), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

async function pipe(bytes, transform) {
  return new Uint8Array(await new Response(new Response(bytes).body.pipeThrough(transform)).arrayBuffer())
}

export async function sealWriting(payload, code) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const compressed = await pipe(new TextEncoder().encode(JSON.stringify(payload)), new CompressionStream('gzip'))
  const key = await deriveKey(code, salt)
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, compressed))
  const out = new Uint8Array(1 + 16 + 12 + ciphertext.length)
  out[0] = BUNDLE_VERSION
  out.set(salt, 1)
  out.set(iv, 17)
  out.set(ciphertext, 29)
  return out
}

// AES-GCM appends a 16-byte tag, so a valid bundle is at least
// version(1) + salt(16) + iv(12) + tag(16) long, even for an empty payload.
const MIN_BUNDLE_LENGTH = 1 + 16 + 12 + 16

export async function unsealWriting(bundle, code) {
  if (!(bundle instanceof Uint8Array) || bundle.length < MIN_BUNDLE_LENGTH || bundle[0] !== BUNDLE_VERSION) {
    throw new SealError('corrupt-bundle')
  }
  try {
    const key = await deriveKey(code, bundle.slice(1, 17))
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bundle.slice(17, 29) }, key, bundle.slice(29))
    const json = await pipe(new Uint8Array(plain), new DecompressionStream('gzip'))
    return JSON.parse(new TextDecoder().decode(json))
  } catch {
    throw new SealError('wrong-code')
  }
}
