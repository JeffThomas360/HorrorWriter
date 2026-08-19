import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const GLOBAL_CSS = join(__dirname, 'global.css')

describe('VHS Phase 5 motion set piece', () => {
  const css = () => readFileSync(GLOBAL_CSS, 'utf8')

  it('defines vhs-signal-lock and vhs-signal-sweep classes', () => {
    const src = css()
    expect(src).toMatch(/\.vhs-signal-lock/)
    expect(src).toMatch(/\.vhs-signal-sweep/)
  })

  it('defines vhsSignalBloom and vhsSweepDown keyframe animations', () => {
    const src = css()
    expect(src).toMatch(/@keyframes\s+vhsSignalBloom/)
    expect(src).toMatch(/@keyframes\s+vhsSweepDown/)
  })

  it('disables motion completely under prefers-reduced-motion media query', () => {
    const src = css()
    expect(src).toMatch(/@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)/)
    expect(src).toMatch(/\.vhs-signal-lock/)
    expect(src).toMatch(/animation:\s*none\s*!important/)
  })
})
