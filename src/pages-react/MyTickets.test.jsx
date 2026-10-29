import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react'
import { test, expect, vi, beforeEach, afterEach } from 'vitest'

// The page is its own island with its own query cache, so everything it knows comes
// from this "database" variable; markTicketSeen updates it the way the RPC does.
let authState
vi.mock('../components/AuthContext', () => ({
  AuthProvider: ({ children }) => children,
  useAuth: () => authState,
}))
vi.mock('../components/RequireAuth', () => ({ default: ({ children }) => children }))

const client = vi.hoisted(() => ({ supabase: {} }))
vi.mock('../supabaseClient', () => client)

let db = []
const fetchMyTickets = vi.fn(async () => db)
const markTicketSeen = vi.fn(async (id) => {
  db = db.map((t) => (t.id === id ? { ...t, member_seen_at: '2026-10-28T09:00:00Z' } : t))
})
const replyTicket = vi.fn(async () => 'msg-id')
// Real labels and status helpers; only the network calls are replaced.
vi.mock('../lib/tickets', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchMyTickets: (...a) => fetchMyTickets(...a),
  markTicketSeen: (...a) => markTicketSeen(...a),
  replyTicket: (...a) => replyTicket(...a),
}))

const MyTickets = (await import('./MyTickets')).default

const msg = (id, fromKeeper, body, at) => ({ id, from_keeper: fromKeeper, body, created_at: at })

const ticket = (over = {}) => ({
  id: 'tk1',
  topic: 'signing-in',
  subject: 'My passkey vanished',
  status: 'waiting',
  close_reason: null,
  member_seen_at: null,
  created_at: '2026-10-27T10:00:00Z',
  updated_at: '2026-10-27T10:00:00Z',
  messages: [msg('m1', false, 'I cannot sign in with my passkey.', '2026-10-27T10:00:00Z')],
  ...over,
})

const answered = (over = {}) =>
  ticket({
    status: 'answered',
    messages: [
      msg('m1', false, 'I cannot sign in with my passkey.', '2026-10-27T10:00:00Z'),
      msg('m2', true, 'Try the email link on the sign-in screen.', '2026-10-27T11:00:00Z'),
    ],
    ...over,
  })

const header = (name) => screen.getByRole('button', { name: new RegExp(name) })
const scrollIntoView = vi.fn()

beforeEach(() => {
  authState = { session: { user: { id: 'u1' } }, user: { id: 'u1' }, isLoading: false }
  client.supabase = {}
  db = []
  fetchMyTickets.mockClear()
  markTicketSeen.mockClear()
  replyTicket.mockClear().mockResolvedValue('msg-id')
  scrollIntoView.mockClear()
  Element.prototype.scrollIntoView = scrollIntoView
})
afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
})

test('asks only for the signed-in member\'s own tickets', async () => {
  db = [ticket()]
  render(<MyTickets />)
  await screen.findByText('My passkey vanished')
  expect(fetchMyTickets).toHaveBeenCalledWith('u1')
})

test('no tickets: says so and links to Help', async () => {
  render(<MyTickets />)
  expect(await screen.findByText('No tickets yet.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Help' })).toHaveAttribute('href', '/help/')
})

test('lists the tickets in the order they come, each with topic, subject and a status pill', async () => {
  db = [
    answered({ id: 'tk3', subject: 'Third thing', topic: 'rituals', member_seen_at: '2026-10-28T08:00:00Z' }),
    ticket({ id: 'tk2', subject: 'Second thing', topic: 'broken' }),
    ticket({ id: 'tk1', subject: 'First thing', status: 'closed', close_reason: 'resolved' }),
  ]
  render(<MyTickets />)
  await screen.findByText('Third thing')
  const rows = screen.getAllByRole('listitem')
  expect(rows).toHaveLength(3)
  expect(rows[0]).toHaveTextContent('Third thing')
  expect(rows[1]).toHaveTextContent('Second thing')
  expect(rows[2]).toHaveTextContent('First thing')
  expect(within(rows[0]).getByText('Rituals')).toBeInTheDocument()
  expect(within(rows[1]).getByText("Something's broken")).toBeInTheDocument()
})

