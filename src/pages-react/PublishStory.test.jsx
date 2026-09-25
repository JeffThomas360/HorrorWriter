import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react'
import { test, expect, vi, afterEach } from 'vitest'

// AuthContext hands out a NEW session object on every auth event, including
// the hourly token refresh. The edit form must not reload the story (and wipe
// the author's unsaved changes) just because that object changed.

let authState = { session: { user: { id: 'author-1' }, access_token: 't1' }, isLoading: false }
vi.mock('../components/AuthContext', () => ({
  AuthProvider: ({ children }) => children,
  useAuth: () => authState,
}))
vi.mock('../components/RequireAuth', () => ({ default: ({ children }) => children }))
vi.mock('../lib/series', () => ({
  fetchAuthorSeriesOptions: vi.fn().mockResolvedValue([]),
  addBookToSeries: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const single = vi.fn().mockResolvedValue({
  data: { id: 'b1', title: 'Original title', lede: '', cover: 'blood', content: 'Body', version: 1, series_books: [] },
  error: null,
})
const from = vi.fn(() => ({ select: () => ({ eq: () => ({ single }) }) }))
vi.mock('../supabaseClient', () => ({ supabase: { from: (...a) => from(...a) } }))

const PublishStory = (await import('./PublishStory')).default

afterEach(() => {
  cleanup()
  localStorage.clear()
})

test('a token refresh does not reload the story over unsaved edits', async () => {
  const { rerender } = render(<PublishStory bookId="b1" />)
  const titleInput = await screen.findByDisplayValue('Original title')
  expect(from).toHaveBeenCalledTimes(1)

  fireEvent.change(titleInput, { target: { value: 'Edited title' } })

  // Same user, new session object: what TOKEN_REFRESHED produces.
  authState = { session: { user: { id: 'author-1' }, access_token: 't2' }, isLoading: false }
  rerender(<PublishStory bookId="b1" />)
  await act(async () => { await Promise.resolve() })

  expect(from).toHaveBeenCalledTimes(1)
  await waitFor(() => expect(screen.getByDisplayValue('Edited title')).toBeInTheDocument())
})
