import { render, screen, cleanup } from '@testing-library/react'
import { test, expect, describe, beforeEach, afterEach, vi } from 'vitest'
import IslandErrorBoundary from './IslandErrorBoundary'

function ProblemChild() {
  throw new Error('Test explosion!')
}

beforeEach(() => {
  cleanup()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('IslandErrorBoundary', () => {
  test('renders children normally when no error occurs', () => {
    render(
      <IslandErrorBoundary>
        <div>Normal content</div>
      </IslandErrorBoundary>
    )
    expect(screen.getByText('Normal content')).toBeInTheDocument()
  })

  test('catches child component error and renders VHS fallback panel', () => {
    render(
      <IslandErrorBoundary>
        <ProblemChild />
      </IslandErrorBoundary>
    )
    expect(screen.getByText(/SIGNAL LOST/i)).toBeInTheDocument()
    expect(screen.getByText(/Test explosion!/i)).toBeInTheDocument()
    expect(screen.getByText(/Re-establish Link/i)).toBeInTheDocument()
  })
})