test('Answered is ember; Waiting and Closed are ash', async () => {
  db = [
    answered({ id: 'a', subject: 'A', member_seen_at: '2026-10-28T08:00:00Z' }),
    ticket({ id: 'w', subject: 'W' }),
    ticket({ id: 'c', subject: 'C', status: 'closed', close_reason: 'resolved' }),
  ]
  render(<MyTickets />)
  const answeredPill = await screen.findByText('Answered')
  expect(answeredPill.className).toContain('text-[var(--color-ember)]')
  for (const word of ['Waiting', 'Closed']) {
    const pill = screen.getByText(word)
    expect(pill.className).toContain('text-[var(--color-ash)]')
    expect(pill.className).not.toContain('ember')
  }
  expect(document.body.innerHTML.toLowerCase()).not.toContain('#991b1b')
})

test('an answered ticket the member has not seen is expanded on load and marked seen once', async () => {
  db = [answered()]
  render(<MyTickets />)
  expect(await screen.findByText('Try the email link on the sign-in screen.')).toBeInTheDocument()
  expect(header('My passkey vanished')).toHaveAttribute('aria-expanded', 'true')
  await waitFor(() => expect(markTicketSeen).toHaveBeenCalledWith('tk1'))

  // Marking it seen refreshes the list; the ticket stays open and is not marked again.
  await waitFor(() => expect(fetchMyTickets).toHaveBeenCalledTimes(2))
  expect(screen.getByText('Try the email link on the sign-in screen.')).toBeInTheDocument()
  expect(header('My passkey vanished')).toHaveAttribute('aria-expanded', 'true')
  expect(markTicketSeen).toHaveBeenCalledTimes(1)
})

test('marks a ticket seen once even when the list refreshes before the server shows it', async () => {
  // The database still says unseen, but the list changed (new data, so a new render pass).
  markTicketSeen.mockImplementationOnce(async () => {
    db = db.map((t) => ({ ...t, updated_at: '2026-10-28T12:00:00Z' }))
  })
  db = [answered()]
  render(<MyTickets />)
  await waitFor(() => expect(fetchMyTickets).toHaveBeenCalledTimes(2))
  await new Promise((r) => setTimeout(r, 50))
  expect(markTicketSeen).toHaveBeenCalledTimes(1)
  expect(fetchMyTickets).toHaveBeenCalledTimes(2)
})

test('every unseen answered ticket is opened and marked, each once', async () => {
  db = [answered({ id: 'tk1', subject: 'One' }), answered({ id: 'tk2', subject: 'Two' }), ticket({ id: 'tk3', subject: 'Three' })]
  render(<MyTickets />)
  await waitFor(() => expect(markTicketSeen).toHaveBeenCalledTimes(2))
  expect(markTicketSeen).toHaveBeenCalledWith('tk1')
  expect(markTicketSeen).toHaveBeenCalledWith('tk2')
  expect(markTicketSeen).not.toHaveBeenCalledWith('tk3')
  expect(header('One')).toHaveAttribute('aria-expanded', 'true')
  expect(header('Two')).toHaveAttribute('aria-expanded', 'true')
  expect(header('Three')).toHaveAttribute('aria-expanded', 'false')
})

test('an answered ticket that was already seen, and a waiting one, start collapsed and mark nothing', async () => {
  db = [answered({ id: 'tk1', subject: 'Seen', member_seen_at: '2026-10-28T08:00:00Z' }), ticket({ id: 'tk2', subject: 'Waiting one' })]
  render(<MyTickets />)
  await screen.findByText('Seen')
  expect(header('Seen')).toHaveAttribute('aria-expanded', 'false')
  expect(header('Waiting one')).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByText('Try the email link on the sign-in screen.')).toBeNull()
  expect(markTicketSeen).not.toHaveBeenCalled()

  fireEvent.click(header('Seen'))
  expect(screen.getByText('Try the email link on the sign-in screen.')).toBeInTheDocument()
  expect(header('Seen')).toHaveAttribute('aria-expanded', 'true')
  fireEvent.click(header('Seen'))
  expect(screen.queryByText('Try the email link on the sign-in screen.')).toBeNull()
  expect(markTicketSeen).not.toHaveBeenCalled()
})

