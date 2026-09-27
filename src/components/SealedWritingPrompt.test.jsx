import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { test, expect, vi, beforeEach, afterEach } from 'vitest'

let authState
vi.mock('./AuthContext', () => ({ useAuth: () => authState }))
const invoke = vi.fn()
vi.mock('../supabaseClient', () => ({ supabase: { functions: { invoke: (...a) => invoke(...a) } } }))

// Mirrors DeleteAccount.test.jsx: seal.js/sealCollect.js are only ever loaded
// lazily through this indirection (never imported statically by the
// component), so they're mockable per-test with ordinary vi.fn() APIs.
vi.mock('../lib/sealLoader', () => ({ loadSealModules: vi.fn() }))

const SealedWritingPromptModule = await import('./SealedWritingPrompt')
const SealedWritingPrompt = SealedWritingPromptModule.default
const { loadSealModules } = await import('../lib/sealLoader')

const unsealWriting = vi.fn()
const restoreWriting = vi.fn()
const restoreIdentity = vi.fn()
const sealApi = { unsealWriting, restoreWriting, restoreIdentity }

const SEALED_AT = '2026-10-01T00:00:00+00:00'

beforeEach(() => {
  authState = { session: { user: { id: 'u2' } }, profile: { handle: 'currenthandle' }, refreshProfile: vi.fn().mockResolvedValue(null) }
  invoke.mockReset()
  unsealWriting.mockReset()
  restoreWriting.mockReset().mockResolvedValue({ stories: 2, series: 1, skipped: 0 })
  restoreIdentity.mockReset().mockResolvedValue({ handle: 'none', displayName: 'none' })
  loadSealModules.mockReset().mockResolvedValue(sealApi)
})
afterEach(() => cleanup())

test('shows nothing when no seal is waiting', async () => {
  invoke.mockResolvedValue({ data: { waiting: false }, error: null })
  const { container } = render(<SealedWritingPrompt />)
  await waitFor(() => expect(invoke).toHaveBeenCalled())
  expect(container).toBeEmptyDOMElement()
})

test('restores everything live, removes the seal, and shows a welcome message', async () => {
  invoke.mockImplementation(async (name, opts) => opts?.method === 'DELETE'
    ? { data: { removed: true }, error: null }
    : { data: { waiting: true, bundle: 'AQID', sealed_at: SEALED_AT }, error: null })
  unsealWriting.mockResolvedValue({ v: 2, stories: [], series: [], identity: { handle: null, display_name: null } })
  render(<SealedWritingPrompt />)
  fireEvent.change(await screen.findByLabelText(/recovery code/i), { target: { value: 'pale-hound' } })
  fireEvent.click(screen.getByRole('button', { name: /unseal/i }))
  await waitFor(() => expect(restoreWriting).toHaveBeenCalled())
  expect(restoreIdentity).toHaveBeenCalled()
  await waitFor(() =>
    expect(invoke).toHaveBeenCalledWith(`sealed-writing?sealed_at=${encodeURIComponent(SEALED_AT)}`, { method: 'DELETE' }),
  )
  expect(await screen.findByText(/2 stories and 1 series are back, live/i)).toBeInTheDocument()
})

test('a wrong code restores nothing and keeps the seal', async () => {
  invoke.mockResolvedValue({ data: { waiting: true, bundle: 'AQID', sealed_at: SEALED_AT }, error: null })
  unsealWriting.mockRejectedValue(new Error('wrong-code'))
  render(<SealedWritingPrompt />)
  fireEvent.change(await screen.findByLabelText(/recovery code/i), { target: { value: 'nope' } })
  fireEvent.click(screen.getByRole('button', { name: /unseal/i }))
  expect(await screen.findByText(/doesn.t open this seal/i)).toBeInTheDocument()
  expect(restoreWriting).not.toHaveBeenCalled()
  expect(invoke).not.toHaveBeenCalledWith(expect.stringContaining('sealed-writing?sealed_at'), expect.anything())
})

