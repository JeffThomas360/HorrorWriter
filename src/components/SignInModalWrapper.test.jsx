import { render, screen, act, cleanup } from '@testing-library/react'
import { test, expect, vi, afterEach } from 'vitest'

// The modal is stubbed: these tests are about which screen the wrapper asks for.
vi.mock('./SignInModal.jsx', () => ({
  default: ({ isOpen, initialMode }) => (isOpen ? <div data-testid="modal">{initialMode}</div> : null),
}))

const SignInModalWrapper = (await import('./SignInModalWrapper')).default

afterEach(() => {
  cleanup()
  window.__signinPending = false
})

test('a plain open-signin opens the sign-in screen', () => {
  render(<SignInModalWrapper />)
  act(() => window.dispatchEvent(new CustomEvent('open-signin')))
  expect(screen.getByTestId('modal').textContent).toBe('signin')
})

test('a join request opens the Join screen', () => {
  render(<SignInModalWrapper />)
  act(() => window.dispatchEvent(new CustomEvent('open-signin', { detail: { mode: 'signup' } })))
  expect(screen.getByTestId('modal').textContent).toBe('signup')
})

test('a join request that arrived before hydration is replayed as a join', () => {
  window.__signinPending = 'signup'
  render(<SignInModalWrapper />)
  expect(screen.getByTestId('modal').textContent).toBe('signup')
})

test('an older pending flag (true) still opens the sign-in screen', () => {
  window.__signinPending = true
  render(<SignInModalWrapper />)
  expect(screen.getByTestId('modal').textContent).toBe('signin')
})
