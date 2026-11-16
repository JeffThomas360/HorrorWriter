import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { test, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({
  auth: { user: null, profile: null, isLoading: false },
  stored: null,
  passkeyOwner: null,
  recordArrival: vi.fn(),
  fetchArrivalPromptDue: vi.fn(),
  recordFoundVia: vi.fn(),
  settleArrival: vi.fn(),
}))

vi.mock('./AuthContext', () => ({ useAuth: () => h.auth }))
vi.mock('./Providers', () => ({ withProviders: (C) => C }))
vi.mock('../lib/arrivalApi', () => ({
  recordArrival: (...a) => h.recordArrival(...a),
  fetchArrivalPromptDue: (...a) => h.fetchArrivalPromptDue(...a),
  recordFoundVia: (...a) => h.recordFoundVia(...a),
}))
vi.mock('../lib/arrival', () => ({
  readArrival: () => h.stored,
  settleArrival: (...a) => h.settleArrival(...a),
}))
vi.mock('../lib/passkeyPrompt', () => ({ passkeyPromptFor: () => h.passkeyOwner }))

const ArrivalPrompt = (await import('./ArrivalPrompt')).default

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const ago = (ms) => new Date(Date.now() - ms).toISOString()
const signedIn = (createdAgo) => ({ user: { id: 'u1' }, profile: { id: 'u1', created_at: ago(createdAgo) }, isLoading: false })
const ARRIVAL = { tag: 'chatgpt.com', referrerHost: null, landingPath: '/', at: Date.now() - HOUR }

const card = () => screen.queryByRole('region', { name: 'What brought you here?' })
const settle = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  h.auth = { user: null, profile: null, isLoading: false }
  h.stored = null
  h.passkeyOwner = null
  h.recordArrival.mockReset().mockResolvedValue(true)
  h.fetchArrivalPromptDue.mockReset().mockResolvedValue(false)
  h.recordFoundVia.mockReset().mockResolvedValue(undefined)
  h.settleArrival.mockReset()
  window.history.pushState({}, '', '/')
})

afterEach(() => { cleanup(); window.history.pushState({}, '', '/') })

test('renders nothing signed out, and nothing is sent or asked', async () => {
  h.stored = ARRIVAL
  render(<ArrivalPrompt />)
  await settle()
  expect(card()).toBeNull()
  expect(h.recordArrival).not.toHaveBeenCalled()
  expect(h.fetchArrivalPromptDue).not.toHaveBeenCalled()
  // Signed out is not a reason to forget how they arrived: they may join yet.
  expect(h.settleArrival).not.toHaveBeenCalled()
})

test('renders nothing while the sign-in is still being read', async () => {
  h.auth = { ...signedIn(HOUR), isLoading: true }
  h.stored = ARRIVAL
  h.fetchArrivalPromptDue.mockResolvedValue(true)
  render(<ArrivalPrompt />)
  await settle()
  expect(card()).toBeNull()
  expect(h.recordArrival).not.toHaveBeenCalled()
})

test('stays out of the way on the sign-in callback page', async () => {
  window.history.pushState({}, '', '/auth/callback/')
  h.auth = signedIn(HOUR)
  h.stored = ARRIVAL
  h.fetchArrivalPromptDue.mockResolvedValue(true)
  render(<ArrivalPrompt />)
  await settle()
  expect(card()).toBeNull()
  expect(h.recordArrival).not.toHaveBeenCalled()
})

test("a new member's stored arrival is sent once and then settled", async () => {
  h.auth = signedIn(HOUR)
  h.stored = ARRIVAL
  const { rerender } = render(<ArrivalPrompt />)
  await waitFor(() => expect(h.settleArrival).toHaveBeenCalledTimes(1))
  expect(h.recordArrival).toHaveBeenCalledTimes(1)
  expect(h.recordArrival).toHaveBeenCalledWith(ARRIVAL)
  expect(h.recordArrival.mock.invocationCallOrder[0]).toBeLessThan(h.settleArrival.mock.invocationCallOrder[0])
  rerender(<ArrivalPrompt />)
  await settle()
  expect(h.recordArrival).toHaveBeenCalledTimes(1)
})

test('a send the server did not take leaves the record for another try', async () => {
  h.auth = signedIn(HOUR)
  h.stored = ARRIVAL
  h.recordArrival.mockResolvedValue(false)
  render(<ArrivalPrompt />)
  await waitFor(() => expect(h.recordArrival).toHaveBeenCalledTimes(1))
  await settle()
  expect(h.settleArrival).not.toHaveBeenCalled()
})

