import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { test, expect, vi, afterEach } from 'vitest'

const h = vi.hoisted(() => ({ fetchAllUsers: vi.fn() }))
vi.mock('../../lib/siteSettings', () => ({ fetchAllUsers: h.fetchAllUsers }))
vi.mock('../mod/UserModProfile', () => ({ default: () => <p>case file</p> }))

const UsersTab = (await import('./UsersTab')).default

function renderIt() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={qc}><UsersTab /></QueryClientProvider>)
}

const user = (id, banned_until) => ({ id, handle: id, banned_until, created_at: '2026-01-01T00:00:00Z' })

afterEach(() => { cleanup(); h.fetchAllUsers.mockReset() })

const member = (id, submissions, created_at = '2026-01-01T00:00:00Z') => ({ id, handle: id, created_at, submissions })
const cellsOf = (handle) => screen.getByRole('button', { name: `Open case file for ${handle}` }).closest('tr').querySelectorAll('td')

test('the directory has a column for each kind of submission', async () => {
  h.fetchAllUsers.mockResolvedValue([member('writer', {})])
  renderIt()
  await screen.findByText('@writer')
  const headings = screen.getAllByRole('columnheader').map((c) => c.textContent)
  expect(headings).toEqual(['Handle', 'Role', 'Status', 'Stories', 'Rituals', 'Threads', 'Replies', 'Critiques', 'Joined'])
})

test('each column shows that member\'s own count, in column order', async () => {
  h.fetchAllUsers.mockResolvedValue([member('writer', {
    story: { total: 3, hidden: 0, screening: 0 },
    ritual: { total: 2, hidden: 0, screening: 0 },
    reply: { total: 1, hidden: 0, screening: 0 },
    critique: { total: 4, hidden: 0, screening: 0 },
  })])
  renderIt()
  await screen.findByText('@writer')
  const counts = [...cellsOf('writer')].slice(3, 8).map((c) => c.textContent)
  expect(counts).toEqual(['3', '2', '0', '1', '4'])
})

test('a member with no submissions reads as zeros, not blanks', async () => {
  h.fetchAllUsers.mockResolvedValue([member('quiet', undefined)])
  renderIt()
  await screen.findByText('@quiet')
  const counts = [...cellsOf('quiet')].slice(3, 8).map((c) => c.textContent)
  expect(counts).toEqual(['0', '0', '0', '0', '0'])
})

test('a count with something hidden or in screening turns red and says what', async () => {
  h.fetchAllUsers.mockResolvedValue([member('writer', {
    story: { total: 3, hidden: 1, screening: 0 },
    critique: { total: 4, hidden: 0, screening: 0 },
  })])
  renderIt()
  await screen.findByText('@writer')
  const [stories, , , , critiques] = [...cellsOf('writer')].slice(3, 8)
  expect(stories).toHaveAttribute('title', '1 hidden')
  expect(stories.className).toContain('--color-ember')
  expect(critiques).not.toHaveAttribute('title')
  expect(critiques.className).not.toContain('--color-ember')
})

test('Most submissions puts the busiest member first and breaks ties by newest', async () => {
  h.fetchAllUsers.mockResolvedValue([
    // Handles run opposite to the expected order, so an A-Z or Newest sort can't pass by accident.
    member('a_quiet', {}, '2026-03-01T00:00:00Z'),
    member('b_older', { story: { total: 2 } }, '2026-01-01T00:00:00Z'),
    member('c_newer', { critique: { total: 2 } }, '2026-02-01T00:00:00Z'),
    member('d_busy', { story: { total: 1 }, reply: { total: 4 } }, '2026-01-15T00:00:00Z'),
  ])
  renderIt()
  await screen.findByText('@a_quiet')
  fireEvent.change(screen.getByLabelText('Sort users'), { target: { value: 'most' } })
  const order = screen.getAllByRole('button', { name: /Open case file for/ }).map((b) => b.getAttribute('aria-label').replace('Open case file for ', ''))
  expect(order).toEqual(['d_busy', 'c_newer', 'b_older', 'a_quiet'])
})

test('a permanent ban reads Banned, not "Suspended" until 2099', async () => {
  h.fetchAllUsers.mockResolvedValue([user('perma', '2099-12-31T23:59:59+00:00')])
  renderIt()
  expect(await screen.findByText('Banned')).toBeInTheDocument()
  expect(screen.queryByText(/suspended/i)).toBeNull()
})

test('a timed suspension still shows its end date', async () => {
  h.fetchAllUsers.mockResolvedValue([user('timed', new Date(Date.now() + 86400000).toISOString())])
  renderIt()
  expect(await screen.findByText(/^Suspended → /)).toBeInTheDocument()
})

test('coming back from a case file reloads the directory, so a new sanction shows', async () => {
  h.fetchAllUsers.mockResolvedValue([user('target', null)])
  renderIt()
  fireEvent.click(await screen.findByRole('button', { name: /open case file for target/i }))
  fireEvent.click(await screen.findByRole('button', { name: /back to directory/i }))
  await waitFor(() => expect(h.fetchAllUsers).toHaveBeenCalledTimes(2))
})
