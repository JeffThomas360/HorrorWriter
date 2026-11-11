import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { test, expect, vi, afterEach, beforeEach } from 'vitest'

// The story is server-rendered, then re-read in the browser. A re-read that
// fails must never replace a story the reader already has with "Not found".

let bookResult
vi.mock('../supabaseClient', () => {
  const chain = (result) => {
    const q = { select: () => q, eq: () => q, order: () => q, single: () => result(), then: (res, rej) => Promise.resolve({ data: [], error: null }).then(res, rej) }
    return q
  }
  return {
    supabase: {
      from: (table) => chain(() => (table === 'books' ? bookResult() : Promise.resolve({ data: null, error: null }))),
    },
  }
})
vi.mock('../components/AuthContext', () => ({
  AuthProvider: ({ children }) => children,
  useAuth: () => ({ session: null, profile: null }),
}))
vi.mock('../lib/series', () => ({ fetchStorySeriesContext: () => Promise.resolve(null) }))

const { default: ReadStory } = await import('./ReadStory')

const id = '726bf613-20ea-4d2c-a0b7-f3fb044d062a'
const book = {
  id, title: 'The Cellar Door', lede: 'It was never locked.', content: 'Down the stairs she went.',
  author_id: 'u1', profiles: { handle: 'bram' }, created_at: '2026-11-01T00:00:00Z', mod_status: 'live',
}
const networkDown = () => Promise.resolve({ data: null, error: { message: 'TypeError: Failed to fetch', code: '' } })

beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}) })
afterEach(() => { cleanup(); vi.restoreAllMocks() })

test('a failed re-read keeps the server-rendered story on screen', async () => {
  const reread = vi.fn(networkDown)
  bookResult = reread
  render(<ReadStory id={id} initialBook={book} />)
  await waitFor(() => expect(reread).toHaveBeenCalled())
  // Let the failed re-read settle before asserting nothing was swapped out.
  await new Promise((r) => setTimeout(r, 50))
  expect(screen.getByRole('heading', { level: 1, name: 'The Cellar Door' })).toBeInTheDocument()
  expect(screen.queryByText('Story not found in the archives.')).toBeNull()
  expect(screen.queryByRole('alert')).toBeNull()
})

test('with no server-rendered story, a failed read offers a retry, not "Not found"', async () => {
  bookResult = networkDown
  render(<ReadStory id={id} />)
  expect(await screen.findByRole('alert')).toHaveTextContent("The story didn't open")
  expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  expect(screen.queryByText('Story not found in the archives.')).toBeNull()
  expect(screen.queryByText(/Failed to fetch/)).toBeNull()
})

test('a story the database says does not exist is Not found', async () => {
  bookResult = () => Promise.resolve({ data: null, error: { code: 'PGRST116', message: 'no rows' } })
  render(<ReadStory id={id} initialBook={book} />)
  expect(await screen.findByText('Story not found in the archives.')).toBeInTheDocument()
  expect(screen.queryByRole('heading', { level: 1, name: 'The Cellar Door' })).toBeNull()
})
