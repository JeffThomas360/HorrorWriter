import { render, cleanup, act } from '@testing-library/react'
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
const query = { select: () => query, order: () => query, then: (r) => r({ data: [], error: null }) }
vi.mock('../supabaseClient', () => ({
  supabase: {
    channel: (...a) => channel(...a),
    removeChannel: (...a) => removeChannel(...a),
    from: () => query,
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
