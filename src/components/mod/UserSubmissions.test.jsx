import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { test, expect, vi, beforeEach, afterEach } from 'vitest'

// Only the network edge is faked: the component and lib/submissions run for real.
const h = vi.hoisted(() => ({ rows: [], error: null, calls: [] }))

vi.mock('../../supabaseClient', () => ({
  supabase: {
    rpc: (name, args) => {
      h.calls.push({ name, args })
      return Promise.resolve({ data: h.error ? null : h.rows, error: h.error })
    },
  },
}))

const UserSubmissions = (await import('./UserSubmissions')).default

const STORY = {
  kind: 'story', id: 's1', story_id: 's1', title: 'The House on Marrow Lane', created_at: '2026-10-28T12:00:00Z',
  mod_status: 'live', critiques: 2, edits: 3, edits_is_minimum: false, reports: 0,
}
const HIDDEN_STORY = {
  ...STORY, id: 's2', story_id: 's2', title: 'Tunnel Static', created_at: '2026-10-03T12:00:00Z',
  mod_status: 'hidden', critiques: 0, edits: 0, reports: 2,
}
const RITUAL = {
  kind: 'ritual', id: 'p1', thread_id: 't1', title: 'Salt', context_title: 'Something answers the baby monitor',
  created_at: '2026-11-02T12:00:00Z', mod_status: 'screening', critiques: 1, edits: 1, edits_is_minimum: true, reports: 1,
}
const REPLY = {
  kind: 'reply', id: 'p2', thread_id: 't2', excerpt: 'I would start with the ending…',
  context_title: 'Where do you get your endings?', created_at: '2026-10-30T12:00:00Z', mod_status: 'live', reports: 0,
}
const CRITIQUE = {
  kind: 'critique', id: 'c1', story_id: 's9', excerpt: 'The second act drags…', context_title: 'The Long Hallway',
  context_kind: 'story', created_at: '2026-11-01T12:00:00Z', mod_status: 'live', reports: 0,
}
const RITUAL_CRITIQUE = {
  kind: 'critique', id: 'p3', thread_id: 't1', excerpt: 'Loved the last line…', context_title: 'Bone Orchard',
  context_kind: 'ritual', created_at: '2026-10-26T12:00:00Z', mod_status: 'live', reports: 0,
}

beforeEach(() => {
  h.rows = [STORY, HIDDEN_STORY, RITUAL, REPLY, CRITIQUE, RITUAL_CRITIQUE]
  h.error = null
  h.calls = []
})
afterEach(() => cleanup())

const open = async (props = {}) => {
  render(<UserSubmissions userId="target" {...props} />)
  await screen.findByRole('tablist', { name: 'Submission types' })
}
const pick = (name) => fireEvent.click(screen.getByRole('tab', { name }))
const headings = () => within(screen.getByRole('table')).getAllByRole('columnheader').map((c) => c.textContent)

test('asks the server for this member\'s submissions', async () => {
  await open()
  expect(h.calls).toEqual([{ name: 'mod_user_submissions', args: { p_user: 'target' } }])
})

test('every sub-tab shows its count, including an empty one', async () => {
  await open()
  expect(screen.getByRole('tab', { name: 'Stories 2' })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: 'Rituals 1' })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: 'Threads 0' })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: 'Replies 1' })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: 'Critiques 2' })).toBeInTheDocument()
})

test('the summary line gives the first and last post, what is flagged, and the reports', async () => {
  await open()
  const summary = screen.getByTestId('submissions-summary')
  expect(summary).toHaveTextContent('First post Oct 3, 2026')
  expect(summary).toHaveTextContent('Last post Nov 2, 2026')
  expect(summary).toHaveTextContent('1 hidden')
  expect(summary).toHaveTextContent('1 in screening')
  expect(summary).toHaveTextContent('3 reports')
})

test('the summary leaves out flags a member does not have', async () => {
  h.rows = [STORY]
  await open()
  const summary = screen.getByTestId('submissions-summary')
  expect(summary).not.toHaveTextContent('hidden')
  expect(summary).not.toHaveTextContent('screening')
  expect(summary).not.toHaveTextContent('report')
})

test('opens on the first sub-tab that has anything in it', async () => {
  h.rows = [REPLY]
  await open()
  expect(screen.getByRole('tab', { name: 'Replies 1' })).toHaveAttribute('aria-selected', 'true')
})

test('stories and Ritual entries have an edits column', async () => {
  await open()
  expect(headings()).toEqual(['Title', 'Posted', 'Critiques', 'Edits', 'Reports', 'Status'])
  pick('Rituals 1')
  expect(headings()).toEqual(['Entry', 'Posted', 'Critiques', 'Edits', 'Reports', 'Status'])
})

test('threads count replies, and neither replies nor critiques have an edits column', async () => {
  h.rows = [{ kind: 'thread', id: 't1', thread_id: 't1', title: 'Hi', created_at: STORY.created_at, mod_status: 'live', replies: 4, reports: 0 }, REPLY, CRITIQUE]
  await open()
  pick('Threads 1')
  expect(headings()).toEqual(['Title', 'Posted', 'Replies', 'Reports', 'Status'])
  pick('Replies 1')
  expect(headings()).toEqual(['Reply', 'Posted', 'Reports', 'Status'])
  pick('Critiques 1')
  expect(headings()).toEqual(['Critique', 'Posted', 'Reports', 'Status'])
})

