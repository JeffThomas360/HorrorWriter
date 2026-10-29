import { render, screen, fireEvent, cleanup, within, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { test, expect, vi, beforeEach, afterEach } from 'vitest'
import { toast } from 'sonner'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

// Real topicLabel/TOPICS; only the network calls are replaced.
const tickets = {
  fetchTicket: vi.fn(),
  keeperReplyTicket: vi.fn(async () => 'msg-id'),
  keeperCloseTicket: vi.fn(async () => {}),
}
vi.mock('../../lib/tickets', async (importOriginal) => ({ ...(await importOriginal()), ...tickets }))

const keeperTaskApi = { resolveTask: vi.fn(async () => {}) }
vi.mock('../../lib/keeperTaskApi', () => keeperTaskApi)

const TicketCard = (await import('./TicketCard')).default

const message = (id, fromKeeper, body, at) => ({ id, from_keeper: fromKeeper, body, created_at: at })

const ticket = (over = {}) => ({
  id: 'tk1', topic: 'signing-in', subject: 'My passkey vanished', status: 'waiting', close_reason: null,
  messages: [
    message('m1', false, 'I cannot sign in with my passkey.', '2026-10-27T10:00:00Z'),
    message('m2', true, 'Try the email link on the sign-in screen.', '2026-10-27T11:00:00Z'),
    message('m3', false, 'That worked,\nbut now the prompt loops.', '2026-10-27T12:00:00Z'),
  ],
  ...over,
})

const task = (over = {}) => ({
  id: 'task1', type: 'ticket', target_type: 'ticket', target_id: 'tk1', status: 'open', priority: 0,
  snoozed_until: null, created_at: '2026-10-27T12:00:00Z',
  payload: { topic: 'signing-in', subject: 'My passkey vanished', handle: 'mara' }, ...over,
})

const onChanged = vi.fn()

function renderCard(t = task()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ul><TicketCard task={t} onChanged={onChanged} /></ul>
    </QueryClientProvider>,
  )
}

// The subject shows at once, from the task; the conversation and the buttons arrive with the ticket.
const loaded = () => screen.findByText(/that worked,/i)

beforeEach(() => {
  Object.values(tickets).forEach((f) => f.mockClear())
  keeperTaskApi.resolveTask.mockClear()
  onChanged.mockClear()
  toast.success.mockClear()
  toast.error.mockClear()
  tickets.fetchTicket.mockImplementation(async () => ticket())
})
afterEach(cleanup)

test('shows the subject, the topic label and the member\'s @handle', async () => {
  renderCard()
  expect(await screen.findByText('My passkey vanished')).toBeInTheDocument()
  expect(screen.getByText('Ticket')).toBeInTheDocument()
  expect(screen.getByText('Signing in — @mara')).toBeInTheDocument()
  expect(tickets.fetchTicket).toHaveBeenCalledWith('tk1')
})

test('the conversation starts on the latest message, with a toggle for the rest', async () => {
  renderCard()
  expect(await screen.findByText(/that worked,/i)).toBeInTheDocument()
  expect(screen.queryByText('I cannot sign in with my passkey.')).toBeNull()

  fireEvent.click(screen.getByRole('button', { name: 'Show conversation (3)' }))
  expect(screen.getByText('I cannot sign in with my passkey.')).toBeInTheDocument()
  expect(screen.getByText('Try the email link on the sign-in screen.')).toBeInTheDocument()
  // Member messages are labelled "Member", the Keeper's own "You".
  expect(screen.getAllByText('Member')).toHaveLength(2)
  expect(screen.getAllByText('You')).toHaveLength(1)

  fireEvent.click(screen.getByRole('button', { name: 'Hide conversation (3)' }))
  expect(screen.queryByText('I cannot sign in with my passkey.')).toBeNull()
})

test('a single-message ticket shows that message and no toggle', async () => {
  tickets.fetchTicket.mockImplementation(async () => ticket({
    messages: [message('m1', false, 'Only message.', '2026-10-27T10:00:00Z')],
  }))
  renderCard()
  expect(await screen.findByText('Only message.')).toBeInTheDocument()
  expect(screen.getByText('Member')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /conversation/i })).toBeNull()
})

test('message bodies are plain text that keeps its line breaks', async () => {
  tickets.fetchTicket.mockImplementation(async () => ticket({
    messages: [message('m1', false, '<b>bold?</b>\nsecond line', '2026-10-27T10:00:00Z')],
  }))
  renderCard()
  const body = await screen.findByText((_, el) => el?.tagName === 'P' && el.textContent === '<b>bold?</b>\nsecond line')
  expect(body).toHaveClass('whitespace-pre-wrap')
  expect(body.querySelector('b')).toBeNull()
})

test('a high-priority ticket gets the blood border and the badge', async () => {
  renderCard(task({ priority: 1 }))
  const card = await screen.findByRole('listitem')
  expect(card.className).toContain('border-[var(--color-blood)]')
  expect(within(card).getByText('High priority')).toBeInTheDocument()
})

test('Reply opens a box; sending calls keeperReplyTicket, then onChanged', async () => {
  renderCard()
  await loaded()
  expect(screen.queryByLabelText(/reply to the member/i)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Reply' }))

  const send = screen.getByRole('button', { name: 'Send reply' })
  expect(send).toBeDisabled()
  fireEvent.change(screen.getByLabelText(/reply to the member/i), { target: { value: 'Glad that helped.' } })
  expect(send).not.toBeDisabled()
  fireEvent.click(send)

  await waitFor(() => expect(tickets.keeperReplyTicket).toHaveBeenCalledWith('tk1', 'Glad that helped.'))
  await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1))
  expect(toast.success).toHaveBeenCalled()
  expect(tickets.keeperCloseTicket).not.toHaveBeenCalled()
})

