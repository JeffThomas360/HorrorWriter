// Helpers shared by the Edge Functions. Plain TypeScript with no Deno or npm
// imports, so vitest can test it (supabase/functions/_shared/*.test.ts).

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/** Escape user-supplied text before it goes into an email's HTML body. */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch])
}

/**
 * True when `header` is exactly `Bearer <expected>`. Compares in constant time
 * so the secret can't be recovered byte by byte from response timing. An empty
 * or missing `expected` never matches, so an unset secret fails closed.
 */
export function bearerMatches(header: string | null, expected: string | undefined): boolean {
  if (!header || !expected) return false
  if (!header.startsWith('Bearer ')) return false
  const enc = new TextEncoder()
  const a = enc.encode(header.slice('Bearer '.length))
  const b = enc.encode(expected)
  let diff = a.length ^ b.length
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i]
  return diff === 0
}
