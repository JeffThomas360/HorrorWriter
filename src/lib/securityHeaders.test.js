import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildCsp, securityHeaders } from './securityHeaders.js'

// public/_headers covers prerendered pages; middleware covers Worker-rendered ones.
// They must be the same policy, built from the production URLs in wrangler.toml.
const root = process.cwd()
const toml = readFileSync(resolve(root, 'wrangler.toml'), 'utf8')
const tomlVar = (name) => toml.match(new RegExp(`^${name}\\s*=\\s*"([^"]+)"`, 'm'))[1]
const prod = { supabaseUrl: tomlVar('VITE_SUPABASE_URL'), transcribeUrl: tomlVar('VITE_TRANSCRIBE_URL') }

const staticHeaders = Object.fromEntries(
  readFileSync(resolve(root, 'public/_headers'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^\s+\S+:/.test(l))
    .map((l) => { const i = l.indexOf(':'); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)

describe('security headers', () => {
  it('public/_headers and the middleware policy are identical', () => {
    expect(staticHeaders).toEqual(securityHeaders(prod))
  })
  it('allows the configured Supabase project over https and wss', () => {
    const csp = buildCsp(prod)
    expect(csp).toContain(`connect-src 'self' ${prod.supabaseUrl} ${prod.supabaseUrl.replace('https', 'wss')} ${prod.transcribeUrl}`)
  })
  it('follows a local Supabase stack in dev', () => {
    const csp = buildCsp({ supabaseUrl: 'http://127.0.0.1:54321' })
    expect(csp).toContain("connect-src 'self' http://127.0.0.1:54321 ws://127.0.0.1:54321;")
    expect(csp).toContain("img-src 'self' data: http://127.0.0.1:54321;")
  })
})
