import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { test, expect, vi, beforeEach, afterEach } from 'vitest'

let authState
vi.mock('./AuthContext', () => ({ useAuth: () => authState }))
// Each island is its own root and wraps itself in providers; those are not under test.
vi.mock('./Providers', () => ({ withProviders: (Component) => Component }))

const registerPasskey = vi.fn()
vi.mock('../lib/passkey', () => ({ registerPasskey: (...a) => registerPasskey(...a) }))

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

const PasskeyPrompt = (await import('./PasskeyPrompt')).default

const FLAG = 'hw:passkeyPrompt'
const TEXT = "Add a passkey so you won't need an email link next time."

const signedIn = { session: { user: { id: 'u1' } }, user: { id: 'u1' }, isLoading: false }
const signedOut = { session: null, user: null, isLoading: false }

beforeEach(() => {
  authState = signedIn
  localStorage.clear()
  registerPasskey.mockReset().mockResolvedValue(undefined)
  toast.success.mockClear()
  toast.error.mockClear()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.history.pushState({}, '', '/')
})

test('renders nothing on the server, even with the flag set (it reads the flag after mount)', () => {
  localStorage.setItem(FLAG, 'u1')
  expect(renderToString(<PasskeyPrompt />)).toBe('')
})

test('hidden without the flag', async () => {
  const { container } = render(<PasskeyPrompt />)
  await new Promise((r) => setTimeout(r, 20))
  expect(container).toBeEmptyDOMElement()
})

test('hidden when signed out, even with the flag', async () => {
  localStorage.setItem(FLAG, 'u1')
  authState = signedOut
  const { container } = render(<PasskeyPrompt />)
  await new Promise((r) => setTimeout(r, 20))
  expect(container).toBeEmptyDOMElement()
  // signed out is not a dismissal: the flag waits for the sign-in to land
  expect(localStorage.getItem(FLAG)).toBe('u1')
})

test('hidden while the sign-in is still being read, then shown once it resolves', async () => {
  localStorage.setItem(FLAG, 'u1')
  authState = { session: null, user: null, isLoading: true }
  const { container, rerender } = render(<PasskeyPrompt />)
  await new Promise((r) => setTimeout(r, 20))
  expect(container).toBeEmptyDOMElement()

  authState = signedIn
  rerender(<PasskeyPrompt />)
  expect(await screen.findByText(TEXT)).toBeInTheDocument()
})