test('a damaged bundle tells the member not to delete anything', async () => {
  invoke.mockResolvedValue({ data: { waiting: true, bundle: 'AQID', sealed_at: SEALED_AT }, error: null })
  unsealWriting.mockRejectedValue(new Error('corrupt-bundle'))
  render(<SealedWritingPrompt />)
  fireEvent.change(await screen.findByLabelText(/recovery code/i), { target: { value: 'pale-hound' } })
  fireEvent.click(screen.getByRole('button', { name: /unseal/i }))
  expect(await screen.findByText(/seal looks damaged/i)).toBeInTheDocument()
  expect(restoreWriting).not.toHaveBeenCalled()
})

test('a rate-limited restore keeps the seal and asks the member to retry later', async () => {
  invoke.mockResolvedValue({ data: { waiting: true, bundle: 'AQID', sealed_at: SEALED_AT }, error: null })
  unsealWriting.mockResolvedValue({ v: 2, stories: [], series: [] })
  restoreWriting.mockRejectedValue(new Error('Rate limit exceeded: too many inserts'))
  render(<SealedWritingPrompt />)
  fireEvent.change(await screen.findByLabelText(/recovery code/i), { target: { value: 'pale-hound' } })
  fireEvent.click(screen.getByRole('button', { name: /unseal/i }))
  expect(await screen.findByText(/try again in an hour/i)).toBeInTheDocument()
  expect(invoke).not.toHaveBeenCalledWith(expect.stringContaining('sealed-writing?sealed_at'), expect.anything())
})

test('a non-rate-limit restore failure keeps the seal', async () => {
  invoke.mockResolvedValue({ data: { waiting: true, bundle: 'AQID', sealed_at: SEALED_AT }, error: null })
  unsealWriting.mockResolvedValue({ v: 2, stories: [], series: [] })
  restoreWriting.mockRejectedValue(new Error('boom'))
  render(<SealedWritingPrompt />)
  fireEvent.change(await screen.findByLabelText(/recovery code/i), { target: { value: 'pale-hound' } })
  fireEvent.click(screen.getByRole('button', { name: /unseal/i }))
  expect(await screen.findByText(/restoring failed/i)).toBeInTheDocument()
  expect(invoke).not.toHaveBeenCalledWith(expect.stringContaining('sealed-writing?sealed_at'), expect.anything())
})

test('mentions it when the old handle is taken', async () => {
  invoke.mockImplementation(async (name, opts) => opts?.method === 'DELETE'
    ? { data: { removed: true }, error: null }
    : { data: { waiting: true, bundle: 'AQID', sealed_at: SEALED_AT }, error: null })
  unsealWriting.mockResolvedValue({ v: 2, stories: [], series: [], identity: { handle: 'oldhandle', display_name: null } })
  restoreIdentity.mockResolvedValue({ handle: 'taken', displayName: 'none' })
  render(<SealedWritingPrompt />)
  fireEvent.change(await screen.findByLabelText(/recovery code/i), { target: { value: 'pale-hound' } })
  fireEvent.click(screen.getByRole('button', { name: /unseal/i }))
  expect(await screen.findByText(/@oldhandle.*taken.*@currenthandle/i)).toBeInTheDocument()
})

test('a DELETE that fails twice still shows success, with a note that the seal is still there', async () => {
  invoke.mockImplementation(async (name, opts) => opts?.method === 'DELETE'
    ? { data: null, error: { message: 'boom' } }
    : { data: { waiting: true, bundle: 'AQID', sealed_at: SEALED_AT }, error: null })
  unsealWriting.mockResolvedValue({ v: 2, stories: [], series: [] })
  render(<SealedWritingPrompt />)
  fireEvent.change(await screen.findByLabelText(/recovery code/i), { target: { value: 'pale-hound' } })
  fireEvent.click(screen.getByRole('button', { name: /unseal/i }))
  expect(await screen.findByText(/2 stories and 1 series are back, live/i)).toBeInTheDocument()
  expect(screen.getByText(/couldn.t be cleared/i)).toBeInTheDocument()
  const deleteCalls = invoke.mock.calls.filter(([, opts]) => opts?.method === 'DELETE')
  expect(deleteCalls.length).toBe(2)
})

