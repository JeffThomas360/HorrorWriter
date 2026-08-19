import { render, screen, cleanup } from '@testing-library/react'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'

const CritiqueSignalBadge = (await import('./CritiqueSignalBadge')).default

beforeEach(() => {
  cleanup()
})

afterEach(() => {
  cleanup()
})

describe('CritiqueSignalBadge', () => {
  test('renders Tier 0 (same version) with 4 bars and teal glow', () => {
    render(<CritiqueSignalBadge currentBookVersion={2} commentBookVersion={2} />)
    expect(screen.getByText('SIG 100% (v2)')).toBeInTheDocument()
    expect(screen.getByTestId('signal-badge')).toHaveClass('text-[var(--color-upside)]')
  })

  test('renders Tier 1 (1 version behind) with 3 bars', () => {
    render(<CritiqueSignalBadge currentBookVersion={3} commentBookVersion={2} />)
    expect(screen.getByText('SIG 75% (v2)')).toBeInTheDocument()
  })

  test('renders Tier 2 (2 versions behind) with 2 bars', () => {
    render(<CritiqueSignalBadge currentBookVersion={4} commentBookVersion={2} />)
    expect(screen.getByText('SIG 50% (v2)')).toBeInTheDocument()
  })

  test('renders Tier 3+ (3+ versions behind) with 1 bar and grey static warning', () => {
    render(<CritiqueSignalBadge currentBookVersion={5} commentBookVersion={1} />)
    expect(screen.getByText('SIG 25% (v1)')).toBeInTheDocument()
  })
})
