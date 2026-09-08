import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const read = (f) => readFileSync(join(__dirname, f), 'utf8')

/**
 * Guard against fabricated engagement metrics coming back.
 *
 * These three components each displayed a number that no data source backed:
 * a randomly-walking "19 authors writing in the dark", a hardcoded "42 Candles
 * Lit", and five authored prompts presented as anonymous user confessions with
 * invented candle counts. The site's whole pitch is that it does not do this,
 * so it is worth a test rather than a memory.
 */
describe('no fabricated engagement metrics', () => {
  it('WitchingHourBar claims no live author count', () => {
    const src = read('WitchingHourBar.jsx')
    expect(src).not.toMatch(/authors writing/i)
    expect(src).not.toMatch(/activeWriters/)
    // The countdown and moon phase are computed from the real clock and date.
    expect(src).toMatch(/getMoonPhase/)
  })

  it('MidnightRitual claims no candle count', () => {
    const src = read('MidnightRitual.jsx')
    expect(src).not.toMatch(/candleCount/)
    expect(src).not.toMatch(/Candles Lit/i)
  })

  it('VoidWhispers labels its seeds and invents no engagement counts', () => {
    const src = read('VoidWhispers.jsx')
    expect(src).not.toMatch(/candles/i)
    // No fake handles/timestamps posing as real submissions.
    expect(src).not.toMatch(/author:\s*'Anonymous/)
    // Seeds must carry a marker the UI can label.
    expect(src).toMatch(/seed:\s*true/)
    expect(src).toMatch(/'Seed'/)
  })

  it('none of the three invent a number with Math.random', () => {
    for (const f of ['WitchingHourBar.jsx', 'MidnightRitual.jsx', 'VoidWhispers.jsx']) {
      expect(read(f), `${f} should not synthesise metrics`).not.toMatch(/Math\.random/)
    }
  })
})
