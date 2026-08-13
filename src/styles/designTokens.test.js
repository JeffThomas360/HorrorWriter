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

const GLOBAL_CSS = join(__dirname, 'global.css')

const PALETTE = {
  '--color-void': '#08090C',
  '--color-surface': '#0F1116',
  '--color-raised': '#161922',
  '--color-line': '#232733',
  '--color-line-hi': '#333A4A',
  '--color-bone': '#E8E4DA',
  '--color-ash': '#8B8F98',
  '--color-blood': '#C8102E',
  '--color-ember': '#FF3B2F',
  '--color-upside': '#19A5B8',
}

describe('VHS palette tokens', () => {
  const css = () => readFileSync(GLOBAL_CSS, 'utf8')

  it.each(Object.entries(PALETTE))('defines %s as %s', (name, value) => {
    expect(css()).toMatch(new RegExp(`${name}\\s*:\\s*${value}\\s*;`, 'i'))
  })

  it('keeps the legacy aliases so existing Tailwind utilities keep resolving', () => {
    const src = css()
    for (const alias of [
      '--color-bg-primary',
      '--color-bg-surface',
      '--color-text-primary',
      '--color-text-secondary',
      '--color-accent-crimson',
    ]) {
      expect(src).toMatch(new RegExp(`${alias}\\s*:`))
    }
  })

  it('sets Fraunces on headings and Merriweather on body', () => {
    const src = css()
    expect(src).toMatch(/font-family:\s*'Fraunces'/)
    expect(src).toMatch(/font-family:\s*'Merriweather'/)
    expect(src).not.toMatch(/Cinzel/i)
  })
})
