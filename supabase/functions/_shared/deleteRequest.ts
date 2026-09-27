// Pure checks for a delete-account request. No Deno or npm imports, so vitest can test it.
export const FRESH_SIGN_IN_MS = 10 * 60 * 1000
export const MAX_BUNDLE_BYTES = 5 * 1024 * 1024

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
    if (b.bundle.length * 3 / 4 > MAX_BUNDLE_BYTES) return 'Your sealed writing is too large to store. Nothing was deleted.'
    return null
  }
  return 'Choose Erase everything or Seal my writing.'
}
