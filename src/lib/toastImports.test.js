import { test, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..')
const EXTS = ['.jsx', '.js', '.astro']
const DIRECT = /import\s*\{[^}]*\btoast\b[^}]*\}\s*from\s*['"]sonner['"]/

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (EXTS.some((e) => entry.name.endsWith(e)) && !entry.name.includes('.test.')) out.push(full)
  }
  return out
}

test('nobody imports toast from sonner directly (use src/lib/notify)', () => {
  const offenders = walk(SRC)
    .map((f) => relative(SRC, f).split('\\').join('/'))
    .filter((rel) => rel !== 'lib/notify.js')
    .filter((rel) => DIRECT.test(readFileSync(join(SRC, rel), 'utf8')))
  expect(offenders).toEqual([])
})
