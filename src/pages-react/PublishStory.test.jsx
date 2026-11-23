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
  applySeriesChoice: vi.fn(),
}))
vi.mock('../lib/notify', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

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

test('opening an existing story without changes does not autosave a phantom draft', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  try {
    render(<PublishStory bookId="b1" />)
    const titleInput = await screen.findByDisplayValue('Original title')

    // Advance past the 1500ms autosave debounce without touching any field.
    await act(async () => {
      vi.advanceTimersByTime(2000)
    })
    expect(localStorage.getItem('hw_draft_edit_b1')).toBeNull()

    // Now make a real edit; after 1500ms the draft is saved.
    fireEvent.change(titleInput, { target: { value: 'Changed title' } })
    await act(async () => {
      vi.advanceTimersByTime(2000)
    })
    expect(localStorage.getItem('hw_draft_edit_b1')).toContain('Changed title')
  } finally {
    vi.useRealTimers()
  }
})

// House Rule 4: stories are written by the member. The promise is made at publish.
const fillStory = async () => {
  fireEvent.change(await screen.findByPlaceholderText('The Music of Erich Zann'), { target: { value: 'The Lighthouse' } })
  fireEvent.change(screen.getByPlaceholderText(/In the Rue d'Auseil/), { target: { value: 'A keeper alone.' } })
  fireEvent.change(screen.getByPlaceholderText(/^True!—nervous—/), { target: { value: Array(60).fill('word').join(' ') } })
}
const promise = () => screen.getByRole('checkbox', { name: /I wrote this myself/i })

test('asks the writer to promise the story is their own, on a new story and on an edit', async () => {
  render(<PublishStory />)
  await screen.findByPlaceholderText('The Music of Erich Zann')
  expect(promise()).not.toBeChecked()
  expect(screen.getByRole('link', { name: /House Rule 4/i })).toHaveAttribute('href', '/rules/#house-rules')
  cleanup()

  render(<PublishStory bookId="b1" />)
  await screen.findByDisplayValue('Original title')
  expect(promise()).not.toBeChecked()
})

test('will not publish until the box is ticked', async () => {
  render(<PublishStory />)
  await fillStory()
  from.mockClear()

  fireEvent.submit(document.querySelector('form'))

  expect(await screen.findByText('Tick the box to confirm you wrote this story yourself.')).toBeInTheDocument()
  expect(from).not.toHaveBeenCalledWith('books')
})

test('publishes once the box is ticked', async () => {
  render(<PublishStory />)
  await fillStory()
  from.mockClear()

  fireEvent.click(promise())
  fireEvent.submit(document.querySelector('form'))

  await waitFor(() => expect(from).toHaveBeenCalledWith('books'))
  expect(screen.queryByText('Tick the box to confirm you wrote this story yourself.')).toBeNull()
})
