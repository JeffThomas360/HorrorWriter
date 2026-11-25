import { render, screen, cleanup } from '@testing-library/react'
import { test, expect, vi, afterEach } from 'vitest'

let profile = null
vi.mock('../AuthContext', () => ({ useAuth: () => ({ profile }) }))
vi.mock('../../supabaseClient', () => ({ supabase: null }))
vi.mock('../../lib/modActions', () => ({ setContentModStatus: vi.fn() }))
vi.mock('./AiSuspicionControl', () => ({ default: () => <button>Suspected AI</button> }))

const InlineModControls = (await import('./InlineModControls')).default

afterEach(() => cleanup())

const strip = (p) => {
  profile = p
  return render(<InlineModControls targetType="story" targetId="b1" currentStatus="live" authorId="u1" />)
}

test('a sentinel can hide but is not offered the Suspected AI tick', () => {
  strip({ mod_role: 'sentinel', mod_scope: 'all' })
  expect(screen.getByRole('button', { name: 'Hide' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Suspected AI' })).toBeNull()
})

test('a moderator who can screen the area gets the tick', () => {
  strip({ mod_role: 'moderator', mod_scope: 'library' })
  expect(screen.getByRole('button', { name: 'Suspected AI' })).toBeInTheDocument()
})

test('a forum moderator gets no strip on a story, and a member gets none anywhere', () => {
  expect(strip({ mod_role: 'moderator', mod_scope: 'forum' }).container).toBeEmptyDOMElement()
  cleanup()
  expect(strip({ mod_role: null }).container).toBeEmptyDOMElement()
})
