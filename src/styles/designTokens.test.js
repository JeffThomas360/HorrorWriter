import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FONTS_CSS = join(__dirname, 'fonts.css')
const FONT_DIR = join(__dirname, '..', '..', 'public', 'fonts')

describe('self-hosted fonts', () => {
  const css = () => readFileSync(FONTS_CSS, 'utf8')

  it('declares the three approved families', () => {
    const src = css()
    expect(src).toMatch(/font-family:\s*'Fraunces'/)
    expect(src).toMatch(/font-family:\s*'IBM Plex Mono'/)
    expect(src).toMatch(/font-family:\s*'Merriweather'/)
  })

  it('no longer declares Cinzel', () => {
    expect(css()).not.toMatch(/Cinzel/i)
  })

  it('loads every font from a local path, never a CDN', () => {
    const urls = [...css().matchAll(/url\(([^)]+)\)/g)].map((m) => m[1].replace(/['"]/g, ''))
    expect(urls.length).toBeGreaterThan(0)
    for (const url of urls) expect(url.startsWith('/fonts/')).toBe(true)
  })

  it('every referenced font file exists on disk', () => {
    const urls = [...css().matchAll(/url\(([^)]+)\)/g)].map((m) => m[1].replace(/['"]/g, ''))
    for (const url of urls) {
      expect(existsSync(join(FONT_DIR, url.replace('/fonts/', '')))).toBe(true)
    }
  })

  it('sets font-display: swap on every face', () => {
    const faces = css().split('@font-face').slice(1)
    expect(faces.length).toBeGreaterThan(0)
    for (const face of faces) expect(face).toMatch(/font-display:\s*swap/)
  })

  it('declares Fraunces as a variable face spanning 400-900', () => {
    expect(css()).toMatch(/font-weight:\s*400\s+900/)
  })
})
