import { render, screen, cleanup, within } from '@testing-library/react'
import { test, expect, vi, afterEach } from 'vitest'

const h = vi.hoisted(() => ({ fetchUserDossier: vi.fn() }))
vi.mock('../../lib/dossierApi', () => ({ fetchUserDossier: (...a) => h.fetchUserDossier(...a) }))

const UserDossier = (await import('./UserDossier')).default

afterEach(() => { cleanup(); h.fetchUserDossier.mockReset() })

const WIN_CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const dossier = (over = {}) => ({
  joined_at: '2026-11-04T14:00:00Z',
  sign_in: { providers: ['google'], passkeys: 0 },
  user_agents: [WIN_CHROME],
  arrival: null,
  first: { kind: 'story', title: 'Little Bird', created_at: '2026-11-04T14:03:31Z' },
  wrote: { story: 1, thread: 0, reply: 0, ritual: 0, critique: 0 },
  responses: { count: 0, first_at: null },
  first_piece: { kind: 'story', title: 'Little Bird', created_at: '2026-11-04T14:03:31Z', first_response_at: null },
  seen_days: ['2026-11-04'],
  last: { what: 'story', title: 'Little Bird', at: '2026-11-04T14:03:31Z' },
  errors: [],
  error_count: 0,
  tickets: { total: 0, open: 0 },
  steps: [],
  ...over,
})

const error = (id, over = {}) => ({
  id, created_at: '2026-11-04T14:11:22Z', kind: 'window', message: 'Minified React error #418',
  action: null, status: null, code: null, url: 'https://horrorwriter.org/?utm_source=chatgpt.com', user_agent: WIN_CHROME, ...over,
})

test('says it is loading, then shows the eight lines in order', async () => {
  h.fetchUserDossier.mockResolvedValue(dossier())
  render(<UserDossier userId="u1" handle="capt_yugoslavia" />)
  expect(screen.getByText('Compiling the dossier…')).toBeInTheDocument()
  await screen.findByText('Arrived')
  expect(h.fetchUserDossier).toHaveBeenCalledWith('u1')
  expect(screen.getAllByRole('term').map((t) => t.textContent)).toEqual([
    'Arrived', 'First visit', 'Wrote', 'Got back', 'Gave', 'Came back', 'Stopped at', 'Trouble',
  ])
  expect(screen.getByText('published a story 3 min 31 s after joining')).toBeInTheDocument()
  expect(screen.getByText('1 story · 0 forum posts · 0 Ritual entries')).toBeInTheDocument()
})

test('a member from before arrivals were recorded reads "source not recorded"', async () => {
  h.fetchUserDossier.mockResolvedValue(dossier())
  render(<UserDossier userId="u1" handle="capt_yugoslavia" />)
  expect(await screen.findByText('source not recorded')).toBeInTheDocument()
})

test('an arrival is shown under Arrived', async () => {
  h.fetchUserDossier.mockResolvedValue(dossier({
    arrival: { source_tag: 'chatgpt.com', referrer_host: null, landing_path: '/', found_via: 'a friend told me', asked_at: '2026-11-04T15:00:00Z' },
  }))
  render(<UserDossier userId="u1" handle="capt_yugoslavia" />)
  expect(await screen.findByText('tagged chatgpt.com · landed on / · “a friend told me”')).toBeInTheDocument()
})

test('lists their errors as problems with a link to Site Errors for this member', async () => {
  h.fetchUserDossier.mockResolvedValue(dossier({
    errors: [error(3), error(2), error(1, { kind: 'request', message: 'duplicate key', action: 'series_books:insert', status: 409, code: '23505', url: 'https://horrorwriter.org/my-stories/' })],
    error_count: 3,
    tickets: { total: 1, open: 1 },
  }))
  render(<UserDossier userId="u1" handle="capt_yugoslavia" />)
  await screen.findByText('3 errors logged · 1 ticket (1 open)')
  const problems = screen.getAllByTestId('dossier-problem')
  expect(problems).toHaveLength(2)
  const crash = problems.find((p) => p.textContent.includes('Page crashed'))
  expect(crash).toHaveTextContent('Page crashed: Minified React error #418')
  expect(crash).toHaveTextContent('2×')
  expect(crash).toHaveTextContent('Windows, Chrome')
  // A page is a path: the tag on that old row's address is not shown.
  expect(crash.textContent).not.toContain('utm_source')
  expect(problems.find((p) => p.textContent.includes("Couldn't add to series books (duplicate entry)"))).toBeTruthy()
  expect(screen.getByRole('link', { name: 'See these in Site Errors' })).toHaveAttribute('href', '/admin/?tab=errors&member=u1')
  expect(screen.getByRole('link', { name: 'Open the work queue' })).toHaveAttribute('href', '/admin/?tab=queue')
})

test('more errors than are listed says so', async () => {
  h.fetchUserDossier.mockResolvedValue(dossier({ errors: [error(1)], error_count: 40 }))
  render(<UserDossier userId="u1" handle="capt_yugoslavia" />)
  expect(await screen.findByText('The most recent 1 of 40.')).toBeInTheDocument()
})

test('no errors and no tickets shows no links', async () => {
  h.fetchUserDossier.mockResolvedValue(dossier())
  render(<UserDossier userId="u1" handle="capt_yugoslavia" />)
  await screen.findByText('none on record')
  expect(screen.queryByRole('link')).toBeNull()
  expect(screen.queryByTestId('dossier-problem')).toBeNull()
})

test('a failed load says so', async () => {
  h.fetchUserDossier.mockRejectedValue(new Error('Only a keeper can open a dossier'))
  render(<UserDossier userId="u1" handle="capt_yugoslavia" />)
  expect(await screen.findByText('Could not load the dossier: Only a keeper can open a dossier')).toBeInTheDocument()
})

test('an unknown member says so', async () => {
  h.fetchUserDossier.mockResolvedValue(null)
  render(<UserDossier userId="nobody" handle="nobody" />)
  expect(await screen.findByText('No such member.')).toBeInTheDocument()
})

test("a member's answer containing markup is shown as text", async () => {
  h.fetchUserDossier.mockResolvedValue(dossier({
    arrival: { source_tag: null, referrer_host: null, landing_path: null, found_via: '<img src=x onerror=alert(1)>', asked_at: '2026-11-04T15:00:00Z' },
  }))
  render(<UserDossier userId="u1" handle="capt_yugoslavia" />)
  expect(await screen.findByText('“<img src=x onerror=alert(1)>”')).toBeInTheDocument()
  expect(document.querySelector('img')).toBeNull()
})

test('changing member loads the new one', async () => {
  h.fetchUserDossier.mockResolvedValue(dossier())
  const { rerender } = render(<UserDossier userId="u1" handle="a" />)
  await screen.findByText('Arrived')
  rerender(<UserDossier userId="u2" handle="b" />)
  expect(h.fetchUserDossier).toHaveBeenLastCalledWith('u2')
  await screen.findByText('Arrived')
  expect(within(document.body).getAllByRole('term')).toHaveLength(8)
})
