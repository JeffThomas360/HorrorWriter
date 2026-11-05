import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { test, expect, vi, afterEach } from 'vitest'
import LoadError from './LoadError'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

test('shows the friendly message, never the raw error text', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  render(<LoadError title="The Crypt didn't open" message="Try again soon." error={new TypeError('Failed to fetch')} />)
  expect(screen.getByRole('alert')).toHaveTextContent("The Crypt didn't open")
  expect(screen.queryByText(/Failed to fetch/)).toBeNull()
  expect(console.error).toHaveBeenCalled()
})

test('Try again calls onRetry', () => {
  const onRetry = vi.fn()
  render(<LoadError title="t" message="m" onRetry={onRetry} />)
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(onRetry).toHaveBeenCalledOnce()
})
