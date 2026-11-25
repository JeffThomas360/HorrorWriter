import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { test, expect, vi, afterEach } from 'vitest'

let profile = { mod_role: 'keeper', mod_scope: 'all' }
vi.mock('../components/AuthContext', () => ({
  useAuth: () => ({ profile, isLoading: false, user: { id: 'u1' } }),
}))
vi.mock('../components/Providers', () => ({ withProviders: (C) => C }))
vi.mock('../components/RequireAuth', () => ({ default: ({ children }) => children }))
vi.mock('../supabaseClient', () => ({ supabase: null }))
// The tab bodies are not under test here, only which tabs the terminal offers.
for (const name of ['OverviewTab', 'RegistryTab', 'BadgesTab', 'ReportsTab', 'FilterRulesTab', 'SanctionsTab', 'StormAlertsTab', 'AppealsTab', 'SuspectedAiTab']) {
  vi.doMock(`../components/mod/${name}`, () => ({ default: () => null }))
}

const Moderation = (await import('./Moderation')).default

afterEach(() => {
  cleanup()
  window.history.replaceState({}, '', '/moderation/')
})

test('a keeper sees the working tabs but no Support tab', () => {
  profile = { mod_role: 'keeper', mod_scope: 'all' }
  render(<Moderation />)
  const names = screen.getAllByRole('tab').map((t) => t.textContent)
  expect(names).toEqual(['Overview', 'Reports', 'Appeals', 'Storms', 'Suspected AI', 'AutoMod', 'Sanctions', 'Registry', 'Badges'])
  expect(screen.queryByRole('tab', { name: 'Support' })).toBeNull()
})

test('syncs active tab with the ?tab= URL parameter', () => {
  window.history.replaceState({}, '', '/moderation/?tab=appeals')
  profile = { mod_role: 'keeper', mod_scope: 'all' }
  render(<Moderation />)
  expect(screen.getByRole('tab', { name: 'Appeals' })).toHaveAttribute('aria-selected', 'true')

  fireEvent.click(screen.getByRole('tab', { name: 'Reports' }))
  expect(window.location.search).toContain('tab=reports')
})

test('a moderator sees only the report-handling tabs, still no Support', () => {
  profile = { mod_role: 'moderator', mod_scope: 'all' }
  render(<Moderation />)
  const names = screen.getAllByRole('tab').map((t) => t.textContent)
  expect(names).toEqual(['Overview', 'Reports', 'Appeals', 'Storms', 'Suspected AI'])
})

// The Suspected AI tab is for staff who can screen: moderators, wardens, keepers.
test('a warden and a scoped moderator see Suspected AI right after Storms', () => {
  for (const p of [{ mod_role: 'warden', mod_scope: 'all' }, { mod_role: 'moderator', mod_scope: 'library' }]) {
    profile = p
    render(<Moderation />)
    const names = screen.getAllByRole('tab').map((t) => t.textContent)
    expect(names[names.indexOf('Storms') + 1]).toBe('Suspected AI')
    cleanup()
  }
})

test('a sentinel does not see Suspected AI', () => {
  profile = { mod_role: 'sentinel', mod_scope: 'all' }
  render(<Moderation />)
  expect(screen.getByRole('tab', { name: 'Storms' })).toBeInTheDocument()
  expect(screen.queryByRole('tab', { name: 'Suspected AI' })).toBeNull()
})
