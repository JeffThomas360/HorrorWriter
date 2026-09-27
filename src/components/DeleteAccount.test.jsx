import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { test, expect, vi, beforeEach, afterEach } from 'vitest'

let authState
vi.mock('./AuthContext', () => ({ useAuth: () => authState }))
const invoke = vi.fn()
const signOut = vi.fn()
vi.mock('../supabaseClient', () => ({ supabase: { functions: { invoke: (...a) => invoke(...a) }, auth: { signOut: () => signOut() } } }))

// The seal step lazily loads seal.js/sealCollect.js (the ~25 KB EFF wordlist
// chunk) through this indirection rather than a bare `import()` inline in
// the component, specifically so it's mockable per-test with the ordinary
// vi.fn() APIs below (mockResolvedValue / mockRejectedValueOnce) instead of
// racing real dynamic-import microtask timing.
vi.mock('../lib/sealLoader', () => ({ loadSealModules: vi.fn() }))

const DeleteAccountModule = await import('./DeleteAccount')
const DeleteAccount = DeleteAccountModule.default
const { loadSealModules } = await import('../lib/sealLoader')

const RECOVERY_CODE = 'PALE-HOUND-ASHES-TALLOW-EMBER-MIRE-7Q4K'
const sealWriting = vi.fn(async () => new Uint8Array([1, 2, 3]))
const collectWriting = vi.fn(async () => ({ v: 1, stories: [], series: [] }))
const sealApi = { generateRecoveryCode: () => RECOVERY_CODE, sealWriting, collectWriting }

beforeEach(() => {
  authState = { session: { user: { id: 'u1', last_sign_in_at: new Date().toISOString(), email_confirmed_at: new Date().toISOString() } } }
  invoke.mockReset().mockResolvedValue({ data: { deleted: true }, error: null })
  signOut.mockReset().mockResolvedValue({})
  loadSealModules.mockReset().mockResolvedValue(sealApi)
  sealApi.generateRecoveryCode = () => RECOVERY_CODE
  // The component's loaded-module cache is intentionally page-lifetime
  // (module-scoped), which would otherwise leak a resolved/rejected promise
  // from one test into the next.
  DeleteAccountModule.__resetSealApiCacheForTests()
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

test('seal shows the code once and needs its last part typed back', async () => {
  render(<DeleteAccount />)
  fireEvent.click(screen.getByRole('button', { name: /delete my account/i }))
  fireEvent.click(screen.getByRole('button', { name: /^seal my writing$/i }))
  // The module load is a real (mocked) promise now, so the code appears
  // asynchronously — findByText waits for it rather than asserting sync.
  expect(await screen.findByText(RECOVERY_CODE)).toBeInTheDocument()
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
  fireEvent.change(await screen.findByLabelText(/last part of your code/i), { target: { value: '7Q4K' } })
  fireEvent.change(screen.getByLabelText(/type delete/i), { target: { value: 'DELETE' } })
  fireEvent.click(screen.getByRole('button', { name: /seal and delete/i }))
  await waitFor(() => expect(invoke).toHaveBeenCalled())
  expect(JSON.stringify(invoke.mock.calls)).not.toContain('PALE-HOUND')
})

test('a failed module load shows the generic error and does not get stuck: clicking Seal again succeeds', async () => {
  // Only one rejection queued: entering the choose step fires the
  // fire-and-forget prefetch (loadSealApi's first call) and the immediately
  // following "Seal my writing" click reuses that same still-pending
  // promise rather than starting a second fetch — so this one rejection
  // covers both. loadSealApi() resets its cached promise to null on
  // failure, so the retry click below calls loadSealModules() again and
  // gets the default (resolved) mock from beforeEach.
  loadSealModules.mockRejectedValueOnce(new Error('chunk load failed'))
  render(<DeleteAccount />)
  fireEvent.click(screen.getByRole('button', { name: /delete my account/i }))
  fireEvent.click(screen.getByRole('button', { name: /^seal my writing$/i }))
  expect(await screen.findByText(/nothing was deleted/i)).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: /^seal my writing$/i }))
  expect(await screen.findByText(RECOVERY_CODE)).toBeInTheDocument()
})

