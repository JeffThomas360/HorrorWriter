// Pure checks for a delete-account request. No Deno or npm imports, so vitest can test it.
export const FRESH_SIGN_IN_MS = 10 * 60 * 1000
export const MAX_BUNDLE_BYTES = 5 * 1024 * 1024

// Exact decoded byte length of a base64 string, from its length and trailing '=' padding —
// cheaper than decoding, and precise (naive `length * 3 / 4` overcounts by up to 2 bytes).
function decodedByteLength(base64: string): number {
  let padding = 0
  if (base64.endsWith('==')) padding = 2
  else if (base64.endsWith('=')) padding = 1
  return Math.floor((base64.length * 3) / 4) - padding
}

// A retry after a partial failure (the rpc committed — seal stored, content erased —
// but a later step such as deleteUser then failed, or the response never reached the
// browser) must never re-run the database step. For seal mode in particular, running it
// again would upsert an empty bundle (there's nothing left to collect) over the real
// stored seal. The profile row is deleted inside delete_member's own transaction, so its
// absence is exactly the signal that the database step already committed.
export function shouldRunDatabaseStep(profileExists: boolean): boolean {
  return profileExists
}

// The message shown when everything up through delete_member succeeded but a later step
// (avatar cleanup is safe to repeat; deleteUser is the one that can actually fail) did not.
// Which recovery code is "real" depends on whether THIS call ran the database step:
// - erase: no code involved either way, wording never changes.
// - seal, profile existed (this call just ran delete_member and stored the bundle): the code
//   shown on THIS attempt is the one that opens it.
// - seal, profile already gone (this call is itself a retry; delete_member found no row and
//   didn't touch sealed_bundles): the code shown on THIS attempt was never stored anywhere —
//   the FIRST attempt's code is the one that matters.
export function partialFailureMessage(mode: 'erase' | 'seal', profileExisted: boolean): string {
  if (mode === 'erase') {
    return 'Your writing is gone, but signing out failed. Please try again.'
  }
  if (profileExisted) {
    return 'Your writing is sealed, but signing out failed. Please try again — and keep the recovery code from this attempt.'
  }
  return 'Your writing was sealed on your first attempt, but signing out failed. Please try again — keep the recovery code from that first attempt.'
}

export function checkDeleteRequest(
  body: unknown,
  lastSignInAt: string | null | undefined,
  nowMs: number,
): string | null {
  const signedInAt = lastSignInAt ? Date.parse(lastSignInAt) : NaN
  if (!Number.isFinite(signedInAt) || nowMs - signedInAt > FRESH_SIGN_IN_MS) {
    return 'For your safety, sign in again, then delete your account within 10 minutes.'
  }
  const b = body as { mode?: unknown; bundle?: unknown } | null
  if (b?.mode === 'erase') return null
  if (b?.mode === 'seal') {
    if (typeof b.bundle !== 'string' || b.bundle.length === 0) return 'The sealed writing did not arrive. Nothing was deleted.'
    if (decodedByteLength(b.bundle) > MAX_BUNDLE_BYTES) return 'Your sealed writing is too large to store. Nothing was deleted.'
    return null
  }
  return 'Choose Erase everything or Seal my writing.'
}
