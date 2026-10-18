import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { test, expect, vi, beforeEach, afterEach } from 'vitest'

let auth = { user: null, isLoading: false }
vi.mock('./AuthContext', () => ({
  useAuth: () => auth,
  AuthProvider: ({ children }) => children,
}))
vi.mock('../lib/soundscapes', () => ({ playTypewriterKey: () => {} }))
vi.mock('../lib/screenContent', () => ({ screenContent: vi.fn(async () => {}) }))
vi.mock('../supabaseClient', () => ({ supabase: {} }))

let current = null
let next = null
let serverDraft = null
const api = {
  fetchCurrentPrompt: vi.fn(async () => current),
  fetchActivePrompts: vi.fn(async () => current ? [current] : []),
  fetchNextUnlock: vi.fn(async () => next),
  fetchMyDraft: vi.fn(async () => serverDraft),
  saveRitualDraft: vi.fn(async () => 'draft-1'),
  shareRitualDraft: vi.fn(async () => 'thread-new-1'),
  publishRitualToForum: vi.fn(async () => 'thread-new-1'),
  fetchMyLatestEntryId: vi.fn(async () => 'post-9'),
}
vi.mock('../lib/ritualDraft', async (importOriginal) => ({ ...(await importOriginal()), ...api }))

const MidnightRitual = (await import('./MidnightRitual')).default

const PROMPT = { id: 'p1', body: 'A tenant hears scratching behind the new wallpaper.', goes_live_at: '2026-10-09T07:00:00Z' }

beforeEach(() => {
  auth = { user: null, isLoading: false }
  current = null
  next = null
  serverDraft = null
  window.localStorage.clear()
  Object.values(api).forEach((f) => f.mockClear())
})
afterEach(cleanup)

const open = async () => {
  fireEvent.click(await screen.findByRole('button', { name: /write to this/i }))
  return screen.getByRole('textbox')
}

test('renders multi-channel frequencies tuner with CH 13.0 through CH 13.4', async () => {
  render(<MidnightRitual />)
  expect(screen.getByRole('button', { name: 'CH 13.0' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'CH 13.1' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'CH 13.2' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'CH 13.3' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'CH 13.4' })).toBeInTheDocument()
})

test('tuning to CH 13.1 switches prompt to second rotating frequency', async () => {
  render(<MidnightRitual />)
  fireEvent.click(screen.getByRole('button', { name: 'CH 13.1' }))
  expect(await screen.findByText(/Active Prompt 2/i)).toBeInTheDocument()
  expect(await screen.findByText(/Every year, the village buries a carved wooden effigy/i)).toBeInTheDocument()
})

test('shows the current prompt from the database and the next unlock on CH 13.0', async () => {
  current = PROMPT
  next = '2026-10-16T07:00:00Z'
  render(<MidnightRitual />)
  expect(await screen.findByText(new RegExp(PROMPT.body))).toBeInTheDocument()
  expect(await screen.findByText(/next: fri 16 oct, 03:00 et/i)).toBeInTheDocument()
})

test('counts words against 2000 and blocks saving over the cap', async () => {
  current = PROMPT
  render(<MidnightRitual />)
  const box = await open()
  expect(screen.getByText('0 / 2000 words')).toBeInTheDocument()
  fireEvent.change(box, { target: { value: Array(2001).fill('w').join(' ') } })
  expect(screen.getByText('2001 / 2000 words')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /save draft/i })).toBeDisabled()
})

test('autosaves to this device as the writer types, and restores it', async () => {
  current = PROMPT
  render(<MidnightRitual />)
  fireEvent.change(await open(), { target: { value: 'the walls breathe' } })
  expect(window.localStorage.getItem('hw.ritual.draft.p1')).toBe('the walls breathe')
  cleanup()
  render(<MidnightRitual />)
  expect((await open()).value).toBe('the walls breathe')
})

test('signed out: Save asks to sign in and remembers to save afterwards', async () => {
  current = PROMPT
  const heard = vi.fn()
  window.addEventListener('open-signin', heard)
  render(<MidnightRitual />)
  fireEvent.change(await open(), { target: { value: 'the walls breathe' } })
  fireEvent.click(screen.getByRole('button', { name: /save draft/i }))
  expect(heard).toHaveBeenCalled()
  expect(window.localStorage.getItem('hw.ritual.saveAfterSignin')).toBe('p1')
  expect(api.saveRitualDraft).not.toHaveBeenCalled()
  expect(screen.getByText(/sign in to save/i)).toBeInTheDocument()
  window.removeEventListener('open-signin', heard)
})

