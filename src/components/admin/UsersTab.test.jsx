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