test('a hidden story shows its status and its reports', async () => {
  await open()
  const row = within(screen.getByRole('table')).getByRole('link', { name: 'Tunnel Static' }).closest('tr')
  expect(row).toHaveTextContent('Hidden')
  expect(row).toHaveTextContent('2')
})

test('an edit made before counting began shows as a minimum', async () => {
  await open()
  pick('Rituals 1')
  const row = within(screen.getByRole('table')).getByRole('link', { name: 'Salt' }).closest('tr')
  expect(row).toHaveTextContent('1+')
  expect(row).toHaveTextContent('Prompt: Something answers the baby monitor')
  expect(row).toHaveTextContent('In screening')
})

test('a reply shows an excerpt and the thread it answered', async () => {
  await open()
  pick('Replies 1')
  const link = within(screen.getByRole('table')).getByRole('link', { name: 'I would start with the ending…' })
  expect(link).toHaveAttribute('href', '/forum/thread/t2/#post-p2')
  expect(link.closest('tr')).toHaveTextContent('in Where do you get your endings?')
})

test('critiques say whether they were on a story or a Ritual entry', async () => {
  await open()
  pick('Critiques 2')
  const table = within(screen.getByRole('table'))
  expect(table.getByRole('link', { name: 'The second act drags…' }).closest('tr')).toHaveTextContent('on The Long Hallway (story)')
  expect(table.getByRole('link', { name: 'Loved the last line…' }).closest('tr')).toHaveTextContent('on Bone Orchard (Ritual)')
})

test('links open in a new tab so the case file stays open', async () => {
  await open()
  const link = within(screen.getByRole('table')).getByRole('link', { name: 'Tunnel Static' })
  expect(link).toHaveAttribute('target', '_blank')
  expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
})

test('the stacked layout for narrow panels carries the same details in words', async () => {
  await open()
  const list = within(screen.getByTestId('submissions-stacked'))
  const row = list.getByRole('link', { name: 'The House on Marrow Lane' }).closest('li')
  expect(row).toHaveTextContent('2 critiques')
  expect(row).toHaveTextContent('3 edits')
  expect(row).toHaveTextContent('Live')
  expect(row).not.toHaveTextContent('report')
  expect(list.getByRole('link', { name: 'Tunnel Static' }).closest('li')).toHaveTextContent('2 reports')
})

test('the stacked layout uses the singular for one', async () => {
  h.rows = [{ ...STORY, critiques: 1, edits: 1, reports: 1 }]
  await open()
  const row = within(screen.getByTestId('submissions-stacked')).getByRole('link', { name: STORY.title }).closest('li')
  expect(row).toHaveTextContent('1 critique ·')
  expect(row).toHaveTextContent('1 edit ·')
  expect(row).toHaveTextContent('1 report ·')
})

test('the stacked layout reads naturally for an edit count that is a minimum', async () => {
  h.rows = [RITUAL]
  await open()
  const row = within(screen.getByTestId('submissions-stacked')).getByRole('link', { name: 'Salt' }).closest('li')
  expect(row).toHaveTextContent('1+ edits')
})

test('an empty sub-tab says so instead of drawing an empty table', async () => {
  await open()
  pick('Threads 0')
  expect(screen.queryByRole('table')).toBeNull()
  expect(screen.getByText('No threads from this member.')).toBeInTheDocument()
})

test('a member with nothing at all gets one plain line', async () => {
  h.rows = []
  await open()
  expect(screen.getByTestId('submissions-summary')).toHaveTextContent('Nothing on the site from this member right now.')
})

test('warns that a suspended member\'s work is hidden even when rows read Live', async () => {
  await open({ bannedUntil: new Date(Date.now() + 7 * 86400000).toISOString() })
  expect(screen.getByRole('status')).toHaveTextContent(/^Suspended until .*Readers can.t see any of this while the suspension runs, including rows marked Live\.$/)
})

test('a permanent ban gets its own wording', async () => {
  await open({ bannedUntil: '2099-12-31T23:59:59Z' })
  expect(screen.getByRole('status')).toHaveTextContent(/^Permanently banned\. Readers can.t see any of this, including rows marked Live\.$/)
})

test('no warning once a suspension has ended', async () => {
  await open({ bannedUntil: new Date(Date.now() - 86400000).toISOString() })
  expect(screen.queryByRole('status')).toBeNull()
})

test('a failed load says so rather than showing an empty record', async () => {
  h.error = { message: 'boom' }
  render(<UserSubmissions userId="target" />)
  expect(await screen.findByText(/Could not load submissions: boom/)).toBeInTheDocument()
  expect(screen.queryByRole('tablist')).toBeNull()
})

test('arrow keys move between sub-tabs', async () => {
  await open()
  fireEvent.keyDown(screen.getByRole('tab', { name: 'Stories 2' }), { key: 'ArrowRight' })
  expect(screen.getByRole('tab', { name: 'Rituals 1' })).toHaveAttribute('aria-selected', 'true')
})
