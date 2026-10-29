// Server-side check of a Cloudflare Turnstile token.
// Plain TypeScript with no Deno or npm imports, so vitest can test it
// (supabase/functions/_shared/*.test.ts).
//
// A token from the browser proves nothing until Cloudflare confirms it. This is
// that confirmation: the secret key never leaves the server, a token is good for
// one check, and a token minted for one form (its `action`) is refused on another.
// Any failure to confirm — a rejected token, a bad answer, a network error — is a no.

export const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export interface VerifyTurnstileInput {
  secret: string
  token: string
  /** The visitor's address (CF-Connecting-IP). Optional for Cloudflare; left out when absent. */
  ip?: string | null
  /** The action the widget was rendered with, e.g. 'open_ticket'. */
  expectedAction: string
  fetchFn?: (url: string, init: RequestInit) => Promise<Response>
}

export async function verifyTurnstile({
  secret,
  token,
  ip,
  expectedAction,
  fetchFn = fetch,
}: VerifyTurnstileInput): Promise<boolean> {
  if (!secret || typeof token !== 'string' || !token) return false

  const form = new URLSearchParams()
  form.set('secret', secret)
  form.set('response', token)
  if (ip) form.set('remoteip', ip)

  try {
    const res = await fetchFn(SITEVERIFY_URL, { method: 'POST', body: form })
    if (!res.ok) return false
    const result = await res.json()
    return result?.success === true && result?.action === expectedAction
  } catch {
    return false
  }
}