test('a retry against an already-restored seal skips restoreIdentity and clears the old seal', async () => {
  invoke.mockImplementation(async (name, opts) => opts?.method === 'DELETE'
    ? { data: { removed: true }, error: null }
    : { data: { waiting: true, bundle: 'AQID', sealed_at: SEALED_AT }, error: null })
  unsealWriting.mockResolvedValue({ v: 2, stories: [], series: [], identity: { handle: 'oldhandle', display_name: null } })
  restoreWriting.mockResolvedValue({ stories: 0, series: 0, skipped: 2 })
  render(<SealedWritingPrompt />)
  fireEvent.change(await screen.findByLabelText(/recovery code/i), { target: { value: 'pale-hound' } })
  fireEvent.click(screen.getByRole('button', { name: /unseal/i }))
  expect(await screen.findByText(/already back/i)).toBeInTheDocument()
  expect(screen.getByText(/old seal has been cleared/i)).toBeInTheDocument()
  expect(restoreIdentity).not.toHaveBeenCalled()
  await waitFor(() =>
    expect(invoke).toHaveBeenCalledWith(`sealed-writing?sealed_at=${encodeURIComponent(SEALED_AT)}`, { method: 'DELETE' }),
  )
})

test('notes how many stories/series were already there alongside newly restored ones', async () => {
  invoke.mockImplementation(async (name, opts) => opts?.method === 'DELETE'
    ? { data: { removed: true }, error: null }
    : { data: { waiting: true, bundle: 'AQID', sealed_at: SEALED_AT }, error: null })
  unsealWriting.mockResolvedValue({ v: 2, stories: [], series: [] })
  restoreWriting.mockResolvedValue({ stories: 1, series: 1, skipped: 1 })
  render(<SealedWritingPrompt />)
  fireEvent.change(await screen.findByLabelText(/recovery code/i), { target: { value: 'pale-hound' } })
  fireEvent.click(screen.getByRole('button', { name: /unseal/i }))
  expect(await screen.findByText(/1 was already here/i)).toBeInTheDocument()
})

test('uses singular story/series counts', async () => {
  invoke.mockImplementation(async (name, opts) => opts?.method === 'DELETE'
    ? { data: { removed: true }, error: null }
    : { data: { waiting: true, bundle: 'AQID', sealed_at: SEALED_AT }, error: null })
  unsealWriting.mockResolvedValue({ v: 2, stories: [], series: [] })
  restoreWriting.mockResolvedValue({ stories: 1, series: 0, skipped: 0 })
  render(<SealedWritingPrompt />)
  fireEvent.change(await screen.findByLabelText(/recovery code/i), { target: { value: 'pale-hound' } })
  fireEvent.click(screen.getByRole('button', { name: /unseal/i }))
  expect(await screen.findByText(/1 story and 0 series are back, live/i)).toBeInTheDocument()
})

test('a malformed bundle (bad base64) is reported as damaged, not a wrong code', async () => {
  invoke.mockResolvedValue({ data: { waiting: true, bundle: '!!!not-base64!!!', sealed_at: SEALED_AT }, error: null })
  render(<SealedWritingPrompt />)
  fireEvent.change(await screen.findByLabelText(/recovery code/i), { target: { value: 'pale-hound' } })
  fireEvent.click(screen.getByRole('button', { name: /unseal/i }))
  expect(await screen.findByText(/seal looks damaged/i)).toBeInTheDocument()
  expect(unsealWriting).not.toHaveBeenCalled()
})

test('the success section is announced and focused', async () => {
  invoke.mockImplementation(async (name, opts) => opts?.method === 'DELETE'
    ? { data: { removed: true }, error: null }
    : { data: { waiting: true, bundle: 'AQID', sealed_at: SEALED_AT }, error: null })
  unsealWriting.mockResolvedValue({ v: 2, stories: [], series: [] })
  render(<SealedWritingPrompt />)
  fireEvent.change(await screen.findByLabelText(/recovery code/i), { target: { value: 'pale-hound' } })
  fireEvent.click(screen.getByRole('button', { name: /unseal/i }))
  const status = await screen.findByRole('status')
  await waitFor(() => expect(status).toHaveFocus())
})