test("an older account's stored arrival is settled without being sent", async () => {
  h.auth = signedIn(3 * DAY)
  h.stored = ARRIVAL
  render(<ArrivalPrompt />)
  await waitFor(() => expect(h.settleArrival).toHaveBeenCalledTimes(1))
  expect(h.recordArrival).not.toHaveBeenCalled()
})

test('with no stored arrival nothing is sent or settled', async () => {
  h.auth = signedIn(HOUR)
  render(<ArrivalPrompt />)
  await settle()
  expect(h.recordArrival).not.toHaveBeenCalled()
  expect(h.settleArrival).not.toHaveBeenCalled()
})

test('a member of three days who is due is shown the card', async () => {
  h.auth = signedIn(3 * DAY)
  h.fetchArrivalPromptDue.mockResolvedValue(true)
  render(<ArrivalPrompt />)
  expect(await screen.findByRole('region', { name: 'What brought you here?' })).toBeInTheDocument()
  expect(screen.getByText('Optional. Only the Keeper sees your answer.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Skip' })).toBeInTheDocument()
})

test('a member of ten days is not asked, and the server is not consulted', async () => {
  h.auth = signedIn(10 * DAY)
  h.fetchArrivalPromptDue.mockResolvedValue(true)
  render(<ArrivalPrompt />)
  await settle()
  expect(card()).toBeNull()
  expect(h.fetchArrivalPromptDue).not.toHaveBeenCalled()
})

test('the card waits while the passkey prompt is waiting for this member', async () => {
  h.auth = signedIn(HOUR)
  h.passkeyOwner = 'u1'
  h.fetchArrivalPromptDue.mockResolvedValue(true)
  render(<ArrivalPrompt />)
  await settle()
  expect(card()).toBeNull()
  expect(h.fetchArrivalPromptDue).not.toHaveBeenCalled()
})

test("a passkey prompt left for someone else does not hold the card back", async () => {
  h.auth = signedIn(HOUR)
  h.passkeyOwner = 'someone-else'
  h.fetchArrivalPromptDue.mockResolvedValue(true)
  render(<ArrivalPrompt />)
  expect(await screen.findByRole('region', { name: 'What brought you here?' })).toBeInTheDocument()
})

test('not due means no card', async () => {
  h.auth = signedIn(HOUR)
  h.fetchArrivalPromptDue.mockResolvedValue(false)
  render(<ArrivalPrompt />)
  await waitFor(() => expect(h.fetchArrivalPromptDue).toHaveBeenCalledTimes(1))
  expect(card()).toBeNull()
})

async function showCard() {
  h.auth = signedIn(HOUR)
  h.fetchArrivalPromptDue.mockResolvedValue(true)
  render(<ArrivalPrompt />)
  await screen.findByRole('region', { name: 'What brought you here?' })
  return screen.getByLabelText('What brought you here?', { selector: 'input' })
}

test('Send saves the text and hides the card', async () => {
  const input = await showCard()
  fireEvent.change(input, { target: { value: 'a friend told me' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))
  await waitFor(() => expect(card()).toBeNull())
  expect(h.recordFoundVia).toHaveBeenCalledWith('a friend told me')
})

test('Skip saves an empty answer and hides the card', async () => {
  const input = await showCard()
  fireEvent.change(input, { target: { value: 'typed but skipped' } })
  fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
  await waitFor(() => expect(card()).toBeNull())
  expect(h.recordFoundVia).toHaveBeenCalledWith('')
})

test('Send with nothing typed is a skip', async () => {
  const input = await showCard()
  fireEvent.change(input, { target: { value: '   ' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))
  await waitFor(() => expect(card()).toBeNull())
  expect(h.recordFoundVia).toHaveBeenCalledWith('')
})

test('both buttons are disabled while the answer is being saved', async () => {
  const input = await showCard()
  let finish
  h.recordFoundVia.mockReturnValue(new Promise((r) => { finish = r }))
  fireEvent.change(input, { target: { value: 'x' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))
  expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Skip' })).toBeDisabled()
  finish()
  await waitFor(() => expect(card()).toBeNull())
})

test('a failed save keeps the card and says so; Skip then closes it', async () => {
  const input = await showCard()
  h.recordFoundVia.mockRejectedValue(new Error('denied'))
  fireEvent.change(input, { target: { value: 'x' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))
  expect(await screen.findByText("That didn't save. Try again, or skip.")).toBeInTheDocument()
  expect(card()).not.toBeNull()
  expect(screen.getByRole('button', { name: 'Send' })).not.toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
  await waitFor(() => expect(card()).toBeNull())
})

test('the answer box takes at most 200 characters', async () => {
  const input = await showCard()
  expect(input).toHaveAttribute('maxlength', '200')
})
