// One relying-party rule for all four passkey functions. Plain TypeScript (no
// Deno/npm imports) so vitest can test it.
//
// The RP ID is fixed: a passkey made on horrorwriter.org is bound to it, and a
// browser will only use it on that domain or a subdomain. The old code took the
// RP ID from the request's Origin header and also trusted *.horrorwriter.pages.dev,
// localhost and 127.0.0.1 by default; the Pages project is gone, and a host we
// no longer control must never be one the backend trusts.

export const DEFAULT_RP_ID = 'horrorwriter.org'
export const PROD_ORIGINS = ['https://horrorwriter.org', 'https://www.horrorwriter.org']

/**
 * rpId: WEBAUTHN_RP_ID (set only for local dev, e.g. "localhost").
 * extraOrigins: WEBAUTHN_ORIGIN, comma-separated exact origins (local dev only).
 */
export function webauthnConfig(env: { rpId?: string | null; extraOrigins?: string | null } = {}) {
  const rpID = (env.rpId ?? '').trim() || DEFAULT_RP_ID
  const origins = [...PROD_ORIGINS]
  for (const raw of (env.extraOrigins ?? '').split(',')) {
    const t = raw.trim().replace(/\/$/, '')
    if (!t) continue
    try {
      const u = new URL(t)
      // Exact origins only: no paths, no wildcards.
      if (u.origin === t && !t.includes('*') && !origins.includes(u.origin)) origins.push(u.origin)
    } catch {
      // ignore malformed entries
    }
  }
  return { rpID, origins }
}
