import { render, screen, fireEvent, cleanup, within, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { test, expect, vi, beforeEach, afterEach } from 'vitest'
import { toast } from 'sonner'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

let rows = []
const api = {
  fetchOpenTasks: vi.fn(async () => rows),
  resolveTask: vi.fn(async () => {}),
  snoozeTask: vi.fn(async () => {}),
  addManualTask: vi.fn(async () => 'new-id'),
}
vi.mock('../../lib/keeperTaskApi', () => api)

const WorkQueueTab = (await import('./WorkQueueTab')).default

const NOW = new Date('2026-10-10T12:00:00Z')
const task = (id, over = {}) => ({
  id, type: 'manual', status: 'open', priority: 0, snoozed_until: null,
  created_at: '2026-10-01T00:00:00Z', payload: { title: `Task ${id}` }, ...over,
})

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={qc}><WorkQueueTab /></QueryClientProvider>)
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  rows = []
  Object.values(api).forEach((f) => f.mockClear())
  toast.error.mockClear()
})
afterEach(() => { cleanup(); vi.useRealTimers() })

test('an empty queue says so plainly', async () => {
  renderTab()
  expect(await screen.findByText(/nothing waiting/i)).toBeInTheDocument()
})

test('lists tasks with their type and offers the type\'s actions', async () => {
  rows = [task('a')]
  renderTab()
  const card = await screen.findByRole('listitem')
  expect(within(card).getByText('Task a')).toBeInTheDocument()
  expect(within(card).getByText('To-do')).toBeInTheDocument()
  expect(within(card).getByRole('button', { name: 'Done' })).toBeInTheDocument()
  expect(within(card).getByRole('button', { name: 'Dismiss' })).toBeInTheDocument()
})

test('resolving a task calls the API with its action', async () => {
  rows = [task('a')]
  renderTab()
  fireEvent.click(await screen.findByRole('button', { name: 'Done' }))
  await waitFor(() => expect(api.resolveTask).toHaveBeenCalledWith('a', 'done'))
})

test('snoozing offers 1 and 7 days', async () => {
  rows = [task('a')]
  renderTab()
  fireEvent.click(await screen.findByRole('button', { name: /snooze 7 days/i }))
  await waitFor(() => expect(api.snoozeTask).toHaveBeenCalledWith('a', 7))
  expect(screen.getByRole('button', { name: /snooze 1 day/i })).toBeInTheDocument()
})

test('snoozed tasks are hidden until "show snoozed" is ticked', async () => {
  rows = [task('a'), task('b', { snoozed_until: '2026-10-12T00:00:00Z' })]
  renderTab()
  await screen.findByText('Task a')
  expect(screen.queryByText('Task b')).toBeNull()
  fireEvent.click(screen.getByLabelText(/show snoozed/i))
  expect(await screen.findByText('Task b')).toBeInTheDocument()
})

test('an unknown task type renders plainly, with Snooze but no actions', async () => {
  rows = [task('x', { type: 'from_the_future', payload: {} })]
  renderTab()
  const card = await screen.findByRole('listitem')
  expect(within(card).getByText('Unknown task')).toBeInTheDocument()
  expect(within(card).getByRole('button', { name: /snooze 1 day/i })).toBeInTheDocument()
  expect(within(card).queryByRole('button', { name: 'Done' })).toBeNull()
})

test('the type filter narrows the list', async () => {
  rows = [task('a'), task('t', { type: 'tag_review', payload: {} })]
  renderTab()
  await screen.findByText('Task a')
  // unknown types describe themselves by their type string
  expect(screen.getByText('tag_review')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText(/filter by type/i), { target: { value: 'manual' } })
  expect(screen.getByText('Task a')).toBeInTheDocument()
  expect(screen.queryByText('tag_review')).toBeNull()
})

const GONE = 'That task is no longer open. The list has been refreshed.'

test('a failed resolve shows the error and refreshes the list', async () => {
  rows = [task('a')]
  api.resolveTask.mockRejectedValueOnce(new Error(GONE))
  renderTab()
  fireEvent.click(await screen.findByRole('button', { name: 'Done' }))
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith(GONE))
  await waitFor(() => expect(api.fetchOpenTasks).toHaveBeenCalledTimes(2))
})

test('a failed snooze shows the error and refreshes the list', async () => {
  rows = [task('a')]
  api.snoozeTask.mockRejectedValueOnce(new Error(GONE))
  renderTab()
  fireEvent.click(await screen.findByRole('button', { name: /snooze 1 day/i }))
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith(GONE))
  await waitFor(() => expect(api.fetchOpenTasks).toHaveBeenCalledTimes(2))
})

test('a failed background refetch keeps the list and shows the error above it', async () => {
  rows = [task('a')]
  renderTab()
  await screen.findByText('Task a')
  api.fetchOpenTasks.mockRejectedValueOnce(new Error('Network down'))
  fireEvent.click(screen.getByRole('button', { name: /snooze 1 day/i }))
  expect(await screen.findByText('Network down')).toBeInTheDocument()
  expect(screen.getByText('Task a')).toBeInTheDocument()
})

test('adding a to-do needs a title, then calls the API', async () => {
  renderTab()
  await screen.findByText(/nothing waiting/i)
  const add = screen.getByRole('button', { name: /add to-do/i })
  expect(add).toBeDisabled()
  fireEvent.change(screen.getByLabelText(/to-do title/i), { target: { value: 'Renew domain' } })
  expect(add).not.toBeDisabled()
  fireEvent.click(add)
  await waitFor(() => expect(api.addManualTask).toHaveBeenCalledWith('Renew domain', null))
})
