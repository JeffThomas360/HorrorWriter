import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { test, expect, vi, afterEach } from 'vitest'

let result
let fail = false
const fetchPulse = vi.fn(async () => {
  if (fail) throw new Error('permission denied for table posts')
  return result
})
vi.mock('../../lib/pulse', () => ({ fetchPulse: (...a) => fetchPulse(...a) }))

const PulsePanel = (await import('./PulsePanel')).default

function renderIt() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={qc}><PulsePanel /></QueryClientProvider>)
}

const base = () => ({
  newMembers: { this: 3, last: 1 },
  firstTimePosters: { this: 2, last: 2 },
  ritualEntries: { this: 0, last: 4 },
  critiques: { this: 5, last: 0 },
  firstTimersThisWeek: ['srhollister13-37cb'],
  waiting: [],
  quietNewcomers: [],
})

afterEach(() => { cleanup(); fail = false; fetchPulse.mockClear() })

test('shows this week with the change from last week', async () => {
  result = base()
  renderIt()
  expect(await screen.findByTestId('pulse-newMembers')).toHaveTextContent('3')
  expect(screen.getByTestId('pulse-newMembers')).toHaveTextContent('▲ 2 vs last week (1)')
  expect(screen.getByTestId('pulse-firstTimePosters')).toHaveTextContent('same as last week')
  expect(screen.getByTestId('pulse-ritualEntries')).toHaveTextContent('▼ 4 vs last week (4)')
  expect(screen.getByRole('link', { name: '@srhollister13-37cb' })).toHaveAttribute('href', '/u/srhollister13-37cb/')
})

test('empty lists read as good news, not as an error', async () => {
  result = base()
  renderIt()
  expect(await screen.findByText('Everyone has heard back.')).toBeInTheDocument()
  expect(screen.getByText('No one waiting in the wings.')).toBeInTheDocument()
})

test('lists what is waiting for a reply, with a link to each', async () => {
  result = {
    ...base(),
    waiting: [{ kind: 'Story', title: 'The Cellar', href: '/library/read/s1/', handle: 'bram', created_at: new Date(Date.now() - 3 * 86400000).toISOString() }],
    quietNewcomers: [{ handle: 'capt_yugoslavia', href: '/u/capt_yugoslavia/', created_at: new Date().toISOString() }],
  }
  renderIt()
  expect(await screen.findByRole('link', { name: 'The Cellar' })).toHaveAttribute('href', '/library/read/s1/')
  expect(screen.getByText(/Story by @bram · 3 days ago/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '@capt_yugoslavia' })).toHaveAttribute('href', '/u/capt_yugoslavia/')
  expect(screen.getByText('Waiting for a reply (1)')).toBeInTheDocument()
})

test('a failed read says so and can be retried', async () => {
  fail = true
  renderIt()
  expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't read the pulse/i)
  fail = false
  result = base()
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByTestId('pulse-newMembers')).toBeInTheDocument()
})
