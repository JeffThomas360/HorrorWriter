import { render, cleanup, fireEvent } from '@testing-library/react'
import { test, expect, vi, afterEach } from 'vitest'

let authState = {
  session: { user: { id: 'u1' } },
  profile: { handle: 'writer', mod_role: null },
  isLoading: false,
}

vi.mock('../components/AuthContext', () => ({
  AuthProvider: ({ children }) => children,
  useAuth: () => authState,
}))

vi.mock('../components/RequireAuth', () => ({
  default: ({ children }) => children,
}))

const categoryRows = [
  { id: 'rituals', name: 'Midnight Rituals Critique Room', sort_order: 0 },
  { id: 'crypt', name: 'The Crypt · Critique', sort_order: 1 },
  { id: 'seance', name: 'The Writing Desk · Craft', sort_order: 2 },
  { id: 'coven', name: 'Notice Board · Announcements', sort_order: 5 },
]

const catQuery = {
  select: () => catQuery,
  order: () => Promise.resolve({ data: categoryRows, error: null }),
}

vi.mock('../supabaseClient', () => ({
  supabase: {
    from: () => catQuery,
    rpc: vi.fn(() => Promise.resolve({ data: 'new-thread-id', error: null })),
  },
}))

const CreateThread = (await import('./CreateThread')).default

afterEach(() => {
  cleanup()
  window.history.replaceState({}, '', '/forum/new/')
})

test('hides Rituals from everyone and Notice Board (coven) from non-moderators', async () => {
  authState = {
    session: { user: { id: 'u1' } },
    profile: { handle: 'writer', mod_role: null },
    isLoading: false,
  }
  const { findByRole, findByText, getByTestId } = render(<CreateThread />)
  await findByText('First Lines & Snags · Workshop')
  const select = await findByRole('combobox', { name: /Category/i })
  const optionTexts = Array.from(select.querySelectorAll('option')).map((o) => o.textContent)

  expect(optionTexts).toContain('First Lines & Snags · Workshop')
  expect(optionTexts).toContain('The Writing Desk · Craft & Anatomy')
  expect(optionTexts).not.toContain('Midnight Rituals · Weekly Prompts')
  expect(optionTexts).not.toContain('Notice Board · Keeper Dispatches')

  // Shows the room mission and starter prompt for the selected category
  expect(getByTestId('create-thread-category-guide').textContent).toMatch(/opening 250 words/i)
})

test('allows a moderator to select Notice Board (coven) and pre-fills ?seed= into the editor', async () => {
  window.history.replaceState({}, '', '/forum/new/?cat=coven&seed=The+wood+bled')
  authState = {
    session: { user: { id: 'k1' } },
    profile: { handle: 'keeper', mod_role: 'keeper' },
    isLoading: false,
  }
  const { findByRole, findByText, container } = render(<CreateThread />)
  await findByText('Notice Board · Keeper Dispatches')
  const select = await findByRole('combobox', { name: /Category/i })
  const optionTexts = Array.from(select.querySelectorAll('option')).map((o) => o.textContent)

  expect(optionTexts).toContain('Notice Board · Keeper Dispatches')
  expect(select.value).toBe('coven')

  const textarea = container.querySelector('textarea.md-textarea')
  expect(textarea.value).toContain('> "The wood bled"')
})