test('after sign-in, the remembered draft saves itself', async () => {
  current = PROMPT
  window.localStorage.setItem('hw.ritual.draft.p1', 'kept through the redirect')
  window.localStorage.setItem('hw.ritual.saveAfterSignin', 'p1')
  auth = { user: { id: 'u1' }, isLoading: false }
  render(<MidnightRitual />)
  await waitFor(() =>
    expect(api.saveRitualDraft).toHaveBeenCalledWith({ promptId: 'p1', userId: 'u1', content: 'kept through the redirect' })
  )
  expect(window.localStorage.getItem('hw.ritual.saveAfterSignin')).toBeNull()
  expect(await screen.findByText(/saved to your account/i)).toBeInTheDocument()
})

test('signed in: Save writes the draft to the account', async () => {
  current = PROMPT
  auth = { user: { id: 'u1' }, isLoading: false }
  render(<MidnightRitual />)
  fireEvent.change(await open(), { target: { value: 'the walls breathe' } })
  fireEvent.click(screen.getByRole('button', { name: /save draft/i }))
  await waitFor(() =>
    expect(api.saveRitualDraft).toHaveBeenCalledWith({ promptId: 'p1', userId: 'u1', content: 'the walls breathe' })
  )
  expect(await screen.findByText(/saved to your account/i)).toBeInTheDocument()
})

test('signed in: opening the box brings back the saved draft', async () => {
  current = PROMPT
  serverDraft = { content: 'from my account' }
  auth = { user: { id: 'u1' }, isLoading: false }
  render(<MidnightRitual />)
  const box = await open()
  await waitFor(() => expect(box.value).toBe('from my account'))
})

test('a failed save says so and keeps the text', async () => {
  current = PROMPT
  auth = { user: { id: 'u1' }, isLoading: false }
  api.saveRitualDraft.mockRejectedValueOnce(new Error("It's still kept on this device."))
  render(<MidnightRitual />)
  const box = await open()
  fireEvent.change(box, { target: { value: 'the walls breathe' } })
  fireEvent.click(screen.getByRole('button', { name: /save draft/i }))
  expect(await screen.findByText(/still kept on this device/i)).toBeInTheDocument()
  expect(box.value).toBe('the walls breathe')
})

test('signed out: clicking Publish for Critique prompts to sign in', async () => {
  current = PROMPT
  const heard = vi.fn()
  window.addEventListener('open-signin', heard)
  render(<MidnightRitual />)
  fireEvent.change(await open(), { target: { value: 'the walls breathe' } })
  fireEvent.click(screen.getByRole('button', { name: /publish for critique/i }))
  expect(heard).toHaveBeenCalled()
  expect(window.localStorage.getItem('hw.ritual.saveAfterSignin')).toBe('p1')
  expect(screen.getByText(/sign in to publish your story for critique/i)).toBeInTheDocument()
  window.removeEventListener('open-signin', heard)
})

test('signed in: clicking Publish for Critique prompts for title and publishes', async () => {
  current = PROMPT
  auth = { user: { id: 'u1' }, isLoading: false }
  const assignSpy = vi.fn()
  delete window.location
  window.location = { assign: assignSpy }

  render(<MidnightRitual />)
  fireEvent.change(await open(), { target: { value: 'the walls breathe' } })
  fireEvent.click(screen.getByRole('button', { name: /publish for critique/i }))

  expect(await screen.findByLabelText(/title your story for the crypt/i)).toBeInTheDocument()
  fireEvent.change(screen.getByPlaceholderText(/enter a story title/i), { target: { value: 'Scratching Walls' } })
  fireEvent.click(screen.getByRole('button', { name: /summon to the crypt/i }))

  await waitFor(() => {
    expect(api.shareRitualDraft).toHaveBeenCalledWith({ draftId: 'draft-1', title: 'Scratching Walls' })
    expect(assignSpy).toHaveBeenCalledWith('/forum/thread/thread-new-1/#post-post-9')
  })
})
