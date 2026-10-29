import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpc = vi.fn()
const invoke = vi.fn()

// A supabase-js query builder is chainable and thenable: every method returns
// the builder, and awaiting it yields the result. This mirrors that, so the
// tests don't care which method ends a query.
const chain = {}
let result = { data: [], error: null }
for (const m of ['select', 'eq', 'in', 'is', 'order', 'limit', 'maybeSingle']) chain[m] = vi.fn(() => chain)
chain.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject)
const from = vi.fn(() => chain)

vi.mock('../supabaseClient', () => ({
  supabase: {
    rpc: (...a) => rpc(...a),
    from: (...a) => from(...a),
    functions: { invoke: (...a) => invoke(...a) },
  },
}))

const api = await import('./tickets')

beforeEach(() => {
  rpc.mockReset()
  invoke.mockReset()
  from.mockClear()
  for (const m of ['select', 'eq', 'in', 'is', 'order', 'limit', 'maybeSingle']) chain[m].mockClear()
  result = { data: [], error: null }
})

describe('topics', () => {
  it('lists the six topics in order', () => {
    expect(api.TOPICS.map((t) => t.id)).toEqual(['signing-in', 'my-writing', 'rituals', 'another-member', 'broken', 'other'])
  })
  it('labels each topic', () => {
    expect(api.TOPICS.map((t) => t.label)).toEqual([
      'Signing in',
      'My writing',
      'Rituals',
      'Another member',
      "Something's broken",
      'Other',
    ])
    expect(api.topicLabel('broken')).toBe("Something's broken")
    expect(api.topicLabel('signing-in')).toBe('Signing in')
  })
})

describe('ticketErrorMessage', () => {
  const copy = {
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
  }
  for (const [key, sentence] of Object.entries(copy)) {
    it(`maps ${key} to its sentence`, () => {
      expect(api.ticketErrorMessage({ message: key })).toBe(sentence)
    })
  }
  it('never shows a raw key for the other server errors', () => {
    for (const key of ['not_signed_in', 'not_found', 'bad_topic', 'not_allowed', 'bad_reason']) {
      expect(api.ticketErrorMessage({ message: key })).not.toBe(key)
    }
  })
  it('passes an unknown message through', () => {
    expect(api.ticketErrorMessage({ message: 'odd' })).toBe('odd')
  })
  it('has a fallback when there is no error or message', () => {
    expect(api.ticketErrorMessage(null)).toBe('Something went wrong.')
    expect(api.ticketErrorMessage({})).toBe('Something went wrong.')
  })
})

describe('memberStatus', () => {
  it('names each status for the member', () => {
    expect(api.memberStatus({ status: 'waiting' })).toBe('Waiting')
    expect(api.memberStatus({ status: 'answered' })).toBe('Answered')
    expect(api.memberStatus({ status: 'closed' })).toBe('Closed')
  })
})

describe('closedLabel', () => {
  it('says why a ticket closed', () => {
    expect(api.closedLabel({ status: 'closed', close_reason: 'inactive' })).toBe('Closed — no reply for 14 days')
    expect(api.closedLabel({ status: 'closed', close_reason: 'resolved' })).toBe('Closed — resolved')
    expect(api.closedLabel({ status: 'closed', close_reason: 'dismissed' })).toBe('Closed')
  })
  it('is null for a ticket that is still open', () => {
    expect(api.closedLabel({ status: 'waiting', close_reason: null })).toBeNull()
    expect(api.closedLabel({ status: 'answered', close_reason: null })).toBeNull()
  })
})

