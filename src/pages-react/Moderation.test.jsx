import { render, screen, cleanup } from '@testing-library/react'
import { test, expect, vi, afterEach } from 'vitest'

let profile = { mod_role: 'keeper', mod_scope: 'all' }
vi.mock('../components/AuthContext', () => ({
  useAuth: () => ({ profile, isLoading: false, user: { id: 'u1' } }),
}))
vi.mock('../components/Providers', () => ({ withProviders: (C) => C }))
vi.mock('../components/RequireAuth', () => ({ default: ({ children }) => children }))
vi.mock('../supabaseClient', () => ({ supabase: null }))
// The tab bodies are not under test here, only which tabs the terminal offers.
for (const name of ['OverviewTab', 'RegistryTab', 'BadgesTab', 'ReportsTab', 'FilterRulesTab', 'SanctionsTab', 'StormAlertsTab', 'AppealsTab']) {
  vi.doMock(`../components/mod/${name}`, () => ({ default: () => null }))
}

const Moderation = (await import('./Moderation')).default

afterEach(() => cleanup())

test('a keeper sees the working tabs but no Support tab', () => {
  profile = { mod_role: 'keeper', mod_scope: 'all' }
  render(<Moderation />)
  const names = screen.getAllByRole('tab').map((t) => t.textContent)
  expect(names).toEqual(['Overview', 'Reports', 'Appeals', 'Storms', 'AutoMod', 'Sanctions', 'Registry', 'Badges'])
  expect(screen.queryByRole('tab', { name: 'Support' })).toBeNull()
})

test('a moderator sees only the report-handling tabs, still no Support', () => {
  profile = { mod_role: 'moderator', mod_scope: 'all' }
  render(<Moderation />)
  const names = screen.getAllByRole('tab').map((t) => t.textContent)
  expect(names).toEqual(['Overview', 'Reports', 'Appeals', 'Storms'])
})
