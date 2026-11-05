import { render, screen, cleanup } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { test, expect, afterEach } from 'vitest'
import WitchingHourBar, { getMoonPhase } from './WitchingHourBar'

afterEach(cleanup)

// The homepage HTML is built ahead of time. Anything clock-derived in the
// server render is stale by the time a browser hydrates it, and React throws
// a hydration error (#418). The server HTML must hold no clock-derived text.
test('server render contains no moon phase or countdown', () => {
  const html = renderToString(<WitchingHourBar />)
  expect(html).toContain('--:--:--')
  expect(html).not.toMatch(/Moon|Crescent|Quarter|Gibbous|%\)/)
})

test('moon phase appears once mounted in the browser', () => {
  render(<WitchingHourBar />)
  expect(screen.getByText(getMoonPhase().name)).toBeInTheDocument()
})

test('getMoonPhase is deterministic for a given date', () => {
  const fullMoon = new Date(Date.UTC(2000, 0, 21, 4, 40)) // ~15 days after the reference new moon
  expect(getMoonPhase(fullMoon).name).toBe('Full Moon')
  expect(getMoonPhase(fullMoon).illum).toBeGreaterThan(95)
})