test('a failed mark-seen does not break the page', async () => {
  markTicketSeen.mockRejectedValueOnce(new Error('Network down'))
  db = [answered()]
  render(<MyTickets />)
  expect(await screen.findByText('Try the email link on the sign-in screen.')).toBeInTheDocument()
  await waitFor(() => expect(markTicketSeen).toHaveBeenCalledTimes(1))
  expect(screen.queryByRole('alert')).toBeNull()
})

test('/my-tickets/#<id> scrolls to that ticket and expands it, without marking it seen', async () => {
  window.history.replaceState(null, '', '/my-tickets/#tk2')
  db = [ticket({ id: 'tk1', subject: 'Other' }), ticket({ id: 'tk2', subject: 'Wanted' })]
  render(<MyTickets />)
  expect(await screen.findByText('I cannot sign in with my passkey.')).toBeInTheDocument()
  expect(header('Wanted')).toHaveAttribute('aria-expanded', 'true')
  expect(header('Other')).toHaveAttribute('aria-expanded', 'false')
  await waitFor(() => expect(scrollIntoView).toHaveBeenCalled())
  expect(scrollIntoView.mock.contexts[0]).toHaveAttribute('id', 'tk2')
  expect(markTicketSeen).not.toHaveBeenCalled()
})

test('a # that matches no ticket is ignored', async () => {
  window.history.replaceState(null, '', '/my-tickets/#nope')
  db = [ticket()]
  render(<MyTickets />)
  await screen.findByText('My passkey vanished')
  expect(header('My passkey vanished')).toHaveAttribute('aria-expanded', 'false')
  expect(scrollIntoView).not.toHaveBeenCalled()
})

test('shows the whole conversation: the member is You, the Keeper is The Keeper', async () => {
  db = [answered()]
  render(<MyTickets />)
  await screen.findByText('Try the email link on the sign-in screen.')
  expect(screen.getByText('I cannot sign in with my passkey.')).toBeInTheDocument()
  expect(screen.getAllByText('You')).toHaveLength(1)
  expect(screen.getAllByText('The Keeper')).toHaveLength(1)
})

test('message text is plain text that keeps its line breaks', async () => {
  db = [
    answered({
      messages: [
        msg('m1', false, '<b>bold?</b>\nsecond line', '2026-10-27T10:00:00Z'),
        msg('m2', true, '<img src=x onerror=alert(1)>', '2026-10-27T11:00:00Z'),
      ],
    }),
  ]
  render(<MyTickets />)
  const mine = await screen.findByText((_, el) => el?.tagName === 'P' && el.textContent === '<b>bold?</b>\nsecond line')
  expect(mine).toHaveClass('whitespace-pre-wrap')
  expect(mine.querySelector('b')).toBeNull()
  const keeper = screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === '<img src=x onerror=alert(1)>')
  expect(keeper).toHaveClass('whitespace-pre-wrap')
  expect(keeper.querySelector('img')).toBeNull()
})

