import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { test, expect, vi, beforeEach, afterEach } from 'vitest'

let authState
vi.mock('./AuthContext', () => ({ useAuth: () => authState }))
const invoke = vi.fn()
const signOut = vi.fn()
vi.mock('../supabaseClient', () => ({ supabase: { functions: { invoke: (...a) => invoke(...a) }, auth: { signOut: () => signOut() } } }))

const DeleteAccount = (await import('./DeleteAccount')).default

beforeEach(() => {
  authState = { session: { user: { id: 'u1', last_sign_in_at: new Date().toISOString() } } }
  invoke.mockReset().mockResolvedValue({ data: { deleted: true }, error: null })
  signOut.mockReset().mockResolvedValue({})
})
afterEach(() => cleanup())

test('explains both choices side by side', () => {
  render(<DeleteAccount />)
  fireEvent.click(screen.getByRole('button', { name: /delete my account/i }))
  // Each option's name appears as a column header (and Erase also as a button).
  expect(screen.getAllByText(/erase everything/i).length).toBeGreaterThan(0)
  expect(screen.getAllByText(/seal my writing/i).length).toBeGreaterThan(0)
  expect(screen.getByText(/not by anyone/i)).toBeInTheDocument()
})

test('erase needs DELETE typed before it will run', async () => {
  render(<DeleteAccount />)
  fireEvent.click(screen.getByRole('button', { name: /delete my account/i }))
  fireEvent.click(screen.getByRole('button', { name: /^erase everything$/i }))
  const go = screen.getByRole('button', { name: /erase my account/i })
  expect(go).toBeDisabled()
  fireEvent.change(screen.getByLabelText(/type delete/i), { target: { value: 'DELETE' } })
  fireEvent.click(go)
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('delete-account', { body: { mode: 'erase' } }))
  await waitFor(() => expect(signOut).toHaveBeenCalled())
})

test('asks for a fresh sign-in when the last one is older than 10 minutes', () => {
  authState.session.user.last_sign_in_at = new Date(Date.now() - 11 * 60 * 1000).toISOString()
  render(<DeleteAccount />)
  fireEvent.click(screen.getByRole('button', { name: /delete my account/i }))
  expect(screen.getByText(/sign in again/i)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /^erase everything$/i })).toBeNull()
})

test('shows error and re-enables button if invoke rejects', async () => {
  invoke.mockRejectedValueOnce(new Error('network'))
  render(<DeleteAccount />)
  fireEvent.click(screen.getByRole('button', { name: /delete my account/i }))
  fireEvent.click(screen.getByRole('button', { name: /^erase everything$/i }))
  fireEvent.change(screen.getByLabelText(/type delete/i), { target: { value: 'DELETE' } })
  fireEvent.click(screen.getByRole('button', { name: /erase my account/i }))
  await waitFor(() => expect(screen.getByText(/nothing was deleted/i)).toBeInTheDocument())
  const button = screen.getByRole('button', { name: /erase my account/i })
  expect(button).not.toBeDisabled()
})

test('shows the server\'s own error message when the function returns one', async () => {
  const serverMessage = 'Your writing is gone, but signing out failed. Please try again.'
  invoke.mockResolvedValueOnce({
    data: null,
    error: { context: { json: async () => ({ error: serverMessage }) } },
  })
  render(<DeleteAccount />)
  fireEvent.click(screen.getByRole('button', { name: /delete my account/i }))
  fireEvent.click(screen.getByRole('button', { name: /^erase everything$/i }))
  fireEvent.change(screen.getByLabelText(/type delete/i), { target: { value: 'DELETE' } })
  fireEvent.click(screen.getByRole('button', { name: /erase my account/i }))
  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent(serverMessage)
})

vi.mock('../lib/seal', () => ({
  generateRecoveryCode: () => 'PALE-HOUND-ASHES-TALLOW-EMBER-MIRE-7Q4K',
  sealWriting: vi.fn(async () => new Uint8Array([1, 2, 3])),
}))
vi.mock('../lib/sealCollect', () => ({ collectWriting: vi.fn(async () => ({ v: 1, stories: [], series: [] })) }))

test('seal shows the code once and needs its last part typed back', async () => {
  render(<DeleteAccount />)
  fireEvent.click(screen.getByRole('button', { name: /delete my account/i }))
  fireEvent.click(screen.getByRole('button', { name: /^seal my writing$/i }))
  expect(screen.getByText('PALE-HOUND-ASHES-TALLOW-EMBER-MIRE-7Q4K')).toBeInTheDocument()
  expect(screen.getByText(/not by us, not by anyone/i)).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText(/last part of your code/i), { target: { value: '7q4k' } })
  fireEvent.change(screen.getByLabelText(/type delete/i), { target: { value: 'DELETE' } })
  fireEvent.click(screen.getByRole('button', { name: /seal and delete/i }))
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('delete-account', { body: { mode: 'seal', bundle: 'AQID' } }))
})

test('the recovery code is never sent to the server', async () => {
  render(<DeleteAccount />)
  fireEvent.click(screen.getByRole('button', { name: /delete my account/i }))
  fireEvent.click(screen.getByRole('button', { name: /^seal my writing$/i }))
  fireEvent.change(screen.getByLabelText(/last part of your code/i), { target: { value: '7Q4K' } })
  fireEvent.change(screen.getByLabelText(/type delete/i), { target: { value: 'DELETE' } })
  fireEvent.click(screen.getByRole('button', { name: /seal and delete/i }))
  await waitFor(() => expect(invoke).toHaveBeenCalled())
  expect(JSON.stringify(invoke.mock.calls)).not.toContain('PALE-HOUND')
})
