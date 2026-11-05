// Server-side check of a Cloudflare Turnstile token.
// Plain TypeScript with no Deno or npm imports, so vitest can test it
// (supabase/functions/_shared/*.test.ts).
//
// A token from the browser proves nothing until Cloudflare confirms it. This is
// that confirmation: the secret key never leaves the server, a token is good for
// one check, and a token minted for one form (its `action`) is refused on another.
// Any failure to confirm — a rejected token, a bad answer, a network error — is a no.
//
// A no says why, as a list of codes: Cloudflare's own `error-codes` when it answered
// (e.g. `invalid-input-secret` for a wrong secret, which otherwise looks just like a
// bot), or one of ours for what happened before or around it. The codes go to the
// function's log (logTurnstileFailure); the token and the secret never do.

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

export interface TurnstileCheck {
  ok: boolean
  /** Why it is a no. Empty when ok. Never contains the token or the secret. */
  codes: string[]
}

const no = (...codes: string[]): TurnstileCheck => ({ ok: false, codes })

export async function checkTurnstile({
  secret,
  token,
  ip,
  expectedAction,
  fetchFn = fetch,
}: VerifyTurnstileInput): Promise<TurnstileCheck> {
  // Cloudflare's own names for these, so the log reads the same either way.
  if (!secret) return no('missing-input-secret')
  if (typeof token !== 'string' || !token) return no('missing-input-response')

  const form = new URLSearchParams()
  form.set('secret', secret)
  form.set('response', token)
  if (ip) form.set('remoteip', ip)

  let res: Response
  try {
    res = await fetchFn(SITEVERIFY_URL, { method: 'POST', body: form })
  } catch {
    return no('siteverify-unreachable')
  }
  if (!res.ok) return no(`siteverify-http-${res.status}`)

  let result: Record<string, unknown> | null
  try {
    result = await res.json()
  } catch {
    return no('siteverify-bad-response')
  }

  if (result?.success !== true) {
    const raw = result?.['error-codes']
    const codes = Array.isArray(raw) ? raw.filter((c): c is string => typeof c === 'string') : []
    return codes.length ? no(...codes) : no('no-error-codes')
  }
  if (result?.action !== expectedAction) return no('action-mismatch')
  return { ok: true, codes: [] }
}

/** The yes/no form, for callers that don't log why. */
export async function verifyTurnstile(input: VerifyTurnstileInput): Promise<boolean> {
  return (await checkTurnstile(input)).ok
}

/** One log line for a refusal: where, and the codes. Nothing else goes in. */
export function logTurnstileFailure(where: string, codes: string[]): void {
  console.error(`[${where}] Turnstile refused the token:`, codes)
}
