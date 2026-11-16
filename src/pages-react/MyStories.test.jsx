import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { test, expect, vi, beforeEach, afterEach } from 'vitest'

// A member with no stories must be able to find their way to writing one.
// My Stories used to have no link to /library/publish/ at all, and its New
// Series form told a brand-new member "All of your stories are already in a
// series" over an empty list.

vi.mock('../components/AuthContext', () => ({
  AuthProvider: ({ children }) => children,
  useAuth: () => ({ user: { id: 'u1' }, session: { user: { id: 'u1' } } }),
}))
vi.mock('../components/RequireAuth', () => ({ default: ({ children }) => children }))
vi.mock('../lib/notify', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

let books = []
let series = []
vi.mock('../lib/series', () => ({
  fetchMyBooks: vi.fn(async () => books),
  fetchMySeriesWithBooks: vi.fn(async () => series),
  createSeriesWithInitialStory: vi.fn(),
  addBookToSeries: vi.fn(),
  removeBookFromSeries: vi.fn(),
  updateBookSortOrder: vi.fn(),
  deleteSeries: vi.fn(),
}))

const MyStories = (await import('./MyStories')).default

beforeEach(() => {
  books = []
  series = []
})
afterEach(() => cleanup())

test('always offers a way to write a new story', async () => {
  render(<MyStories />)
  const link = await screen.findByRole('link', { name: /write a new story/i })
  expect(link).toHaveAttribute('href', '/library/publish/')
})

test('a member with no stories is pointed to writing their first', async () => {
  render(<MyStories />)
  const link = await screen.findByRole('link', { name: /write your first story/i })
  expect(link).toHaveAttribute('href', '/library/publish/')
})

test('the New Series form explains that a series needs a story first', async () => {
  render(<MyStories />)
  fireEvent.click(await screen.findByRole('button', { name: /new series/i }))
  expect(screen.getByText(/a series starts with one of your stories/i)).toBeInTheDocument()
  expect(screen.queryByText(/already in a series/i)).toBeNull()
})

test('says stories are already in a series only when that is true', async () => {
  books = [{ id: 'b1', title: 'Them', created_at: '2026-09-01', comments_count: 0, seriesId: 's1' }]
  series = [{ id: 's1', title: 'Cycle', books: [{ id: 'b1', title: 'Them', sort_order: 0 }] }]
  render(<MyStories />)
  fireEvent.click(await screen.findByRole('button', { name: /new series/i }))
  expect(screen.getByText(/all of your stories are already in a series/i)).toBeInTheDocument()
})

test('links story and series titles to their reader pages and shows 1-based Vol badge', async () => {
  books = [{ id: 'b1', title: 'Them', created_at: '2026-09-01', comments_count: 2, seriesId: 's1', seriesTitle: 'Cycle' }]
  series = [{ id: 's1', title: 'Cycle', books: [{ id: 'b1', title: 'Them', sort_order: 0 }] }]
  render(<MyStories />)

  const seriesLink = await screen.findByRole('link', { name: 'Cycle' })
  expect(seriesLink).toHaveAttribute('href', '/library/series/s1/')

  const storyLinks = screen.getAllByRole('link', { name: 'Them' })
  expect(storyLinks.length).toBeGreaterThanOrEqual(2)
  storyLinks.forEach((l) => expect(l).toHaveAttribute('href', '/library/read/b1/'))

  expect(screen.getByText('Vol 1')).toBeInTheDocument()
})
