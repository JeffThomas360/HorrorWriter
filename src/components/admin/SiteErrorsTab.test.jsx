import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { test, expect, vi, afterEach } from 'vitest'

const h = vi.hoisted(() => ({ fetchSiteErrors: vi.fn() }))
vi.mock('../../lib/siteErrorsApi', () => ({ fetchSiteErrors: h.fetchSiteErrors, SITE_ERRORS_LIMIT: 2000 }))
vi.mock('../mod/UserModProfile', () => ({
  default: ({ userId, onClose }) => (
    <div><p>case file {userId}</p><button onClick={onClose}>close</button></div>
  ),
}))

const SiteErrorsTab = (await import('./SiteErrorsTab')).default

function renderIt() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={qc}><SiteErrorsTab /></QueryClientProvider>)
}

afterEach(() => { cleanup(); h.fetchSiteErrors.mockReset() })

const ANDROID = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36'
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Version/18.1 Mobile/15E148 Safari/604.1'

let nextId = 1
const row = (over = {}) => ({
  id: nextId++, created_at: '2026-11-11T10:00:00Z', kind: 'request',
  message: 'duplicate key value violates unique constraint "series_books_pkey"',
  stack: null, url: 'https://horrorwriter.org/my-stories/', user_agent: ANDROID,
  user_id: 'u1', action: 'series_books:insert', status: 409, code: '23505', ...over,
})
const shown = (over = {}) => row({
  kind: 'shown', action: null, status: null, code: null, user_agent: IPHONE,
  message: 'Message must be at least 25 characters.', url: 'https://horrorwriter.org/help/', ...over,
})
const crash = (over = {}) => row({
  kind: 'window', action: null, status: null, code: null,
  message: 'Minified React error #418', url: 'https://horrorwriter.org/?utm_source=chatgpt.com',
  stack: 'Error: Minified React error #418\n    at hydrate (client.js:1:1)', ...over,
})

const SERIES = "Couldn't add to series books (duplicate entry)"
const SHOWN = 'Message shown: Message must be at least 25 characters.'
const CRASH = 'Page crashed: Minified React error #418'

const standard = () => ({
  rows: [
    row({ created_at: '2026-11-11T10:00:00Z' }),
    row({ created_at: '2026-11-11T10:05:00Z' }),
    shown({ created_at: '2026-11-09T08:00:00Z', user_id: 'u2' }),
    shown({ created_at: '2026-11-09T09:00:00Z', user_id: null }),
    crash({ created_at: '2026-11-05T00:00:00Z', user_id: null }),
  ],
  handles: { u1: 'writer', u2: 'reader' },
  capped: false,
})

const problemButton = (title) => screen.getByRole('button', { name: new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })
const titles = () => screen.getAllByTestId('problem-title').map((el) => el.textContent)

test('shows the summary and one line per problem, newest first', async () => {
  h.fetchSiteErrors.mockResolvedValue(standard())
  renderIt()
  expect(await screen.findByText('3 problems · 2 members affected · 5 occurrences')).toBeInTheDocument()
  expect(titles()).toEqual([SERIES, SHOWN, CRASH])
  expect(problemButton(SERIES)).toHaveTextContent('2×')
  expect(problemButton(SERIES)).toHaveAttribute('aria-expanded', 'false')
  expect(problemButton(SERIES)).toHaveTextContent('1 member · /my-stories/ · Android, Chrome')
  expect(problemButton(SHOWN)).toHaveTextContent('1 member, 1 signed out · /help/ · iPhone, Safari')
  expect(problemButton(CRASH)).toHaveTextContent('1 signed out · / · Android, Chrome')
})

test('singular words when there is one of each', async () => {
  h.fetchSiteErrors.mockResolvedValue({ rows: [row()], handles: { u1: 'writer' }, capped: false })
  renderIt()
  expect(await screen.findByText('1 problem · 1 member affected · 1 occurrence')).toBeInTheDocument()
})

