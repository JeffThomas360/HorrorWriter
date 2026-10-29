// Builds the Pushover text for the Keeper's own alerts (tickets and signups).
// Plain TypeScript with no Deno or npm imports, so vitest can test it
// (supabase/functions/_shared/*.test.ts).
//
// The text is built here, from a closed set of kinds and topic slugs plus a
// validated @handle and a count. Ticket text, email addresses and anything
// else a member typed never reach this function, so none can reach a phone.

export interface KeeperAlertInput {
  kind?: unknown
  topic?: unknown
  handle?: unknown
  count?: unknown
}

export interface KeeperAlert {
  title: string
  message: string
  url: string
  url_title: string
}

const TOPIC_LABELS = new Map<string, string>([
  ['signing-in', 'Signing in'],
  ['my-writing', 'My writing'],
  ['rituals', 'Rituals'],
  ['another-member', 'Another member'],
  ['broken', "Something's broken"],
  ['other', 'Other'],
])

const HANDLE_RE = /^[a-z0-9._-]{1,40}$/

const QUEUE_URL = 'https://horrorwriter.org/admin/?tab=queue'
const USERS_URL = 'https://horrorwriter.org/admin/?tab=users'

/**
 * Returns the push to send, or null when the input is not one we recognise
 * (unknown kind, unknown topic, a surge with no usable count). An invalid
 * handle is not an error: it is left out and the message says "a member".
 */
export function buildKeeperAlert(input: KeeperAlertInput | null | undefined): KeeperAlert | null {
  if (!input || typeof input !== 'object') return null

  const handle = typeof input.handle === 'string' && HANDLE_RE.test(input.handle) ? input.handle : null

  let topicLabel: string | undefined
  if (input.topic !== undefined && input.topic !== null) {
    topicLabel = typeof input.topic === 'string' ? TOPIC_LABELS.get(input.topic) : undefined
    if (topicLabel === undefined) return null
  }

  switch (input.kind) {
    case 'ticket_new':
      if (topicLabel === undefined) return null
      return {
        title: 'New ticket',
        message: `${topicLabel} — ${handle ? `@${handle}` : 'a member'}`,
        url: QUEUE_URL,
        url_title: 'Open the queue',
      }
    case 'ticket_reply':
      return {
        title: 'Reply on ticket',
        message: handle ? `@${handle} replied` : 'A member replied',
        url: QUEUE_URL,
        url_title: 'Open the queue',
      }
    case 'signup':
      return {
        title: 'New member',
        message: handle ? `@${handle} joined` : 'A new member joined',
        url: USERS_URL,
        url_title: 'Open Users',
      }
    case 'signup_surge': {
      const n = input.count
      if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) return null
      return {
        title: 'Signup surge',
        message: `${n} new accounts in the last hour`,
        url: USERS_URL,
        url_title: 'Open Users',
      }
    }
    default:
      return null
  }
}
