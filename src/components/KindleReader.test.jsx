import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { test, expect, vi, afterEach } from 'vitest'
import KindleReader, { useKindlePrefs } from './KindleReader'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

function Harness(props) {
  const prefs = useKindlePrefs()
  return (
    <KindleReader prefs={prefs} title="The Mirror" eyebrow="entry by someone" wordCount={400} {...props}>
      <p>It lagged a half second behind.</p>
    </KindleReader>
  )
}

test('renders title, eyebrow and prose', () => {
  render(<Harness onExit={() => {}} />)
  expect(screen.getByRole('heading', { name: 'The Mirror' })).toBeInTheDocument()
  expect(screen.getByText('entry by someone')).toBeInTheDocument()
  expect(screen.getByText('It lagged a half second behind.')).toBeInTheDocument()
})

test('Esc and the exit buttons leave Focus Mode', () => {
  const onExit = vi.fn()
  render(<Harness onExit={onExit} exitLabel="Exit & Return to Critique" />)
  fireEvent.keyDown(window, { key: 'Escape' })
  fireEvent.click(screen.getByRole('button', { name: 'Exit & Return to Critique' }))
  expect(onExit).toHaveBeenCalledTimes(2)
})

test('shows a next button only when onNext is given', () => {
  const onNext = vi.fn()
  const { rerender } = render(<Harness onExit={() => {}} />)
  expect(screen.queryByRole('button', { name: /next/i })).toBeNull()
  rerender(<Harness onExit={() => {}} onNext={onNext} nextLabel="Next entry: Teeth →" />)
  fireEvent.click(screen.getByRole('button', { name: 'Next entry: Teeth →' }))
  expect(onNext).toHaveBeenCalled()
})

test('theme choice persists to localStorage and T cycles it', () => {
  const { container } = render(<Harness onExit={() => {}} />)
  const viewport = container.querySelector('#kindle-viewport')
  expect(viewport.className).toContain('kindle-theme-void')
  fireEvent.keyDown(window, { key: 't' })
  expect(viewport.className).toContain('kindle-theme-sepia')
  expect(localStorage.getItem('hw_kindle_theme')).toBe('sepia')
  fireEvent.click(screen.getByTitle(/Typography & Theme Settings/))
  fireEvent.click(screen.getByRole('button', { name: /Paper Light/ }))
  expect(viewport.className).toContain('kindle-theme-paper')
})