test('asks for 7 days first, and refetches when the window changes', async () => {
  h.fetchSiteErrors.mockResolvedValue(standard())
  renderIt()
  await screen.findByText(/3 problems/)
  expect(h.fetchSiteErrors).toHaveBeenCalledTimes(1)
  expect(h.fetchSiteErrors.mock.calls[0][0]).toBe(168)
  expect(screen.getByLabelText('Time window')).toHaveValue('7d')
  fireEvent.change(screen.getByLabelText('Time window'), { target: { value: '24h' } })
  await waitFor(() => expect(h.fetchSiteErrors).toHaveBeenCalledTimes(2))
  expect(h.fetchSiteErrors.mock.calls[1][0]).toBe(24)
})

test('the kind filter narrows without refetching', async () => {
  h.fetchSiteErrors.mockResolvedValue(standard())
  renderIt()
  await screen.findByText(/3 problems/)
  fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'shown' } })
  expect(titles()).toEqual([SHOWN])
  expect(screen.getByText('1 problem · 1 member affected · 2 occurrences')).toBeInTheDocument()
  expect(h.fetchSiteErrors).toHaveBeenCalledTimes(1)
})

test('the member filter lists the members in the log by handle, and narrows to one', async () => {
  h.fetchSiteErrors.mockResolvedValue(standard())
  renderIt()
  await screen.findByText(/3 problems/)
  const select = screen.getByLabelText('Member')
  expect([...select.options].map((o) => o.textContent)).toEqual(['All members', '@reader', '@writer'])
  fireEvent.change(select, { target: { value: 'u2' } })
  expect(titles()).toEqual([SHOWN])
  expect(screen.getByText('1 problem · 1 member affected · 1 occurrence')).toBeInTheDocument()
})

test('opening a problem shows its pages, devices, raw action, status and code, and its occurrences', async () => {
  h.fetchSiteErrors.mockResolvedValue({
    rows: [
      row({ created_at: '2026-11-11T10:00:00Z' }),
      row({ created_at: '2026-11-11T10:05:00Z', url: 'https://horrorwriter.org/publish/', user_agent: IPHONE }),
    ],
    handles: { u1: 'writer' },
    capped: false,
  })
  renderIt()
  await screen.findByText(/1 problem/)
  fireEvent.click(problemButton(SERIES))
  expect(problemButton(SERIES)).toHaveAttribute('aria-expanded', 'true')
  const detail = screen.getByTestId('problem-detail')
  expect(detail).toHaveTextContent('/my-stories/ (1)')
  expect(detail).toHaveTextContent('/publish/ (1)')
  expect(detail).toHaveTextContent('Android, Chrome (1)')
  expect(detail).toHaveTextContent('iPhone, Safari (1)')
  expect(detail).toHaveTextContent('series_books:insert')
  expect(detail).toHaveTextContent('409')
  expect(detail).toHaveTextContent('23505')
  expect(detail).toHaveTextContent('duplicate key value violates unique constraint "series_books_pkey"')
  expect(within(detail).getAllByTestId('occurrence')).toHaveLength(2)
  fireEvent.click(problemButton(SERIES))
  expect(screen.queryByTestId('problem-detail')).toBeNull()
})

test('a stack trace is inside a closed details element', async () => {
  h.fetchSiteErrors.mockResolvedValue({ rows: [crash({ user_id: null })], handles: {}, capped: false })
  renderIt()
  await screen.findByText(/1 problem/)
  fireEvent.click(problemButton(CRASH))
  const summary = screen.getByText('Stack trace')
  const details = summary.closest('details')
  expect(details).not.toBeNull()
  expect(details.open).toBe(false)
  expect(details).toHaveTextContent('at hydrate (client.js:1:1)')
})

test('clicking a member opens their case file, and Back returns with the filters kept', async () => {
  h.fetchSiteErrors.mockResolvedValue(standard())
  renderIt()
  await screen.findByText(/3 problems/)
  fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'request' } })
  fireEvent.click(problemButton(SERIES))
  fireEvent.click(screen.getAllByRole('button', { name: 'Open case file for @writer' })[0])
  expect(screen.getByText('case file u1')).toBeInTheDocument()
  expect(screen.queryByLabelText('Kind')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '← Back to Site Errors' }))
  expect(screen.queryByText('case file u1')).toBeNull()
  expect(screen.getByLabelText('Kind')).toHaveValue('request')
  expect(titles()).toEqual([SERIES])
  expect(h.fetchSiteErrors).toHaveBeenCalledTimes(1)
})

