// Builds the "someone responded to your writing" email.
// Plain TypeScript with no Deno or npm imports, so vitest can test it
// (supabase/functions/_shared/*.test.ts).
//
// The email carries the notification's title (which names the member's own
// story or thread), a link to it, and a link that turns these emails off.
// The text of the critique or reply never reaches this function: moderation
// may hide it seconds after it posts, and an email cannot be taken back.
import { escapeHtml } from './security.ts'

export interface MemberEmailInput {
  title?: unknown
  href?: unknown
  off_token?: unknown
}

export interface MemberEmail {
  subject: string
  text: string
  html: string
  offUrl: string
}

const SITE = 'https://horrorwriter.org'
// A path on this site only: no scheme, no host, no query string.
const HREF_RE = /^\/[A-Za-z0-9\-._~\/]{0,298}(#[A-Za-z0-9\-._~]{1,60})?$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** One line, no control characters, at most 150 characters. */
function oneLine(value: unknown): string {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 150)
}

/**
 * Returns the email to send, or null when the row is not usable (no title, a
 * link that is not a path on this site, or no turn-off token: an email with no
 * way to stop it is never sent).
 */
export function buildMemberEmail(input: MemberEmailInput): MemberEmail | null {
  const title = oneLine(input?.title)
  const href = typeof input?.href === 'string' ? input.href : ''
  const token = typeof input?.off_token === 'string' ? input.off_token : ''
  if (!title || !HREF_RE.test(href) || href.startsWith('//') || !UUID_RE.test(token)) return null

  const readUrl = `${SITE}${href}`
  const offUrl = `${SITE}/email-off/?t=${token.toLowerCase()}`

  const text = [
    'Someone responded to your writing on Horror Writer.',
    '',
    title,
    `Read it: ${readUrl}`,
    '',
    '--',
    'You get this email because you have writing on horrorwriter.org.',
    `Turn these emails off: ${offUrl}`,
  ].join('\n')

  const html = [
    '<p>Someone responded to your writing on Horror Writer.</p>',
    `<p><strong>${escapeHtml(title)}</strong></p>`,
    `<p><a href="${escapeHtml(readUrl)}">Read it</a></p>`,
    '<hr>',
    '<p style="font-size:12px;color:#666">You get this email because you have writing on horrorwriter.org. ',
    `<a href="${escapeHtml(offUrl)}">Turn these emails off</a>.</p>`,
  ].join('')

  return { subject: title, text, html, offUrl }
}
