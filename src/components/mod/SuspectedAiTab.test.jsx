import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { test, expect, vi, afterEach, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ fetchSuspected: vi.fn() }))
vi.mock('../../supabaseClient', () => ({ supabase: null }))
vi.mock('../../lib/aiSuspicion', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchSuspected: (...a) => h.fetchSuspected(...a),
}))

const { EVIDENCE_CAVEAT } = await import('../../lib/aiSuspicion')
const SuspectedAiTab = (await import('./SuspectedAiTab')).default

const STORY = {
  target_type: 'story', target_id: 's1', author_id: 'u1', author_handle: 'capt_yugoslavia',
  title: 'The Lighthouse', story_id: 's1', thread_id: null, note: 'opens with "Certainly!"',
  tagged_by_handle: 'warden_w', tagged_at: '2026-11-24T10:00:00Z', machine_score: 0.91,
}
const POST = {
  target_type: 'post', target_id: 'p1', author_id: 'u2', author_handle: 'mr.briliant',
  title: 'I would start with the ending', story_id: null, thread_id: 't1', note: null,
  tagged_by_handle: null, tagged_at: '2026-11-23T10:00:00Z', machine_score: null,
}

beforeEach(() => { h.fetchSuspected.mockResolvedValue([STORY, POST]) })
afterEach(() => { cleanup(); vi.clearAllMocks() })

const rows = () => screen.getAllByRole('listitem')

test('lists what is tagged: the title linked, the member, the note, who tagged it and when', async () => {
  render(<SuspectedAiTab />)
  const link = await screen.findByRole('link', { name: 'The Lighthouse' })
  expect(link).toHaveAttribute('href', '/library/read/s1/')
  expect(link).toHaveAttribute('target', '_blank')

  const story = within(rows()[0])
  expect(story.getByText('@capt_yugoslavia')).toBeInTheDocument()
  expect(story.getByText('opens with "Certainly!"')).toBeInTheDocument()
  expect(story.getByText(/tagged by @warden_w/)).toBeInTheDocument()
  expect(story.getByText(/Nov 24, 2026/)).toBeInTheDocument()
  expect(story.getByText('Machine score 0.91')).toBeInTheDocument()
})

test('a post links to its place in the thread and shows no machine score', async () => {
  render(<SuspectedAiTab />)
  expect(await screen.findByRole('link', { name: 'I would start with the ending' }))
    .toHaveAttribute('href', '/forum/thread/t1/#post-p1')
  const post = within(rows()[1])
  expect(post.queryByText(/Machine score/)).toBeNull()
  expect(post.getByText('No note left.')).toBeInTheDocument()
})

test('says once what the evidence is worth', async () => {
  render(<SuspectedAiTab />)
  await screen.findByRole('link', { name: 'The Lighthouse' })
  expect(screen.getAllByText(EVIDENCE_CAVEAT)).toHaveLength(1)
})

test('says so when nothing is tagged', async () => {
  h.fetchSuspected.mockResolvedValue([])
  render(<SuspectedAiTab />)
  expect(await screen.findByText('Nothing is tagged.')).toBeInTheDocument()
})

test('the member box narrows the list by handle', async () => {
  render(<SuspectedAiTab />)
  await screen.findByRole('link', { name: 'The Lighthouse' })
  fireEvent.change(screen.getByLabelText('Filter by member'), { target: { value: 'BRIL' } })
  expect(screen.queryByRole('link', { name: 'The Lighthouse' })).toBeNull()
  expect(screen.getByRole('link', { name: 'I would start with the ending' })).toBeInTheDocument()

  fireEvent.change(screen.getByLabelText('Filter by member'), { target: { value: 'nobody' } })
  expect(screen.getByText('Nothing tagged from a member matching "nobody".')).toBeInTheDocument()
})

test('a failed load says so rather than showing an empty list', async () => {
  h.fetchSuspected.mockRejectedValue(new Error('offline'))
  render(<SuspectedAiTab />)
  expect(await screen.findByText(/Could not load the tagged list: offline/)).toBeInTheDocument()
  expect(screen.queryByText('Nothing is tagged.')).toBeNull()
})