test('Resolve opens an optional note, then closes the ticket as resolved', async () => {
  renderCard()
  await loaded()
  fireEvent.click(screen.getByRole('button', { name: 'Resolve' }))
  fireEvent.change(screen.getByLabelText(/closing note/i), { target: { value: 'Sorted now.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Resolve ticket' }))

  await waitFor(() => expect(tickets.keeperCloseTicket).toHaveBeenCalledWith('tk1', 'resolved', 'Sorted now.'))
  await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1))
})

test('Resolve with the note left empty passes null', async () => {
  renderCard()
  await loaded()
  fireEvent.click(screen.getByRole('button', { name: 'Resolve' }))
  fireEvent.change(screen.getByLabelText(/closing note/i), { target: { value: '   ' } })
  fireEvent.click(screen.getByRole('button', { name: 'Resolve ticket' }))

  await waitFor(() => expect(tickets.keeperCloseTicket).toHaveBeenCalledWith('tk1', 'resolved', null))
})

const CONFIRM = "Dismiss this ticket? The member won't be told."

// R24: Dismiss can't be undone and sits next to Reply, so it asks first, inline.
test('Dismiss asks first, inline, and sends nothing yet', async () => {
  renderCard()
  await loaded()
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))

  expect(screen.getByText(CONFIRM)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Yes, dismiss' })).toBeEnabled()
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled()
  await new Promise((r) => setTimeout(r, 20))
  expect(tickets.keeperCloseTicket).not.toHaveBeenCalled()
  expect(onChanged).not.toHaveBeenCalled()
})

test('Yes, dismiss closes the ticket as dismissed with no note', async () => {
  renderCard()
  await loaded()
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
  fireEvent.click(screen.getByRole('button', { name: 'Yes, dismiss' }))

  await waitFor(() => expect(tickets.keeperCloseTicket).toHaveBeenCalledWith('tk1', 'dismissed', null))
  expect(tickets.keeperCloseTicket).toHaveBeenCalledTimes(1)
  await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1))
})

test('Cancel takes the question away and dismisses nothing', async () => {
  renderCard()
  await loaded()
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

  expect(screen.queryByText(CONFIRM)).toBeNull()
  expect(screen.queryByRole('button', { name: 'Yes, dismiss' })).toBeNull()
  await new Promise((r) => setTimeout(r, 20))
  expect(tickets.keeperCloseTicket).not.toHaveBeenCalled()
  expect(keeperTaskApi.resolveTask).not.toHaveBeenCalled()
  expect(onChanged).not.toHaveBeenCalled()
})

test('asking to dismiss mid-reply keeps the draft for when the keeper comes back', async () => {
  renderCard()
  await loaded()
  fireEvent.click(screen.getByRole('button', { name: 'Reply' }))
  fireEvent.change(screen.getByLabelText(/reply to the member/i), { target: { value: 'Half a reply' } })
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
  expect(screen.getByText(CONFIRM)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

  fireEvent.click(screen.getByRole('button', { name: 'Reply' }))
  expect(screen.getByLabelText(/reply to the member/i)).toHaveValue('Half a reply')
  expect(tickets.keeperCloseTicket).not.toHaveBeenCalled()
})

test('replying to a ticket that has closed shows the error and refreshes the queue', async () => {
  tickets.keeperReplyTicket.mockRejectedValueOnce(new Error('This ticket is closed.'))
  renderCard()
  await loaded()
  fireEvent.click(screen.getByRole('button', { name: 'Reply' }))
  fireEvent.change(screen.getByLabelText(/reply to the member/i), { target: { value: 'Too late.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send reply' }))

  await waitFor(() => expect(toast.error).toHaveBeenCalledWith('This ticket is closed.'))
  await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1))
  expect(toast.success).not.toHaveBeenCalled()
})

test('the actions are locked while a send is in flight and after it lands', async () => {
  let finish
  tickets.keeperCloseTicket.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  renderCard()
  await loaded()
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
  fireEvent.click(screen.getByRole('button', { name: 'Yes, dismiss' }))

  await waitFor(() => expect(screen.getByRole('button', { name: 'Reply' })).toBeDisabled())
  expect(screen.getByRole('button', { name: 'Resolve' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Dismiss' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Yes, dismiss' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Yes, dismiss' }))
  finish()
  await waitFor(() => expect(onChanged).toHaveBeenCalled())
  // The card is about to leave the queue; a second click must not double-send.
  expect(screen.getByRole('button', { name: 'Dismiss' })).toBeDisabled()
  expect(tickets.keeperCloseTicket).toHaveBeenCalledTimes(1)
})

test('a ticket that no longer exists says so and offers to dismiss the task', async () => {
  tickets.fetchTicket.mockImplementation(async () => null)
  renderCard()
  expect(await screen.findByText('This ticket no longer exists.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Reply' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Resolve' })).toBeNull()

  // The task points at nothing, so there is no member to keep in mind: no question.
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
  expect(screen.queryByText(CONFIRM)).toBeNull()
  await waitFor(() => expect(keeperTaskApi.resolveTask).toHaveBeenCalledWith('task1', 'dismiss'))
  await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1))
  expect(tickets.keeperCloseTicket).not.toHaveBeenCalled()
})

test('a failed load says why and can be retried', async () => {
  tickets.fetchTicket.mockRejectedValueOnce(new Error('Network down'))
  renderCard()
  expect(await screen.findByText('Network down')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Reply' })).toBeNull()

  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByRole('button', { name: 'Reply' })).toBeInTheDocument()
  expect(tickets.fetchTicket).toHaveBeenCalledTimes(2)
})
