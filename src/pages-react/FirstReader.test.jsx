import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { test, expect, vi, afterEach, beforeEach } from 'vitest'

let authState
vi.mock('../components/AuthContext', () => ({
  AuthProvider: ({ children }) => children,
  useAuth: () => authState,
}))
const fetchWaiting = vi.fn()
vi.mock('../lib/firstReader', () => ({ fetchWaiting: (...a) => fetchWaiting(...a) }))

const FirstReader = (await import('./FirstReader')).default

const item = (title, extra = {}) => ({ kind: 'Story', title, href: `/library/read/${title}/`, handle: 'bram', created_at: '2026-11-01T00:00:00Z', days: 4, ...extra })

beforeEach(() => { authState = { user: null, isLoading: false }; fetchWaiting.mockReset() })
afterEach(cleanup)

test('shows the server-rendered list straight away', async () => {
  fetchWaiting.mockResolvedValue([item('The Cellar')])
  render(<FirstReader initialItems={[item('The Cellar')]} />)
  expect(screen.getByRole('link', { name: /The Cellar/ })).toHaveAttribute('href', '/library/read/The Cellar/')
  expect(screen.getByText(/Story · waiting 4 days/i)).toBeInTheDocument()
  expect(screen.getByText(/by @bram/)).toBeInTheDocument()
})

test('a signed-in member re-reads the list as themselves, without their own work', async () => {
  authState = { user: { id: 'me' }, isLoading: false }
  fetchWaiting.mockResolvedValue([item('Someone else’s')])
  render(<FirstReader initialItems={[item('Mine'), item('Someone else’s')]} />)
  // The server's list stands in until the member's own read arrives, then is replaced.
  await waitFor(() => expect(screen.queryByRole('link', { name: /Mine/ })).toBeNull())
  expect(screen.getByRole('link', { name: /Someone else’s/ })).toBeInTheDocument()
  expect(fetchWaiting).toHaveBeenCalledWith({ excludeAuthor: 'me' })
})

test('an empty list reads as good news', async () => {
  fetchWaiting.mockResolvedValue([])
  render(<FirstReader initialItems={[]} />)
  expect(screen.getByText('Everyone has a reader tonight.')).toBeInTheDocument()
})

test('with no server list and a failed read, shows a friendly error', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  fetchWaiting.mockRejectedValue(new TypeError('Failed to fetch'))
  render(<FirstReader initialItems={null} />)
  expect(await screen.findByRole('alert', {}, { timeout: 5000 })).toHaveTextContent("The list didn't load")
  expect(screen.queryByText(/Failed to fetch/)).toBeNull()
})