test('a closed ticket says why it closed and has no reply box', async () => {
  db = [ticket({ status: 'closed', close_reason: 'inactive' })]
  render(<MyTickets />)
  await screen.findByText('My passkey vanished')
  fireEvent.click(header('My passkey vanished'))
  expect(screen.getByText('Closed — no reply for 14 days')).toBeInTheDocument()
  expect(screen.getByText('I cannot sign in with my passkey.')).toBeInTheDocument()
  expect(screen.queryByLabelText('Reply')).toBeNull()
  expect(screen.queryByRole('textbox')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Send' })).toBeNull()
})

test('a resolved ticket says it was resolved', async () => {
  db = [ticket({ status: 'closed', close_reason: 'resolved' })]
  render(<MyTickets />)
  await screen.findByText('My passkey vanished')
  fireEvent.click(header('My passkey vanished'))
  expect(screen.getByText('Closed — resolved')).toBeInTheDocument()
  expect(screen.queryByRole('textbox')).toBeNull()
})

test('an open ticket has a reply box limited to 2,000 characters', async () => {
  db = [ticket()]
  render(<MyTickets />)
  await screen.findByText('My passkey vanished')
  fireEvent.click(header('My passkey vanished'))
  const box = screen.getByLabelText('Reply')
  expect(box.tagName).toBe('TEXTAREA')
  expect(box).toHaveAttribute('maxlength', '2000')
  expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
})

test('sending a reply calls replyTicket(id, body), clears the box and refreshes the list', async () => {
  db = [ticket()]
  render(<MyTickets />)
  await screen.findByText('My passkey vanished')
  fireEvent.click(header('My passkey vanished'))

  const box = screen.getByLabelText('Reply')
  fireEvent.change(box, { target: { value: '  Thanks, the email link worked for me.  ' } })
  const send = screen.getByRole('button', { name: 'Send' })
  expect(send).not.toBeDisabled()
  fireEvent.click(send)

  await waitFor(() => expect(replyTicket).toHaveBeenCalledTimes(1))
  expect(replyTicket).toHaveBeenCalledWith('tk1', 'Thanks, the email link worked for me.')
  await waitFor(() => expect(fetchMyTickets).toHaveBeenCalledTimes(2))
  await waitFor(() => expect(screen.getByLabelText('Reply')).toHaveValue(''))
})

test('a refused reply shows the reason and keeps what was typed', async () => {
  replyTicket.mockRejectedValueOnce(new Error('Write between 20 and 2,000 characters.'))
  db = [ticket()]
  render(<MyTickets />)
  await screen.findByText('My passkey vanished')
  fireEvent.click(header('My passkey vanished'))
  fireEvent.change(screen.getByLabelText('Reply'), { target: { value: 'too short' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('Write between 20 and 2,000 characters.')
  expect(screen.getByLabelText('Reply')).toHaveValue('too short')
  expect(fetchMyTickets).toHaveBeenCalledTimes(1)
})

test('Send is locked while a reply is in flight, so it cannot go twice', async () => {
  let finish
  replyTicket.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  db = [ticket()]
  render(<MyTickets />)
  await screen.findByText('My passkey vanished')
  fireEvent.click(header('My passkey vanished'))
  fireEvent.change(screen.getByLabelText('Reply'), { target: { value: 'A long enough follow-up message.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))

  await waitFor(() => expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled())
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))
  expect(replyTicket).toHaveBeenCalledTimes(1)
  finish('msg-id')
  await waitFor(() => expect(screen.getByLabelText('Reply')).toHaveValue(''))
})

test('a failed load says why and can be retried', async () => {
  fetchMyTickets.mockRejectedValueOnce(new Error('Network down'))
  db = [ticket()]
  render(<MyTickets />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Network down')
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByText('My passkey vanished')).toBeInTheDocument()
})

test('does not ask for tickets before the member is known, or when supabase is missing', async () => {
  authState = { session: null, user: null, isLoading: true }
  const first = render(<MyTickets />)
  await new Promise((r) => setTimeout(r, 20))
  expect(fetchMyTickets).not.toHaveBeenCalled()
  first.unmount()

  authState = { session: { user: { id: 'u1' } }, user: { id: 'u1' }, isLoading: false }
  client.supabase = null
  render(<MyTickets />)
  await new Promise((r) => setTimeout(r, 20))
  expect(fetchMyTickets).not.toHaveBeenCalled()
})
