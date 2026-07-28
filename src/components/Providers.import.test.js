import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/*
 * Regression guard for the `withProviders` import trap.
 *
 * `Providers.jsx` exports `withProviders` as a NAMED export; its DEFAULT export
 * is the `Providers` component. A default import therefore compiles fine, then
 * calls the `Providers` component as a plain function at module scope during
 * SSR — `useState` runs with a null dispatcher and the whole route 500s before
 * frontmatter executes.
 *
 * That shipped to production in SeriesHub.jsx and broke /library/series/[id]
 * for the entire life of the Series feature. The stack trace pointed at Astro
 * internals, not project code, so it cost a full debugging session to find.
 *
 * These tests fail loudly if the shape of the module changes or if any island
 * reaches for the default import again.
 */

const __dirname = dirname(fileURLToPath(import.meta.url))
const ISLANDS_DIR = join(__dirname, '..', 'pages-react')

describe('Providers module shape', () => {
  it('exports withProviders as a named export', async () => {
    const mod = await import('./Providers.jsx')
    expect(typeof mod.withProviders).toBe('function')
  })

  it('has the Providers component as its default export, not withProviders', async () => {
    const mod = await import('./Providers.jsx')
    expect(mod.default).not.toBe(mod.withProviders)
    expect(mod.default.name).toBe('Providers')
  })
})

describe('island imports of Providers', () => {
  const islands = readdirSync(ISLANDS_DIR).filter((f) => f.endsWith('.jsx'))

  it('finds island components to check', () => {
    expect(islands.length).toBeGreaterThan(0)
  })

  it.each(islands)('%s does not default-import Providers', (file) => {
    const source = readFileSync(join(ISLANDS_DIR, file), 'utf8')

    // Matches `import withProviders from '...'` / `import Foo from "..."` —
    // any default import whose specifier ends in Providers.
    const defaultImport = /^\s*import\s+(?!\{)[\w$]+\s+from\s+['"][^'"]*\/Providers(?:\.jsx)?['"]/m

    expect(
      defaultImport.test(source),
      `${file} default-imports Providers. Use: import { withProviders } from '../components/Providers'`
    ).toBe(false)
  })

  it.each(islands)('%s uses the named withProviders import if it wraps at all', (file) => {
    const source = readFileSync(join(ISLANDS_DIR, file), 'utf8')
    if (!source.includes('withProviders')) return

    expect(source).toMatch(
      /import\s+\{[^}]*\bwithProviders\b[^}]*\}\s+from\s+['"][^'"]*\/Providers(?:\.jsx)?['"]/
    )
  })
})
