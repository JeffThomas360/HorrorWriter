import { describe, it, expect } from 'vitest'
import { collectBuildInfo, formatBuildStamp } from './buildInfo'

const NOW = new Date('2026-10-11T03:00:00Z')
const git = (answers) => (cmd) => {
  if (!(cmd in answers)) throw new Error(`unexpected ${cmd}`)
  if (answers[cmd] instanceof Error) throw answers[cmd]
  return answers[cmd]
}

describe('collectBuildInfo', () => {
  it('uses Workers Builds variables when present', () => {
    const info = collectBuildInfo({
      version: '0.1.0',
      env: { WORKERS_CI: '1', WORKERS_CI_COMMIT_SHA: '5c99ccc0123456', WORKERS_CI_BRANCH: 'main' },
      run: git({ 'git rev-parse --is-shallow-repository': 'false', 'git rev-list --count HEAD': '142' }),
      now: NOW
    })
    expect(info).toEqual({ version: '0.1.0', build: 142, sha: '5c99ccc', branch: 'main', ci: true, builtAt: '2026-10-11T03:00:00.000Z' })
  })

  it('falls back to local git outside CI', () => {
    const info = collectBuildInfo({
      version: '0.1.0',
      run: git({
        'git rev-parse HEAD': 'abcdef1234',
        'git rev-parse --abbrev-ref HEAD': 'feat/x',
        'git rev-parse --is-shallow-repository': 'false',
        'git rev-list --count HEAD': '7'
      }),
      now: NOW
    })
    expect(info).toMatchObject({ build: 7, sha: 'abcdef1', branch: 'feat/x', ci: false })
  })

  // A shallow clone's commit count is wrong; showing it would be a false number.
  it('leaves the build number out in a shallow clone', () => {
    const info = collectBuildInfo({
      version: '0.1.0',
      env: { WORKERS_CI: '1', WORKERS_CI_COMMIT_SHA: 'aaaaaaa999', WORKERS_CI_BRANCH: 'main' },
      run: git({ 'git rev-parse --is-shallow-repository': 'true' }),
      now: NOW
    })
    expect(info.build).toBeNull()
  })

  it('survives having no git at all', () => {
    const info = collectBuildInfo({ version: '0.1.0', run: () => { throw new Error('no git') }, now: NOW })
    expect(info).toMatchObject({ build: null, sha: null, branch: null })
  })
})

describe('formatBuildStamp', () => {
  it('joins version, build and commit', () => {
    expect(formatBuildStamp({ version: '0.1.0', build: 142, sha: '5c99ccc' })).toBe('0.1.0+142.5c99ccc')
  })
  it('drops what is unknown', () => {
    expect(formatBuildStamp({ version: '0.1.0', build: null, sha: '5c99ccc' })).toBe('0.1.0+5c99ccc')
    expect(formatBuildStamp({ version: '0.1.0', build: null, sha: null })).toBe('0.1.0')
    expect(formatBuildStamp(null)).toBe('unknown build')
  })
})