describe('openTicket', () => {
  const input = { topic: 'broken', subject: 'Cannot sign in', body: 'x'.repeat(30), captchaToken: 'tok' }

  it('calls the open-ticket function and returns the new id', async () => {
    invoke.mockResolvedValue({ data: { id: 't1' }, error: null })
    expect(await api.openTicket(input)).toBe('t1')
    expect(invoke).toHaveBeenCalledWith('open-ticket', {
      body: { topic: 'broken', subject: 'Cannot sign in', body: 'x'.repeat(30), captchaToken: 'tok' },
    })
  })
  it('throws the friendly sentence for an error key in a non-2xx response', async () => {
    const context = new Response(JSON.stringify({ error: 'daily_limit' }), { status: 400 })
    invoke.mockResolvedValue({ data: null, error: { message: 'Edge Function returned a non-2xx status code', context } })
    await expect(api.openTicket(input)).rejects.toThrow("You've opened 3 tickets today. Try again tomorrow.")
  })
  it('maps captcha_failed from the function', async () => {
    const context = new Response(JSON.stringify({ error: 'captcha_failed' }), { status: 403 })
    invoke.mockResolvedValue({ data: null, error: { message: 'non-2xx', context } })
    await expect(api.openTicket(input)).rejects.toThrow("We couldn't confirm you're a person. Refresh the page and try again.")
  })
  it('also accepts an error key in the response data', async () => {
    invoke.mockResolvedValue({ data: { error: 'daily_limit' }, error: null })
    await expect(api.openTicket(input)).rejects.toThrow("You've opened 3 tickets today. Try again tomorrow.")
  })
  it('falls back to the error message when the response body is not JSON', async () => {
    const context = new Response('<html>bad gateway</html>', { status: 502 })
    invoke.mockResolvedValue({ data: null, error: { message: 'Edge Function returned a non-2xx status code', context } })
    await expect(api.openTicket(input)).rejects.toThrow('Edge Function returned a non-2xx status code')
  })
  it('falls back to the error message when there is no response to read', async () => {
    invoke.mockResolvedValue({ data: null, error: { message: 'Failed to send a request to the Edge Function' } })
    await expect(api.openTicket(input)).rejects.toThrow('Failed to send a request to the Edge Function')
  })
})

describe('member calls', () => {
  it('replyTicket calls reply_ticket and returns the message id', async () => {
    rpc.mockResolvedValue({ data: 'm1', error: null })
    expect(await api.replyTicket('t1', 'Thanks, that fixed it.')).toBe('m1')
    expect(rpc).toHaveBeenCalledWith('reply_ticket', { p_ticket: 't1', p_body: 'Thanks, that fixed it.' })
  })
  it('replyTicket turns a server error key into a sentence', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'closed' } })
    await expect(api.replyTicket('t1', 'hello')).rejects.toThrow('This ticket is closed.')
  })
  it('markTicketSeen calls mark_ticket_seen', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    expect(await api.markTicketSeen('t1')).toBeUndefined()
    expect(rpc).toHaveBeenCalledWith('mark_ticket_seen', { p_ticket: 't1' })
  })
})

describe('keeper calls', () => {
  it('keeperReplyTicket calls keeper_reply_ticket', async () => {
    rpc.mockResolvedValue({ data: 'm2', error: null })
    expect(await api.keeperReplyTicket('t1', 'Try again now.')).toBe('m2')
    expect(rpc).toHaveBeenCalledWith('keeper_reply_ticket', { p_ticket: 't1', p_body: 'Try again now.' })
  })
  it('keeperCloseTicket sends the reason and an optional note', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    await api.keeperCloseTicket('t1', 'resolved', 'All sorted.')
    expect(rpc).toHaveBeenCalledWith('keeper_close_ticket', { p_ticket: 't1', p_reason: 'resolved', p_note: 'All sorted.' })
  })
  it('keeperCloseTicket sends a null note when none is given', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    await api.keeperCloseTicket('t1', 'dismissed')
    expect(rpc).toHaveBeenCalledWith('keeper_close_ticket', { p_ticket: 't1', p_reason: 'dismissed', p_note: null })
  })
  it('keeperCloseTicket turns a server error key into a sentence', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'closed' } })
    await expect(api.keeperCloseTicket('t1', 'resolved')).rejects.toThrow('This ticket is closed.')
  })
})

