import { render, cleanup, act, fireEvent } from '@testing-library/react'
import { test, expect, vi, afterEach } from 'vitest'

// AuthContext replaces the session and profile objects on every auth event,
// including the hourly token refresh. Tearing down and re-creating the
// global:lobby channel on each one froze presence, so the channel must only be
// rebuilt when the user or their handle actually changes.

let authState = {
  session: { user: { id: 'u1' }, access_token: 't1' },
  profile: { handle: 'night-owl' },
}
vi.mock('../components/AuthContext', () => ({
  AuthProvider: ({ children }) => children,
  useAuth: () => authState,
}))

const fakeChannel = () => {
  const ch = {
    on: vi.fn(() => ch),
    subscribe: vi.fn(() => ch),
    track: vi.fn(),
    unsubscribe: vi.fn(),
    presenceState: () => ({}),
  }
  return ch
}
const channel = vi.fn(fakeChannel)
const removeChannel = vi.fn()
let categoryRows = []
const query = { select: () => query, order: () => query, then: (r) => r({ data: categoryRows, error: null }) }
// Threads the list should show; empty unless a test fills it.
let threadRows = []
let entryCountRows = []
const threadQuery = {
  select: (cols) => {
    if (typeof cols === 'string' && cols.includes('posts(count)')) {
      const countChain = {
        in: () => countChain,
        is: () => countChain,
        not: () => countChain,
        then: (r) => r({ data: entryCountRows, error: null }),
      }
      return countChain
    }
    return threadQuery
  },
  order: () => threadQuery,
  then: (r) => r({ data: threadRows, error: null }),
}
vi.mock('../supabaseClient', () => ({
  supabase: {
    channel: (...a) => channel(...a),
    removeChannel: (...a) => removeChannel(...a),
    from: (table) => (table === 'threads' ? threadQuery : query),
  },
}))

const Forum = (await import('./Forum')).default

afterEach(() => cleanup())

test('a token refresh does not rebuild the lobby channel', async () => {
  const { rerender } = render(<Forum />)
  expect(channel).toHaveBeenCalledTimes(1)

  // Same user and handle, new objects: what TOKEN_REFRESHED produces.
  authState = {
    session: { user: { id: 'u1' }, access_token: 't2' },
    profile: { handle: 'night-owl' },
  }
  rerender(<Forum />)
  await act(async () => { await Promise.resolve() })

  expect(channel).toHaveBeenCalledTimes(1)
})

test('leaving the page removes the channel from the client', () => {
  channel.mockClear()
  removeChannel.mockClear()
  const { unmount } = render(<Forum />)
  const created = channel.mock.results[0].value
  unmount()
  expect(removeChannel).toHaveBeenCalledWith(created)
})

test('a thread with one reply says "reply", not "replies"', async () => {
  threadRows = [
    { id: 't1', title: 'Hello there', category_id: 'notice', replies_count: 1, profiles: { handle: 'beetlebub' }, updated_at: new Date().toISOString() },
    { id: 't2', title: 'Second', category_id: 'notice', replies_count: 3, profiles: { handle: 'beetlebub' }, updated_at: new Date().toISOString() },
  ]
  const { findByText, getByText } = render(<Forum />)
  expect((await findByText('Hello there')).closest('a').textContent).toMatch(/1\s*reply$/i)
  expect(getByText('Second').closest('a').textContent).toMatch(/3\s*replies$/i)
  threadRows = []
})

test('hides the server-rendered #forum-ssr-directory once hydrated', () => {
  const nav = document.createElement('nav')
  nav.id = 'forum-ssr-directory'
  document.body.appendChild(nav)

  const { unmount } = render(<Forum />)
  expect(nav.classList.contains('hidden')).toBe(true)

  unmount()
  expect(nav.classList.contains('hidden')).toBe(false)
  nav.remove()
})

test('renders purposeful category labels, room banner, and real Ritual entry counts', async () => {
  categoryRows = [
    { id: 'rituals', name: 'Midnight Rituals Critique Room', sort_order: 0 },
    { id: 'crypt', name: 'The Crypt · Critique', sort_order: 1 },
    { id: 'coven', name: 'Notice Board · Announcements', sort_order: 5 },
  ]
  threadRows = [
    {
      id: 't-ritual',
      title: 'Horror Writing Prompt: The wooden effigy',
      category_id: 'rituals',
      prompt_id: 'p-1',
      replies_count: 12,
      profiles: null,
      updated_at: new Date().toISOString(),
    },
  ]
  entryCountRows = [
    { prompt_id: 'p-1', posts: [{ count: 7 }] },
  ]

  const { findByText, getByTestId, queryByText } = render(<Forum />)

  // Sidebar shows 'First Lines & Snags' instead of 'The Crypt'
  const workshopItem = await findByText('First Lines & Snags')
  expect(workshopItem).toBeTruthy()

  // Sidebar Rituals count reflects the 7 story entries, not 1 thread
  const ritualsItem = await findByText('Midnight Rituals')
  expect(ritualsItem.closest('li').textContent).toContain('7')

  // Selecting 'First Lines & Snags' reveals its purpose banner and New Thread ?cat=crypt link
  fireEvent.click(workshopItem.closest('li'))
  expect(getByTestId('category-purpose-banner').textContent).toMatch(/opening 250 words/i)
  expect(await findByText('New Thread')).toHaveAttribute('href', '/forum/new/?cat=crypt')

  // Selecting 'Notice Board' (coven) as a regular member hides New Thread
  const noticeItem = await findByText('Notice Board')
  fireEvent.click(noticeItem.closest('li'))
  expect(queryByText('New Thread')).toBeNull()
  expect(await findByText(/Official dispatches from the Keeper appear here/i)).toBeTruthy()

  categoryRows = []
  threadRows = []
  entryCountRows = []
})
