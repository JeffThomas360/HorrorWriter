import { supabase } from '../supabaseClient'

/**
 * Member tickets. Every guard (age, bans, limits, lengths) lives in the RPCs of
 * 20261028010000_tickets.sql; this file only shapes requests and turns their
 * error keys into plain sentences. Opening a ticket goes through the open-ticket
 * Edge Function (it verifies the Turnstile token); everything else is an RPC or
 * an RLS-guarded read.
 */

export const TICKETS_KEY = ['tickets']

export const TOPICS = [
  { id: 'signing-in', label: 'Signing in' },
  { id: 'my-writing', label: 'My writing' },
  { id: 'rituals', label: 'Rituals' },
  { id: 'another-member', label: 'Another member' },
  { id: 'broken', label: "Something's broken" },
  { id: 'other', label: 'Other' },
]

export function topicLabel(id) {
  return TOPICS.find((t) => t.id === id)?.label ?? id ?? ''
}

const MESSAGES = {
  daily_limit: "You've opened 3 tickets today. Try again tomorrow.",
  too_many_open: 'You have 3 open tickets. You can open another once one is closed.',
  too_new: 'New accounts can open a ticket after their first hour.',
  banned: 'Your account is suspended, so tickets are closed to you for now.',
  message_limit: "You've sent 10 messages today. Try again tomorrow.",
  duplicate: 'You already sent that message today.',
  bad_body: 'Write between 20 and 2,000 characters.',
  bad_subject: 'A subject needs 5 to 120 characters.',
  closed: 'This ticket is closed.',
  captcha_failed: "We couldn't confirm you're a person. Refresh the page and try again.",
  not_signed_in: 'Sign in to contact the Keeper.',
  not_found: 'That ticket no longer exists.',
  bad_topic: 'Pick a topic from the list.',
  not_allowed: 'Only keepers can do that.',
  bad_reason: "That isn't a way to close a ticket.",
}

export function ticketErrorMessage(error) {
  if (!error) return 'Something went wrong.'
  return MESSAGES[error.message] ?? error.message ?? 'Something went wrong.'
}

export function memberStatus(ticket) {
  if (ticket?.status === 'answered') return 'Answered'
  if (ticket?.status === 'closed') return 'Closed'
  return 'Waiting'
}

const CLOSED_LABELS = {
  inactive: 'Closed — no reply for 14 days',
  resolved: 'Closed — resolved',
  dismissed: 'Closed',
}

export function closedLabel(ticket) {
  return CLOSED_LABELS[ticket?.close_reason] ?? (ticket?.status === 'closed' ? 'Closed' : null)
}

function need() {
  if (!supabase) throw new Error('Supabase not configured')
  return supabase
}

async function call(fn, args) {
  const { data, error } = await need().rpc(fn, args)
  if (error) throw new Error(ticketErrorMessage(error))
  return data
}

// A non-2xx answer from the Edge Function arrives as FunctionsHttpError, whose
// `context` is the Response; the error key is in its JSON body. When there is
// no readable body (network drop, gateway page), fall back to the error's own
// message.
async function functionErrorKey(error) {
  try {
    const body = await error.context?.json()
    if (typeof body?.error === 'string') return body.error
  } catch {
    // not JSON: use the message below
  }
  return error.message
}

export async function openTicket({ topic, subject, body, captchaToken }) {
  const { data, error } = await need().functions.invoke('open-ticket', {
    body: { topic, subject, body, captchaToken },
  })
  if (error) throw new Error(ticketErrorMessage({ message: await functionErrorKey(error) }))
  if (data?.error) throw new Error(ticketErrorMessage({ message: data.error }))
  if (!data?.id) throw new Error(ticketErrorMessage(null))
  return data.id
}

export const replyTicket = (id, body) => call('reply_ticket', { p_ticket: id, p_body: body })

export const markTicketSeen = async (id) => {
  await call('mark_ticket_seen', { p_ticket: id })
}

export const keeperReplyTicket = (id, body) => call('keeper_reply_ticket', { p_ticket: id, p_body: body })

export const keeperCloseTicket = async (id, reason, note = null) => {
  await call('keeper_close_ticket', { p_ticket: id, p_reason: reason, p_note: note })
}

const TICKET_COLUMNS =
  'id, topic, subject, status, close_reason, member_seen_at, created_at, updated_at, ticket_messages(id, from_keeper, body, created_at)'

// The messages come back in the order the server sorts them; sorting again here
// is the guarantee. Array.sort is stable, so equal timestamps keep that order.
function shapeTicket(row) {
  const { ticket_messages: messages, ...ticket } = row
  return {
    ...ticket,
    messages: [...(messages ?? [])].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
  }
}

// The keeper's RLS lets them read every ticket, so a member's own list must be
// filtered by their id here: RLS alone would show a keeper everyone's tickets.
export async function fetchMyTickets(userId) {
  if (!userId) return []
  const { data, error } = await need()
    .from('tickets')
    .select(TICKET_COLUMNS)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: true, referencedTable: 'ticket_messages' })
  if (error) throw new Error(error.message)
  return (data ?? []).map(shapeTicket)
}

// The newest ticket with Keeper words this member has not opened yet: an answer, or a
// closing note (keeper_close_ticket leaves member_seen_at null after a note and sets it
// when there is none, so a plain close never shows up here).
export const UNSEEN_STATUSES = ['answered', 'closed']

export function isUnseen(ticket) {
  return UNSEEN_STATUSES.includes(ticket?.status) && !ticket?.member_seen_at
}

export async function fetchUnseenAnswered(userId) {
  if (!userId) return null
  const { data, error } = await need()
    .from('tickets')
    .select('id, subject')
    .eq('user_id', userId)
    .in('status', UNSEEN_STATUSES)
    .is('member_seen_at', null)
    .order('updated_at', { ascending: false })
    .limit(1)
  if (error) throw new Error(error.message)
  const row = data?.[0]
  return row ? { id: row.id, subject: row.subject } : null
}

// Not filtered by user: the keeper opens any ticket. RLS limits a member to
// their own, so someone else's id comes back null.
export async function fetchTicket(id) {
  const { data, error } = await need()
    .from('tickets')
    .select(TICKET_COLUMNS)
    .eq('id', id)
    .order('created_at', { ascending: true, referencedTable: 'ticket_messages' })
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? shapeTicket(data) : null
}