test('a member with no readable profile reads "a member" and still opens the case file', async () => {
  h.fetchSiteErrors.mockResolvedValue({ rows: [row({ user_id: 'gone' })], handles: {}, capped: false })
  renderIt()
  await screen.findByText('1 problem · 1 member affected · 1 occurrence')
  expect([...screen.getByLabelText('Member').options].map((o) => o.textContent)).toEqual(['All members', 'a member'])
  fireEvent.click(problemButton(SERIES))
  fireEvent.click(screen.getByRole('button', { name: 'Open case file for a member' }))
  expect(screen.getByText('case file gone')).toBeInTheDocument()
})

test('a signed-out occurrence reads "signed out" and is not a button', async () => {
  h.fetchSiteErrors.mockResolvedValue({ rows: [shown({ user_id: null })], handles: {}, capped: false })
  renderIt()
  await screen.findByText(/1 problem/)
  fireEvent.click(problemButton(SHOWN))
  const occurrence = screen.getByTestId('occurrence')
  expect(occurrence).toHaveTextContent('signed out')
  expect(within(occurrence).queryByRole('button')).toBeNull()
})

test('an empty window says nothing went wrong', async () => {
  h.fetchSiteErrors.mockResolvedValue({ rows: [], handles: {}, capped: false })
  renderIt()
  expect(await screen.findByText('Nothing went wrong in this window.')).toBeInTheDocument()
  expect(screen.getByLabelText('Time window')).toBeInTheDocument()
})

test('filters that leave nothing say so and stay usable', async () => {
  h.fetchSiteErrors.mockResolvedValue({ rows: [row()], handles: { u1: 'writer' }, capped: false })
  renderIt()
  await screen.findByText(/1 problem/)
  fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'crash' } })
  expect(screen.getByText('Nothing matches those filters.')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'all' } })
  expect(titles()).toEqual([SERIES])
})

test('a capped fetch says how many entries are shown', async () => {
  h.fetchSiteErrors.mockResolvedValue({ rows: [row()], handles: { u1: 'writer' }, capped: true })
  renderIt()
  expect(await screen.findByText('Showing the most recent 2000 entries in this window; older ones are not counted.')).toBeInTheDocument()
})

test('an uncapped fetch does not mention a cap', async () => {
  h.fetchSiteErrors.mockResolvedValue({ rows: [row()], handles: { u1: 'writer' }, capped: false })
  renderIt()
  await screen.findByText(/1 problem/)
  expect(screen.queryByText(/most recent 2000/)).toBeNull()
})

test('a failed fetch shows the error', async () => {
  h.fetchSiteErrors.mockRejectedValue(new Error('denied'))
  renderIt()
  expect(await screen.findByText('Could not load the error log: denied')).toBeInTheDocument()
})

test('rows with no action, status, code, url, user agent or stack render without crashing', async () => {
  h.fetchSiteErrors.mockResolvedValue({
    rows: [{ id: 900, created_at: '2026-10-21T00:00:00Z', kind: 'window', message: 'old crash', stack: null, url: null, user_agent: null, user_id: null }],
    handles: {},
    capped: false,
  })
  renderIt()
  await screen.findByText(/1 problem/)
  expect(problemButton('Page crashed: old crash')).toHaveTextContent('1 signed out · unknown page · Unknown device')
  fireEvent.click(problemButton('Page crashed: old crash'))
  expect(screen.getByTestId('problem-detail')).toHaveTextContent('unknown page (1)')
  expect(screen.queryByText('Stack trace')).toBeNull()
})

test('a page is shown as its path, never with a query string', async () => {
  h.fetchSiteErrors.mockResolvedValue({ rows: [crash({ user_id: null })], handles: {}, capped: false })
  renderIt()
  await screen.findByText(/1 problem/)
  fireEvent.click(problemButton(CRASH))
  expect(document.body.textContent).not.toContain('utm_source')
})

test('a message containing markup is shown as text', async () => {
  h.fetchSiteErrors.mockResolvedValue({
    rows: [shown({ message: '<img src=x onerror=alert(1)>', user_id: null })],
    handles: {},
    capped: false,
  })
  renderIt()
  await screen.findByText(/1 problem/)
  expect(screen.getByTestId('problem-title')).toHaveTextContent('Message shown: <img src=x onerror=alert(1)>')
  expect(document.querySelector('img')).toBeNull()
})
