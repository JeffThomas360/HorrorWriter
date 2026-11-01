import { render, screen, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { test, expect, vi, beforeEach, afterEach } from 'vitest'

let counts = {}
vi.mock('../../lib/modActions', () => ({
  fetchOverviewCounts: vi.fn(async () => counts),
  fetchRecentModActions: vi.fn(async () => []),
  contentHref: () => null,
}))

const OverviewTab = (await import('./OverviewTab')).default

function renderIt() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={qc}><OverviewTab profile={{ mod_role: 'keeper' }} onNavigate={vi.fn()} /></QueryClientProvider>)
}

beforeEach(() => { counts = { openReports: 0, openAppeals: 0, pendingStorms: 0, activeSanctions: 0 } })
afterEach(() => cleanup())

test('has no Support tickets tile: tickets live in the Work Queue', async () => {
  renderIt()
  expect(await screen.findByText('Open reports')).toBeInTheDocument()
  expect(screen.queryByText(/support tickets/i)).toBeNull()
  expect(screen.getAllByRole('button')).toHaveLength(4)
})

test('says the queue is quiet when reports, appeals and storms are all zero', async () => {
  // A stale openSupport must no longer keep the "quiet" line away.
  counts = { ...counts, openSupport: 5 }
  renderIt()
  expect(await screen.findByText(/the queue is quiet/i)).toBeInTheDocument()
})

test('does not call the queue quiet while a report is open', async () => {
  counts = { ...counts, openReports: 2 }
  renderIt()
  await screen.findByText('Open reports')
  expect(screen.queryByText(/the queue is quiet/i)).toBeNull()
})
