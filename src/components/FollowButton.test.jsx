import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { test, expect, vi, afterEach } from 'vitest'

vi.mock('./AuthContext', () => ({
  useAuth: () => ({ session: { user: { id: 'viewer-1' } } }),
}))

const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
const single = vi.fn()
const insert = vi.fn().mockResolvedValue({ error: null })
const del = vi.fn(() => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }))

vi.mock('../supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle,
            single,
          }),
        }),
      }),
      insert,
      delete: del,
    }),
  },
}))

const FollowButton = (await import('./FollowButton')).default

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

test('uses maybeSingle() instead of single() so unfollowed profiles do not 406, and toggles Follow', async () => {
  render(<FollowButton targetProfileId="author-2" />)

  const btn = await screen.findByRole('button', { name: 'Follow' })
  expect(maybeSingle).toHaveBeenCalledTimes(1)
  expect(single).not.toHaveBeenCalled()

  fireEvent.click(btn)
  expect(await screen.findByRole('button', { name: 'Unfollow' })).toBeInTheDocument()
  expect(insert).toHaveBeenCalledWith({
    follower_id: 'viewer-1',
    following_id: 'author-2',
  })
})
