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

  // The four seeded archive stories showed "8 CRITIQUES", 5, 3 and 6 on their
  // library cards. They live in code, not the database, and cannot hold
  // comments at all (book_comments.book_id is a uuid).
  it('seeded archive stories carry no invented engagement counts', () => {
    const src = read('../lib/seedArchives.js')
    expect(src).not.toMatch(/comments_count|likes|views_count|reads_count/)
  })

  // "TRENDING" was stamped on whichever thread was most recently updated.
  it('the home page claims no trending thread', () => {
    const src = read('../pages/index.astro')
    expect(src).not.toMatch(/TRENDING/i)
  })

  // Tape #00 promised "permanent Founding Member status, unfiltered critique
  // access, and the right to broadcast on Channel 13" to anyone signing up
  // "before midnight". None of it existed, and no midnight was ever set.
  // Founding Member is to be recognition only (a badge), never a perk.
  it('Tape #00 promises no perks and no fake deadline', () => {
    const src = read('ForbiddenTape.jsx')
    expect(src).not.toMatch(/unfiltered critique/i)
    expect(src).not.toMatch(/broadcast on Channel 13/i)
    expect(src).not.toMatch(/before midnight/i)
    expect(src).not.toMatch(/Claim Founding/i)
  })
})