describe('reads', () => {
  const row = (over = {}) => ({
    id: 't1',
    topic: 'broken',
    subject: 'Cannot sign in',
    status: 'answered',
    close_reason: null,
    member_seen_at: null,
    created_at: '2026-10-28T10:00:00+00:00',
    updated_at: '2026-10-28T12:00:00+00:00',
    ticket_messages: [],
    ...over,
  })

  it('has the cache key', () => {
    expect(api.TICKETS_KEY).toEqual(['tickets'])
  })

  describe('fetchMyTickets', () => {
    it('reads only the given member\'s tickets, with explicit columns and messages', async () => {
      result = { data: [row()], error: null }
      await api.fetchMyTickets('u1')
      expect(from).toHaveBeenCalledWith('tickets')
      expect(chain.eq).toHaveBeenCalledWith('user_id', 'u1')
      const cols = chain.select.mock.calls[0][0]
      expect(cols).not.toContain('*')
      expect(cols).toContain('ticket_messages(id, from_keeper, body, created_at)')
    })
    it('makes no query without a user id', async () => {
      expect(await api.fetchMyTickets(undefined)).toEqual([])
      expect(await api.fetchMyTickets(null)).toEqual([])
      expect(await api.fetchMyTickets('')).toEqual([])
      expect(from).not.toHaveBeenCalled()
    })
    it('returns tickets with messages sorted oldest first', async () => {
      result = {
        data: [
          row({
            ticket_messages: [
              { id: 'm2', from_keeper: true, body: 'Answer', created_at: '2026-10-28T11:00:00+00:00' },
              { id: 'm1', from_keeper: false, body: 'Question', created_at: '2026-10-28T10:00:00+00:00' },
              { id: 'm3', from_keeper: false, body: 'Thanks', created_at: '2026-10-28T12:00:00+00:00' },
            ],
          }),
        ],
        error: null,
      }
      const [ticket] = await api.fetchMyTickets('u1')
      expect(ticket.messages.map((m) => m.id)).toEqual(['m1', 'm2', 'm3'])
      expect(ticket.ticket_messages).toBeUndefined()
      expect(ticket).toMatchObject({ id: 't1', topic: 'broken', subject: 'Cannot sign in', status: 'answered' })
    })
    it('returns an empty list when there are none', async () => {
      result = { data: null, error: null }
      expect(await api.fetchMyTickets('u1')).toEqual([])
    })
    it('throws the error message when the read fails', async () => {
      result = { data: null, error: { message: 'boom' } }
      await expect(api.fetchMyTickets('u1')).rejects.toThrow('boom')
    })
  })

  describe('fetchUnseenAnswered', () => {
    // R21: a closing note is an answer too. keeper_close_ticket leaves member_seen_at
    // null after a note (and sets it without one), so "answered or closed, not seen yet"
    // is exactly the set of Keeper words the member hasn't read.
    it('looks for the given member\'s answered or closed tickets they have not seen', async () => {
      result = { data: [{ id: 't1', subject: 'Cannot sign in' }], error: null }
      expect(await api.fetchUnseenAnswered('u1')).toEqual({ id: 't1', subject: 'Cannot sign in' })
      expect(from).toHaveBeenCalledWith('tickets')
      expect(chain.eq).toHaveBeenCalledWith('user_id', 'u1')
      expect(chain.in).toHaveBeenCalledWith('status', ['answered', 'closed'])
      expect(chain.eq).not.toHaveBeenCalledWith('status', expect.anything())
      expect(chain.is).toHaveBeenCalledWith('member_seen_at', null)
    })
    it('makes no query without a user id', async () => {
      expect(await api.fetchUnseenAnswered(undefined)).toBeNull()
      expect(await api.fetchUnseenAnswered(null)).toBeNull()
      expect(from).not.toHaveBeenCalled()
    })
    it('is null when nothing is waiting to be seen', async () => {
      result = { data: [], error: null }
      expect(await api.fetchUnseenAnswered('u1')).toBeNull()
    })
    it('throws the error message when the read fails', async () => {
      result = { data: null, error: { message: 'boom' } }
      await expect(api.fetchUnseenAnswered('u1')).rejects.toThrow('boom')
    })
  })

  describe('fetchTicket', () => {
    it('reads one ticket by id with its messages, oldest first', async () => {
      result = {
        data: row({
          ticket_messages: [
            { id: 'm2', from_keeper: true, body: 'Answer', created_at: '2026-10-28T11:00:00+00:00' },
            { id: 'm1', from_keeper: false, body: 'Question', created_at: '2026-10-28T10:00:00+00:00' },
          ],
        }),
        error: null,
      }
      const ticket = await api.fetchTicket('t1')
      expect(from).toHaveBeenCalledWith('tickets')
      expect(chain.eq).toHaveBeenCalledWith('id', 't1')
      expect(chain.eq).not.toHaveBeenCalledWith('user_id', expect.anything())
      expect(ticket.messages.map((m) => m.id)).toEqual(['m1', 'm2'])
    })
    it('is null when the ticket is not found', async () => {
      result = { data: null, error: null }
      expect(await api.fetchTicket('nope')).toBeNull()
    })
    it('throws the error message when the read fails', async () => {
      result = { data: null, error: { message: 'boom' } }
      await expect(api.fetchTicket('t1')).rejects.toThrow('boom')
    })
  })
})
