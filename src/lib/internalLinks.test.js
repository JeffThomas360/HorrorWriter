import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// Every internal link to a page must use the trailing-slash URL the page is
// served at. The slash-less form answers 307, so each click and each sitemap
// entry Google fetches cost a redirect first.
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..')
const PAGE_PREFIX = '(?:library|forum|u|rules|transparency|my-stories|my-reports|profile|moderation|admin)'
// A quoted literal like '/forum', "/rules#x", `/library/read/${id}` or `/x?y=1`.
const LITERAL = new RegExp("(['\"`])(/" + PAGE_PREFIX + "(?:/[^'\"`?#\\s]*)?)([?#][^'\"`]*)?\\1", 'g')

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return sourceFiles(p)
    return /\.(jsx?|astro)$/.test(name) && !/\.test\./.test(name) ? [p] : []
  })
}

describe('internal links', () => {
  it('use trailing-slash page URLs', () => {
    const offenders = []
    for (const file of sourceFiles(SRC)) {
      const text = readFileSync(file, 'utf8')
      for (const m of text.matchAll(LITERAL)) {
        if (!m[2].endsWith('/')) offenders.push(`${relative(SRC, file)}: ${m[0]}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
