import { render, screen, cleanup } from '@testing-library/react'
import { test, expect, vi, afterEach } from 'vitest'

const h = vi.hoisted(() => ({ roster: [] }))
vi.mock('../../lib/modActions', () => ({
  searchUsers: vi.fn(async () => []),
  fetchActiveSanctions: vi.fn(async () => h.roster),
}))
vi.mock('./UserModProfile', () => ({ default: () => null }))

const SanctionsTab = (await import('./SanctionsTab')).default

afterEach(() => cleanup())

test('the roster calls a permanent sanction a ban, and the tab never says shadowban', async () => {
  h.roster = [{ id: '1', handle: 'perma', banned_until: '2099-12-31T23:59:59+00:00' }]
  const { container } = render(<SanctionsTab />)
  expect(await screen.findByText('Permanent ban')).toBeInTheDocument()
  expect(container.textContent).not.toMatch(/shadowban/i)
})
