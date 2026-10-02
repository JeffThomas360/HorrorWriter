import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { test, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../lib/modActions', () => ({ fetchSiteStats: vi.fn(async () => ({})) }))
vi.mock('../../lib/siteSettings', () => ({ fetchSiteSettings: vi.fn(async () => ({})) }))
let future = 0
let countFails = false
vi.mock('../../lib/ritualAdmin', () => ({
  countFutureScheduled: vi.fn(async () => {
    if (countFails) throw new Error('read failed')
    return future
  }),
}))

const AdminOverviewTab = (await import('./AdminOverviewTab')).default

function renderIt(onNavigate = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={qc}><AdminOverviewTab onNavigate={onNavigate} /></QueryClientProvider>)
  return onNavigate
}

beforeEach(() => { future = 0; countFails = false })
afterEach(() => cleanup())

test('warns when fewer than 2 rituals are scheduled, and links to the tab', async () => {
  future = 1
  const nav = renderIt()
  expect(await screen.findByText(/only 1 midnight ritual prompt is scheduled/i)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /review rituals/i }))
  expect(nav).toHaveBeenCalledWith('rituals')
})

test('says so plainly when none are scheduled', async () => {
  future = 0
  renderIt()
  expect(await screen.findByText(/no midnight ritual prompts are scheduled/i)).toBeInTheDocument()
})

test('stays quiet at 2 or more', async () => {
  future = 2
  renderIt()
  await screen.findByText(/site stats/i)
  await new Promise((r) => setTimeout(r, 0))
  expect(screen.queryByText(/midnight ritual/i)).toBeNull()
})

test('never warns from a failed read', async () => {
  countFails = true
  renderIt()
  await screen.findByText(/site stats/i)
  await new Promise((r) => setTimeout(r, 0))
  expect(screen.queryByText(/midnight ritual/i)).toBeNull()
})
