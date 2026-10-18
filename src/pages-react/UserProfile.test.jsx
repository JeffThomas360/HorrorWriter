import { renderToString } from 'react-dom/server'
import { test, expect, vi } from 'vitest'

// The profile page passes the server-side lookup in as initialProfile, so the
// server HTML must carry the writer's name and bio, not a loading placeholder.

const getProfileByHandle = vi.fn(() => new Promise(() => {}))
vi.mock('../lib/profile', () => ({ getProfileByHandle: (...a) => getProfileByHandle(...a) }))
vi.mock('../lib/blocking', () => ({ isBlocked: () => Promise.resolve(false), blockUser: vi.fn(), unblockUser: vi.fn() }))
vi.mock('../components/AuthContext', () => ({
  AuthProvider: ({ children }) => children,
  useAuth: () => ({ session: null, profile: null }),
}))

const { default: UserProfile } = await import('./UserProfile')

const profile = {
  id: 'u1', handle: 'myman', display_name: 'JDog', bio: 'Writes about the woods.',
  created_at: '2026-09-27T02:49:50Z', location: null, pronouns: null, website_url: null, avatar_url: null, mod_role: null,
}

test('server-renders the seeded profile with the name as the h1', () => {
  const html = renderToString(<UserProfile handle="myman" initialProfile={profile} />)
  expect(html).toContain('Writes about the woods.')
  expect(html).toMatch(/<h1[^>]*>JDog/)
  expect(html).toMatch(/Joined (<!-- -->)?Sep 27, 2026/)
  expect(html).not.toContain('Loading')
})

test('falls back to the loading state without a seed for this handle', () => {
  const html = renderToString(<UserProfile handle="someone-else" initialProfile={profile} />)
  expect(html).toContain('Loading')
})
