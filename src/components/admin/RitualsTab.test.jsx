import { render, screen, fireEvent, cleanup, within, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { test, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

let rows = []
const api = {
  fetchRitualQueue: vi.fn(async () => rows),
  addPrompt: vi.fn(async () => 'new-id'),
  editPrompt: vi.fn(async () => {}),
  approvePrompt: vi.fn(async () => '2026-10-16T07:00:00Z'),
  unschedulePrompt: vi.fn(async () => {}),
  rejectPrompt: vi.fn(async () => {}),
}
vi.mock('../../lib/ritualAdmin', () => api)

const RitualsTab = (await import('./RitualsTab')).default

const NOW = new Date('2026-10-10T12:00:00Z')
const row = (id, status, goes_live_at, body = `Prompt body for ${id}, long enough.`) =>
  ({ id, body, status, goes_live_at, source: 'keeper', created_at: '2026-10-01T00:00:00Z' })

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={qc}><RitualsTab /></QueryClientProvider>)
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  rows = []
  Object.values(api).forEach((f) => f.mockClear())
})
afterEach(() => { cleanup(); vi.useRealTimers() })

test('empty queue shows honest empty states', async () => {
  renderTab()
  expect(await screen.findByText('Nothing has gone live yet.')).toBeInTheDocument()
  expect(screen.getByText(/nothing waiting/i)).toBeInTheDocument()
  expect(screen.getByText('Nothing scheduled.')).toBeInTheDocument()
})

test('the live prompt is locked: no edit, approve, un-schedule or reject', async () => {
  rows = [row('live', 'scheduled', '2026-10-09T07:00:00Z')]
  renderTab()
  const live = await screen.findByRole('region', { name: /live now/i })
  expect(within(live).getByText(/live — locked/i)).toBeInTheDocument()
  expect(within(live).queryByRole('button')).toBeNull()
})

test('upcoming prompts show their slot and can be un-scheduled', async () => {
  rows = [row('next', 'scheduled', '2026-10-16T07:00:00Z')]
  renderTab()
  const schedule = await screen.findByRole('region', { name: /^schedule$/i })
  expect(within(schedule).getByText(/goes live fri 16 oct, 03:00 et/i)).toBeInTheDocument()
  fireEvent.click(within(schedule).getByRole('button', { name: /un-schedule/i }))
  await waitFor(() => expect(api.unschedulePrompt).toHaveBeenCalledWith('next'))
})

test('approve is called once even on a double click', async () => {
  rows = [row('p1', 'pending', null)]
  let release
  api.approvePrompt.mockImplementationOnce(() => new Promise((r) => { release = () => r('2026-10-16T07:00:00Z') }))
  renderTab()
  const btn = await screen.findByRole('button', { name: /approve/i })
  fireEvent.click(btn)
  fireEvent.click(btn)
  await waitFor(() => expect(btn).toBeDisabled())
  expect(api.approvePrompt).toHaveBeenCalledTimes(1)
  release()
})

test('reject asks first and deletes only on confirm', async () => {
  rows = [row('p1', 'pending', null)]
  const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
  renderTab()
  const btn = await screen.findByRole('button', { name: /reject/i })
  fireEvent.click(btn)
  expect(api.rejectPrompt).not.toHaveBeenCalled()
  fireEvent.click(btn)
  await waitFor(() => expect(api.rejectPrompt).toHaveBeenCalledWith('p1'))
  confirm.mockRestore()
})

test('inline edit enforces 10–400 characters before saving', async () => {
  rows = [row('p1', 'pending', null)]
  renderTab()
  fireEvent.click(await screen.findByRole('button', { name: /^edit$/i }))
  const box = screen.getByRole('textbox', { name: /edit prompt/i })
  const save = screen.getByRole('button', { name: /^save$/i })

  fireEvent.change(box, { target: { value: 'short' } })
  expect(save).toBeDisabled()
  fireEvent.change(box, { target: { value: 'x'.repeat(412) } })
  expect(screen.getByText('412 / 400')).toBeInTheDocument()
  expect(save).toBeDisabled()

  fireEvent.change(box, { target: { value: 'A better prompt about the cellar door.' } })
  fireEvent.click(save)
  await waitFor(() => expect(api.editPrompt).toHaveBeenCalledWith('p1', 'A better prompt about the cellar door.'))
})

test('add prompt enforces the same bounds', async () => {
  renderTab()
  const box = await screen.findByRole('textbox', { name: /new prompt/i })
  const add = screen.getByRole('button', { name: /add prompt/i })
  expect(add).toBeDisabled()
  fireEvent.change(box, { target: { value: 'The lighthouse keeper logs a ship that sank in 1911.' } })
  fireEvent.click(add)
  await waitFor(() => expect(api.addPrompt).toHaveBeenCalledWith('The lighthouse keeper logs a ship that sank in 1911.'))
})
