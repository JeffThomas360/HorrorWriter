import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { test, expect, vi, afterEach } from 'vitest'

vi.mock('../components/AuthContext', () => ({
  AuthProvider: ({ children }) => children,
  useAuth: () => ({ session: null, profile: null }),
}))

const mockBooks = [
  {
    id: 'b1',
    title: 'Uncritiqued Tape',
    lede: 'Waiting for a reader.',
    content: 'word '.repeat(400),
    created_at: new Date().toISOString(),
    comments_count: 0,
    profiles: { handle: 'writer1' },
    series_books: [],
  },
  {
    id: 'b2',
    title: 'Hollow Part 1',
    lede: 'First installment.',
    content: 'word '.repeat(3000),
    created_at: new Date().toISOString(),
    comments_count: 3,
    profiles: { handle: 'writer2' },
    series_books: [{ sort_order: 0, series: { id: 'ser-1', title: 'The Hollow Series' } }],
  },
  {
    id: 'b3',
    title: 'Hollow Part 2',
    lede: 'Second installment.',
    content: 'word '.repeat(3000),
    created_at: new Date().toISOString(),
    comments_count: 2,
    profiles: { handle: 'writer2' },
    series_books: [{ sort_order: 1, series: { id: 'ser-1', title: 'The Hollow Series' } }],
  },
]

vi.mock('../supabaseClient', () => {
  const buildChain = (isArchiveQuery = false) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      is: () => buildChain(false),
      not: () => buildChain(true),
      order: () => Promise.resolve({ data: isArchiveQuery ? [] : mockBooks, error: null }),
    }
    return chain
  }
  return {
    supabase: {
      from: () => buildChain(false),
    },
  }
})

const Library = (await import('./Library')).default

afterEach(() => cleanup())

test('renders discovery filter pills for signed-out visitors, links series to their hub, and collapses series', async () => {
  render(<Library />)

  expect(await screen.findByText('Uncritiqued Tape')).toBeInTheDocument()
  expect(screen.getByText('Hollow Part 1')).toBeInTheDocument()
  expect(screen.getByText('Hollow Part 2')).toBeInTheDocument()

  // Series cards render a direct link to the Series Hub
  const seriesLinks = screen.getAllByRole('link', { name: /The Hollow Series \(2 parts\)/i })
  expect(seriesLinks[0]).toHaveAttribute('href', '/library/series/ser-1/')

  // Collapse Series keeps only Vol 1 per series
  const collapseBtn = screen.getByRole('button', { name: /Collapse Series/i })
  fireEvent.click(collapseBtn)
  expect(screen.getByText('Hollow Part 1')).toBeInTheDocument()
  expect(screen.queryByText('Hollow Part 2')).toBeNull()

  // Needs First Critique filters to 0-critique stories
  fireEvent.click(screen.getByRole('button', { name: /Needs First Critique/i }))
  expect(screen.getByText('Uncritiqued Tape')).toBeInTheDocument()
  expect(screen.queryByText('Hollow Part 1')).toBeNull()
})
