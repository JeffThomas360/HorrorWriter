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
const insertSingle = vi.fn().mockResolvedValue({ data: { id: 'new-1' }, error: null })
const from = vi.fn(() => ({
  select: () => ({ eq: () => ({ single }) }),
  insert: () => ({ select: () => ({ single: insertSingle }) }),
}))
vi.mock('../supabaseClient', () => ({ supabase: { from: (...a) => from(...a) } }))
vi.mock('../lib/screenContent', () => ({ screenContent: vi.fn().mockResolvedValue(undefined) }))
// The tracker is real; only the call that sends its counts is watched.
const recordComposeSignals = vi.fn().mockResolvedValue(undefined)
vi.mock('../lib/composeSignals', async (importOriginal) => ({
  ...(await importOriginal()),
  recordComposeSignals: (...a) => recordComposeSignals(...a),
}))

const PublishStory = (await import('./PublishStory')).default

afterEach(() => {
  cleanup()
  localStorage.clear()
  recordComposeSignals.mockClear()
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

// The evidence record: how the text reached the editor, sent once at publish.
const publish = () => {
  fireEvent.click(promise())
  fireEvent.submit(document.querySelector('form'))
}

test('publishing sends how the text reached the editor', async () => {
  render(<PublishStory />)
  await fillStory()

  publish()

  await waitFor(() => expect(recordComposeSignals).toHaveBeenCalledTimes(1))
  const [, storyId, snapshot] = recordComposeSignals.mock.calls[0]
  expect(storyId).toBe('new-1')
  expect(snapshot.typed).toBeGreaterThan(0)
  expect(snapshot.sittings).toBe(1)
  expect(snapshot.chars_final).toBe(Array(60).fill('word').join(' ').length)
})

test('the autosaved draft keeps the counts', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  try {
    render(<PublishStory />)
    await fillStory()
    await act(async () => { vi.advanceTimersByTime(2000) })

    const draft = JSON.parse(localStorage.getItem('hw_draft_new_story'))
    expect(draft.compose.typed).toBeGreaterThan(0)
    expect(draft.compose.sittings).toBe(1)
  } finally {
    vi.useRealTimers()
  }
})

test('a restored draft carries its counts on as a new sitting', async () => {
  localStorage.setItem('hw_draft_new_story', JSON.stringify({
    title: 'The Lighthouse',
    lede: 'A keeper alone.',
    content: Array(60).fill('word').join(' '),
    compose: {
      typed: 500, pasted: 0, pastes: 0, largest_paste: 0, dictated: 0, imported: 0,
      active_ms: 60000, sittings: 1, chars_at_open: 0, chars_final: 299,
    },
    savedAt: new Date().toISOString(),
  }))
  render(<PublishStory />)
  fireEvent.click(await screen.findByRole('button', { name: 'Restore Draft' }))
  await screen.findByDisplayValue('The Lighthouse')

  publish()

  await waitFor(() => expect(recordComposeSignals).toHaveBeenCalledTimes(1))
  const snapshot = recordComposeSignals.mock.calls[0][2]
  expect(snapshot.sittings).toBe(2)
  expect(snapshot.typed).toBeGreaterThanOrEqual(500)
  expect(snapshot.chars_at_open).toBe(0)
})

test('a failed publish sends nothing', async () => {
  insertSingle.mockResolvedValueOnce({ data: null, error: { message: 'refused' } })
  render(<PublishStory />)
  await fillStory()

  publish()

  expect(await screen.findByText('refused')).toBeInTheDocument()
  expect(recordComposeSignals).not.toHaveBeenCalled()
})