test('going Back from the seal step and choosing Seal again keeps the same code', async () => {
  let calls = 0
  sealApi.generateRecoveryCode = vi.fn(() => (calls++ === 0 ? RECOVERY_CODE : 'DIFFERENT-CODE-0000'))
  render(<DeleteAccount />)
  fireEvent.click(screen.getByRole('button', { name: /delete my account/i }))
  fireEvent.click(screen.getByRole('button', { name: /^seal my writing$/i }))
  expect(await screen.findByText(RECOVERY_CODE)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /^back$/i }))
  fireEvent.click(screen.getByRole('button', { name: /^seal my writing$/i }))
  // A member who saved the first code must still see it — not a freshly generated one.
  expect(await screen.findByText(RECOVERY_CODE)).toBeInTheDocument()
  expect(screen.queryByText('DIFFERENT-CODE-0000')).toBeNull()
})

test('members without a confirmed email see Seal disabled with an explanation', () => {
  authState.session.user.email_confirmed_at = null
  render(<DeleteAccount />)
  fireEvent.click(screen.getByRole('button', { name: /delete my account/i }))
  const sealButton = screen.getByRole('button', { name: /^seal my writing$/i })
  expect(sealButton).toBeDisabled()
  expect(screen.getByText(/confirmed email address/i)).toBeInTheDocument()
  // Erase is still available.
  expect(screen.getByRole('button', { name: /^erase everything$/i })).not.toBeDisabled()
})

test('members with a confirmed email can still seal', () => {
  authState.session.user.email_confirmed_at = new Date().toISOString()
  render(<DeleteAccount />)
  fireEvent.click(screen.getByRole('button', { name: /delete my account/i }))
  expect(screen.getByRole('button', { name: /^seal my writing$/i })).not.toBeDisabled()
})

test('an oversized sealed bundle is rejected in the browser before uploading', async () => {
  sealWriting.mockResolvedValueOnce(new Uint8Array(5 * 1024 * 1024 + 1))
  render(<DeleteAccount />)
  fireEvent.click(screen.getByRole('button', { name: /delete my account/i }))
  fireEvent.click(screen.getByRole('button', { name: /^seal my writing$/i }))
  fireEvent.change(await screen.findByLabelText(/last part of your code/i), { target: { value: '7Q4K' } })
  fireEvent.change(screen.getByLabelText(/type delete/i), { target: { value: 'DELETE' } })
  fireEvent.click(screen.getByRole('button', { name: /seal and delete/i }))
  expect(await screen.findByText(/too large to seal/i)).toBeInTheDocument()
  expect(invoke).not.toHaveBeenCalled()
})

test('a signOut failure after a successful erase still redirects home', async () => {
  signOut.mockRejectedValueOnce(new Error('signout failed'))
  delete window.location
  window.location = { href: '' }
  render(<DeleteAccount />)
  fireEvent.click(screen.getByRole('button', { name: /delete my account/i }))
  fireEvent.click(screen.getByRole('button', { name: /^erase everything$/i }))
  fireEvent.change(screen.getByLabelText(/type delete/i), { target: { value: 'DELETE' } })
  fireEvent.click(screen.getByRole('button', { name: /erase my account/i }))
  await waitFor(() => expect(window.location.href).toBe('/'))
  expect(screen.queryByText(/nothing was deleted/i)).toBeNull()
})

test('a signOut failure after a successful seal still redirects home', async () => {
  signOut.mockRejectedValueOnce(new Error('signout failed'))
  delete window.location
  window.location = { href: '' }
  render(<DeleteAccount />)
  fireEvent.click(screen.getByRole('button', { name: /delete my account/i }))
  fireEvent.click(screen.getByRole('button', { name: /^seal my writing$/i }))
  fireEvent.change(await screen.findByLabelText(/last part of your code/i), { target: { value: '7Q4K' } })
  fireEvent.change(screen.getByLabelText(/type delete/i), { target: { value: 'DELETE' } })
  fireEvent.click(screen.getByRole('button', { name: /seal and delete/i }))
  await waitFor(() => expect(window.location.href).toBe('/'))
  expect(screen.queryByText(/nothing was deleted/i)).toBeNull()
})

test('a wrong last part of the code keeps Seal and delete disabled', async () => {
  render(<DeleteAccount />)
  fireEvent.click(screen.getByRole('button', { name: /delete my account/i }))
  fireEvent.click(screen.getByRole('button', { name: /^seal my writing$/i }))
  await screen.findByText(RECOVERY_CODE)
  fireEvent.change(screen.getByLabelText(/last part of your code/i), { target: { value: 'ZZZZ' } })
  fireEvent.change(screen.getByLabelText(/type delete/i), { target: { value: 'DELETE' } })
  expect(screen.getByRole('button', { name: /seal and delete/i })).toBeDisabled()
})
