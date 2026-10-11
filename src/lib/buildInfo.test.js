import { describe, it, expect, vi } from 'vitest'
import { collectBuildInfo, formatBuildStamp, githubRepoFromUrl, countCommitsOnGitHub } from './buildInfo'

const NOW = new Date('2026-10-11T03:00:00Z')
const CI_ENV = { WORKERS_CI: '1', WORKERS_CI_COMMIT_SHA: '7219de5abcdef0', WORKERS_CI_BRANCH: 'main' }
const ORIGIN = 'https://github.com/JeffThomas360/HorrorWriter.git'

/** A fake shell: answers is cmd -> string | Error | (() => string). */
const shell = (answers) => (cmd) => {
  if (!(cmd in answers)) throw new Error(`unexpected ${cmd}`)
  const a = typeof answers[cmd] === 'function' ? answers[cmd]() : answers[cmd]
  if (a instanceof Error) throw a
  return a
}
const githubReplies = ({ status = 200, link = null, body = [] } = {}) =>
  vi.fn(async () => ({ ok: status === 200, headers: { get: (h) => (h === 'link' ? link : null) }, json: async () => body }))

describe('collectBuildInfo', () => {
  it('counts commits directly in a full clone', async () => {
    const info = await collectBuildInfo({
      version: '0.1.0',
      env: CI_ENV,
      run: shell({ 'git rev-parse --is-shallow-repository': 'false', 'git rev-list --count HEAD': '397' }),
      now: NOW
    })
    expect(info).toEqual({ version: '0.1.0', build: 397, sha: '7219de5', branch: 'main', ci: true, builtAt: '2026-10-11T03:00:00.000Z' })
  })

  // Workers Builds: shallow clone, but the history can be fetched.
  it('unshallows a shallow clone and then counts', async () => {
    let shallow = 'true'
    const info = await collectBuildInfo({
      version: '0.1.0',
      env: CI_ENV,
      run: shell({
        'git rev-parse --is-shallow-repository': () => shallow,
        'git fetch --unshallow --quiet': () => { shallow = 'false'; return '' },
        'git rev-list --count HEAD': '397'
      }),
      fetchImpl: githubReplies(),
      now: NOW
    })
    expect(info.build).toBe(397)
  })

  it('asks GitHub when the history cannot be fetched', async () => {
    const fetchImpl = githubReplies({ link: '<https://api.github.com/repositories/1/commits?sha=x&per_page=1&page=2>; rel="next", <https://api.github.com/repositories/1/commits?sha=x&per_page=1&page=397>; rel="last"' })
    const info = await collectBuildInfo({
      version: '0.1.0',
      env: CI_ENV,
      run: shell({
        'git rev-parse --is-shallow-repository': 'true',
        'git fetch --unshallow --quiet': new Error('auth'),
        'git remote get-url origin': ORIGIN
      }),
      fetchImpl,
      now: NOW
    })
    expect(info.build).toBe(397)
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.github.com/repos/JeffThomas360/HorrorWriter/commits?sha=7219de5abcdef0&per_page=1')
  })

  // No number beats a wrong number.
  it('leaves the build number out when both fail', async () => {
    const info = await collectBuildInfo({
      version: '0.1.0',
      env: CI_ENV,
      run: shell({
        'git rev-parse --is-shallow-repository': 'true',
        'git fetch --unshallow --quiet': new Error('auth'),
        'git remote get-url origin': ORIGIN
      }),
      fetchImpl: githubReplies({ status: 403 }),
      now: NOW
    })
    expect(info.build).toBeNull()
    expect(info.sha).toBe('7219de5')
  })

  it('survives having no git at all', async () => {
    const info = await collectBuildInfo({ version: '0.1.0', run: () => { throw new Error('no git') }, fetchImpl: githubReplies({ status: 500 }), now: NOW })
    expect(info).toMatchObject({ build: null, sha: null, branch: null, ci: false })
  })
})

describe('helpers', () => {
  it('reads owner/name from https and ssh remotes', () => {
    expect(githubRepoFromUrl(ORIGIN)).toBe('JeffThomas360/HorrorWriter')
    expect(githubRepoFromUrl('git@github.com:JeffThomas360/HorrorWriter.git')).toBe('JeffThomas360/HorrorWriter')
    expect(githubRepoFromUrl('https://example.com/x/y')).toBeNull()
  })
  it('a single-commit history has no Link header and counts 1', async () => {
    expect(await countCommitsOnGitHub({ repo: 'a/b', sha: 'x', fetchImpl: githubReplies({ body: [{}] }) })).toBe(1)
  })
})

describe('formatBuildStamp', () => {
  it('joins version, build and commit', () => {
    expect(formatBuildStamp({ version: '0.1.0', build: 397, sha: '7219de5' })).toBe('0.1.0+397.7219de5')
  })
  it('drops what is unknown', () => {
    expect(formatBuildStamp({ version: '0.1.0', build: null, sha: '7219de5' })).toBe('0.1.0+7219de5')
    expect(formatBuildStamp({ version: '0.1.0', build: null, sha: null })).toBe('0.1.0')
    expect(formatBuildStamp(null)).toBe('unknown build')
  })
})
