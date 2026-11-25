import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { test, expect, vi, afterEach, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ fetchTaggedIds: vi.fn(), fetchEvidence: vi.fn(), setSuspected: vi.fn() }))
vi.mock('../../supabaseClient', () => ({ supabase: null }))
vi.mock('../../lib/aiSuspicion', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchTaggedIds: (...a) => h.fetchTaggedIds(...a),
  fetchEvidence: (...a) => h.fetchEvidence(...a),
  setSuspected: (...a) => h.setSuspected(...a),
}))
vi.mock('../../lib/notify', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const { EVIDENCE_CAVEAT } = await import('../../lib/aiSuspicion')
const { toast } = await import('../../lib/notify')
const AiSuspicionControl = (await import('./AiSuspicionControl')).default

const evidence = {
  tag: null,
  machine: { score: 0.91 },
  compose: {
    typed: 84, pasted: 4116, pastes: 1, largest_paste: 4116, dictated: 0, imported: 0,
    active_ms: 120000, sittings: 1, chars_at_open: 0, chars_final: 4200,
  },
  history: [],
  reports: 0,
}

beforeEach(() => {
  h.fetchTaggedIds.mockResolvedValue(new Set())
  h.fetchEvidence.mockResolvedValue(evidence)
  h.setSuspected.mockResolvedValue(undefined)
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

const tick = () => screen.getByRole('button', { name: /Suspected AI/ })

test('shows unticked for an untagged submission', async () => {
  render(<AiSuspicionControl targetType="story" targetId="b1" />)
  await waitFor(() => expect(h.fetchTaggedIds).toHaveBeenCalled())
  expect(tick()).toHaveAttribute('aria-pressed', 'false')
})

test('shows ticked for a tagged one', async () => {
  h.fetchTaggedIds.mockResolvedValue(new Set(['b1']))
  render(<AiSuspicionControl targetType="story" targetId="b1" />)
  await waitFor(() => expect(tick()).toHaveAttribute('aria-pressed', 'true'))
})

test('clicking opens a dialog with the evidence, the caveat and a reason field', async () => {
  render(<AiSuspicionControl targetType="story" targetId="b1" />)
  fireEvent.click(tick())

  expect(screen.getByRole('alertdialog', { name: 'Tag as suspected AI?' })).toBeInTheDocument()
  expect(await screen.findByText(/Machine score 0\.91 · 4,200 chars, 98% pasted in 1 paste/)).toBeInTheDocument()
  expect(screen.getByText(EVIDENCE_CAVEAT)).toBeInTheDocument()
  expect(screen.getByText('What makes you think so?')).toBeInTheDocument()
  expect(h.fetchEvidence).toHaveBeenCalledWith('story', 'b1')
})

test('confirming tags it and shows ticked without reloading the page', async () => {
  render(<AiSuspicionControl targetType="story" targetId="b1" />)
  fireEvent.click(tick())
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'reads like a chatbot' } })
  fireEvent.click(screen.getByRole('button', { name: 'Tag it' }))

  await waitFor(() => expect(h.setSuspected).toHaveBeenCalledWith('story', 'b1', true, 'reads like a chatbot'))
  await waitFor(() => expect(tick()).toHaveAttribute('aria-pressed', 'true'))
  expect(screen.queryByRole('alertdialog')).toBeNull()
})

test('a tagged submission offers to remove the tag, and shows who tagged it and why', async () => {
  h.fetchTaggedIds.mockResolvedValue(new Set(['b1']))
  h.fetchEvidence.mockResolvedValue({
    ...evidence,
    tag: { note: 'reads like a chatbot', tagged_by_handle: 'warden', tagged_at: '2026-11-24T10:00:00Z' },
  })
  render(<AiSuspicionControl targetType="story" targetId="b1" />)
  await waitFor(() => expect(tick()).toHaveAttribute('aria-pressed', 'true'))
  fireEvent.click(tick())

  expect(screen.getByRole('alertdialog', { name: 'Remove the suspected-AI tag?' })).toBeInTheDocument()
  expect(await screen.findByText(/Tagged by @warden: reads like a chatbot/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Remove tag' }))

  await waitFor(() => expect(h.setSuspected).toHaveBeenCalledWith('story', 'b1', false, null))
  await waitFor(() => expect(tick()).toHaveAttribute('aria-pressed', 'false'))
})

test('a refused tag says why and leaves the tick as it was', async () => {
  h.setSuspected.mockRejectedValue(new Error('Permission denied'))
  render(<AiSuspicionControl targetType="post" targetId="p1" />)
  fireEvent.click(tick())
  fireEvent.click(screen.getByRole('button', { name: 'Tag it' }))

  await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Permission denied'))
  expect(tick()).toHaveAttribute('aria-pressed', 'false')
})

test('the dialog still opens when the evidence cannot be read', async () => {
  h.fetchEvidence.mockRejectedValue(new Error('offline'))
  render(<AiSuspicionControl targetType="story" targetId="b1" />)
  fireEvent.click(tick())
  expect(await screen.findByText('The evidence could not be loaded.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Tag it' })).toBeEnabled()
})