test('shown with the flag and a session, with the exact words and two buttons', async () => {
  localStorage.setItem(FLAG, 'u1')
  render(<PasskeyPrompt />)
  expect(await screen.findByText(TEXT)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Add passkey' })).toBeEnabled()
  expect(screen.getByRole('button', { name: 'Not now' })).toBeEnabled()
  // no Claude-written extras: the sentence and the two buttons are the whole panel
  expect(screen.getByRole('region').textContent).toBe(`${TEXT}Add passkeyNot now`)
})

test('Not now clears the flag and hides the panel without registering anything', async () => {
  localStorage.setItem(FLAG, 'u1')
  render(<PasskeyPrompt />)
  fireEvent.click(await screen.findByRole('button', { name: 'Not now' }))

  expect(localStorage.getItem(FLAG)).toBeNull()
  expect(screen.queryByText(TEXT)).toBeNull()
  expect(registerPasskey).not.toHaveBeenCalled()
})

test('Add passkey registers one, clears the flag, says Passkey added, and hides the panel', async () => {
  localStorage.setItem(FLAG, 'u1')
  render(<PasskeyPrompt />)
  fireEvent.click(await screen.findByRole('button', { name: 'Add passkey' }))

  await waitFor(() => expect(registerPasskey).toHaveBeenCalledTimes(1))
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Passkey added'))
  expect(localStorage.getItem(FLAG)).toBeNull()
  await waitFor(() => expect(screen.queryByText(TEXT)).toBeNull())
})

test('the flag is cleared as soon as Add passkey is pressed, even if the device dialog is still open', async () => {
  localStorage.setItem(FLAG, 'u1')
  registerPasskey.mockImplementation(() => new Promise(() => {})) // never settles
  render(<PasskeyPrompt />)
  fireEvent.click(await screen.findByRole('button', { name: 'Add passkey' }))
  expect(localStorage.getItem(FLAG)).toBeNull()
  // and a second press cannot start a second registration
  expect(screen.getByRole('button', { name: 'Add passkey' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Add passkey' }))
  expect(registerPasskey).toHaveBeenCalledTimes(1)
})

test('a failed or cancelled registration says why, keeps the panel for another try, and does not nag next page', async () => {
  localStorage.setItem(FLAG, 'u1')
  registerPasskey.mockRejectedValueOnce(new Error('Passkey setup was cancelled or timed out.'))
  render(<PasskeyPrompt />)
  fireEvent.click(await screen.findByRole('button', { name: 'Add passkey' }))

  await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Passkey setup was cancelled or timed out.'))
  expect(toast.success).not.toHaveBeenCalled()
  expect(screen.getByText(TEXT)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Add passkey' })).toBeEnabled()
  expect(localStorage.getItem(FLAG)).toBeNull()
})

test('persists across page loads until a button is pressed', async () => {
  localStorage.setItem(FLAG, 'u1')
  const first = render(<PasskeyPrompt />)
  expect(await first.findByText(TEXT)).toBeInTheDocument()
  first.unmount()

  render(<PasskeyPrompt />)
  expect(await screen.findByText(TEXT)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Not now' }))
  cleanup()

  const { container } = render(<PasskeyPrompt />)
  await new Promise((r) => setTimeout(r, 20))
  expect(container).toBeEmptyDOMElement()
})

// R26: the flag names the account it was left for.
test('a flag left for another account is not shown, and is cleared', async () => {
  localStorage.setItem(FLAG, 'u2')
  const { container } = render(<PasskeyPrompt />)
  await waitFor(() => expect(localStorage.getItem(FLAG)).toBeNull())
  expect(container).toBeEmptyDOMElement()
})

test("a flag from before it named an account is treated as someone else's", async () => {
  localStorage.setItem(FLAG, '1')
  const { container } = render(<PasskeyPrompt />)
  await waitFor(() => expect(localStorage.getItem(FLAG)).toBeNull())
  expect(container).toBeEmptyDOMElement()
})

test('another member signing in on the same browser never sees it', async () => {
  localStorage.setItem(FLAG, 'u1')
  const { container, rerender } = render(<PasskeyPrompt />)
  expect(await screen.findByText(TEXT)).toBeInTheDocument()

  authState = signedOut
  rerender(<PasskeyPrompt />)
  await waitFor(() => expect(container).toBeEmptyDOMElement())
  expect(localStorage.getItem(FLAG)).toBe('u1')

  authState = { session: { user: { id: 'u2' } }, user: { id: 'u2' }, isLoading: false }
  rerender(<PasskeyPrompt />)
  await waitFor(() => expect(localStorage.getItem(FLAG)).toBeNull())
  expect(container).toBeEmptyDOMElement()
})

const ALREADY = 'This device already has a passkey for your account.'

test('a device that already has a passkey for the account says so, clears the flag and goes away', async () => {
  localStorage.setItem(FLAG, 'u1')
  registerPasskey.mockRejectedValueOnce(Object.assign(new Error('The authenticator was previously registered'), { name: 'InvalidStateError' }))
  render(<PasskeyPrompt />)
  fireEvent.click(await screen.findByRole('button', { name: 'Add passkey' }))

  await waitFor(() => expect(toast.success).toHaveBeenCalledWith(ALREADY))
  expect(toast.error).not.toHaveBeenCalled()
  expect(localStorage.getItem(FLAG)).toBeNull()
  await waitFor(() => expect(screen.queryByText(TEXT)).toBeNull())
})

test('the same, when registerPasskey has already turned InvalidStateError into its own sentence', async () => {
  localStorage.setItem(FLAG, 'u1')
  registerPasskey.mockRejectedValueOnce(new Error('This passkey is already registered on your account.'))
  render(<PasskeyPrompt />)
  fireEvent.click(await screen.findByRole('button', { name: 'Add passkey' }))

  await waitFor(() => expect(toast.success).toHaveBeenCalledWith(ALREADY))
  expect(toast.error).not.toHaveBeenCalled()
  expect(localStorage.getItem(FLAG)).toBeNull()
  await waitFor(() => expect(screen.queryByText(TEXT)).toBeNull())
})

test('stays out of the way on the sign-in callback page, which is about to redirect', async () => {
  localStorage.setItem(FLAG, 'u1')
  window.history.pushState({}, '', '/auth/callback/?via=email')
  const { container } = render(<PasskeyPrompt />)
  await new Promise((r) => setTimeout(r, 20))
  expect(container).toBeEmptyDOMElement()
  expect(localStorage.getItem(FLAG)).toBe('u1')
})

test('blocked storage means no prompt, not a crash', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('storage blocked')
  })
  const { container } = render(<PasskeyPrompt />)
  await new Promise((r) => setTimeout(r, 20))
  expect(container).toBeEmptyDOMElement()
})

test('a storage failure while clearing does not stop Not now from closing the panel', async () => {
  localStorage.setItem(FLAG, 'u1')
  render(<PasskeyPrompt />)
  await screen.findByText(TEXT)
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
    throw new Error('storage blocked')
  })
  fireEvent.click(screen.getByRole('button', { name: 'Not now' }))
  expect(screen.queryByText(TEXT)).toBeNull()
})
