import { render, screen, cleanup } from '@testing-library/react'
import { test, expect, afterEach } from 'vitest'

const VoidWhispers = (await import('./VoidWhispers')).default

afterEach(() => cleanup())

test('renders story seeds with a direct link to open the seed in the story editor', () => {
  render(<VoidWhispers />)
  const writeLinks = screen.getAllByRole('link', { name: /Write story from seed/i })
  expect(writeLinks.length).toBeGreaterThan(0)
  expect(writeLinks[0].getAttribute('href')).toMatch(/^\/library\/publish\/\?seed=/)
})
