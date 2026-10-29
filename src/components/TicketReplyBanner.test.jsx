import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { test, expect, vi, beforeEach, afterEach } from 'vitest'

// Each island is its own root with its own query cache, so the only thing that can
// make the banner appear is the database. These tests keep the "database" in one
// variable and give every mount a fresh cache (as every page load does).
let authState
vi.mock('./AuthContext', () => ({
  AuthProvider: ({ children }) => children,
  useAuth: () => authState,
}))

const client = vi.hoisted(() => ({ supabase: {} }))
vi.mock('../supabaseClient', () => client)

let unseen
const fetchUnseenAnswered = vi.fn(async () => unseen)
const markTicketSeen = vi.fn(async () => {})
vi.mock('../lib/tickets', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchUnseenAnswered: (...a) => fetchUnseenAnswered(...a),
  markTicketSeen: (...a) => markTicketSeen(...a),
}))

const TicketReplyBanner = (await import('./TicketReplyBanner')).default

const signedIn = { session: { user: { id: 'u1' } }, user: { id: 'u1' }, isLoading: false }
const signedOut = { session: null, user: null, isLoading: false }

beforeEach(() => {
  authState = signedIn
  client.supabase = {}
  unseen = { id: 'tk1', subject: 'My passkey vanished' }
  fetchUnseenAnswered.mockClear()
  markTicketSeen.mockClear()
})
afterEach(() => cleanup())

test('shows the Keeper answered strip with the subject, linking to that ticket', async () => {
  render(<TicketReplyBanner />)
  const strip = await screen.findByRole('status')
  expect(strip).toHaveTextContent('▸ The Keeper answered your ticket: My passkey vanished')
  expect(screen.getByRole('link')).toHaveAttribute('href', '/my-tickets/#tk1')
  expect(strip.className).toContain('border-[var(--color-ember)]')
})

test('asks only for the signed-in member\'s own tickets', async () => {
  render(<TicketReplyBanner />)
  await screen.findByRole('status')
  expect(fetchUnseenAnswered).toHaveBeenCalledWith('u1')
})

test('renders nothing, and asks nothing, when signed out', async () => {
  authState = signedOut
  const { container } = render(<TicketReplyBanner />)
  await new Promise((r) => setTimeout(r, 20))
  expect(container).toBeEmptyDOMElement()
  expect(fetchUnseenAnswered).not.toHaveBeenCalled()
})

test('renders nothing while the sign-in is still being read', async () => {
  authState = { session: null, user: null, isLoading: true }
  const { container } = render(<TicketReplyBanner />)
  await new Promise((r) => setTimeout(r, 20))
  expect(container).toBeEmptyDOMElement()
  expect(fetchUnseenAnswered).not.toHaveBeenCalled()
})

test('renders nothing while the answer is loading', async () => {
  let release
  fetchUnseenAnswered.mockImplementationOnce(() => new Promise((resolve) => { release = resolve }))
  const { container } = render(<TicketReplyBanner />)
  await waitFor(() => expect(fetchUnseenAnswered).toHaveBeenCalled())
  expect(container).toBeEmptyDOMElement()
  release({ id: 'tk1', subject: 'Late' })
  expect(await screen.findByRole('status')).toHaveTextContent('Late')
})

test('renders nothing when there is no unseen answer', async () => {
  unseen = null
  const { container } = render(<TicketReplyBanner />)
  await waitFor(() => expect(fetchUnseenAnswered).toHaveBeenCalled())
  await new Promise((r) => setTimeout(r, 20))
  expect(container).toBeEmptyDOMElement()
})

test('renders nothing, and asks nothing, when supabase is not configured', async () => {
  client.supabase = null
  const { container } = render(<TicketReplyBanner />)
  await new Promise((r) => setTimeout(r, 20))
  expect(container).toBeEmptyDOMElement()
  expect(fetchUnseenAnswered).not.toHaveBeenCalled()
})

test('renders nothing when the read fails', async () => {
  fetchUnseenAnswered.mockRejectedValueOnce(new Error('Network down'))
  const { container } = render(<TicketReplyBanner />)
  await waitFor(() => expect(fetchUnseenAnswered).toHaveBeenCalled())
  await new Promise((r) => setTimeout(r, 20))
  expect(container).toBeEmptyDOMElement()
})

// Review Focus 2: the strip must not depend on an event or a prop that a page load
// can miss. Nothing here is passed in or dispatched; a brand-new root over the same
// database state shows it again, every time, until the ticket is opened.
test('persists: a fresh mount over the same database state shows it again', async () => {
  const first = render(<TicketReplyBanner />)
  expect(await first.findByRole('status')).toHaveTextContent('My passkey vanished')
  first.unmount()
  expect(screen.queryByRole('status')).toBeNull()

  const second = render(<TicketReplyBanner />)
  expect(await second.findByRole('status')).toHaveTextContent('My passkey vanished')
  second.unmount()

  const third = render(<TicketReplyBanner />)
  expect(await third.findByRole('status')).toHaveTextContent('My passkey vanished')
  expect(fetchUnseenAnswered).toHaveBeenCalledTimes(3)
  // Showing the strip never counts as seeing the ticket.
  expect(markTicketSeen).not.toHaveBeenCalled()
})

test('once the ticket has been opened, a fresh mount shows nothing', async () => {
  const first = render(<TicketReplyBanner />)
  expect(await first.findByRole('status')).toBeInTheDocument()
  first.unmount()

  unseen = null // what the database says after mark_ticket_seen
  const { container } = render(<TicketReplyBanner />)
  await waitFor(() => expect(fetchUnseenAnswered).toHaveBeenCalledTimes(2))
  await new Promise((r) => setTimeout(r, 20))
  expect(container).toBeEmptyDOMElement()
})

test('the subject is text, never markup', async () => {
  unseen = { id: 'tk1', subject: '<img src=x onerror=alert(1)> hi' }
  render(<TicketReplyBanner />)
  const strip = await screen.findByRole('status')
  expect(strip).toHaveTextContent('<img src=x onerror=alert(1)> hi')
  expect(strip.querySelector('img')).toBeNull()
})
