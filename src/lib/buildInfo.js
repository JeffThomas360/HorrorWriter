/**
 * Which build is live. Collected once at build time (astro.config.mjs) and
 * baked into the bundle as __BUILD_INFO__; shown on the admin Overview.
 *
 * Workers Builds sets WORKERS_CI, WORKERS_CI_COMMIT_SHA and WORKERS_CI_BRANCH,
 * and clones shallow (seen live 2026-10-10: no build number). The build number
 * is the commit count, so in a shallow clone we first try to fetch the full
 * history, then ask GitHub's public API. If both fail it is left out rather
 * than shown wrong.
 */

/** "owner/name" from a GitHub remote URL (https or ssh), else null. */
export function githubRepoFromUrl(url) {
  const m = String(url ?? '').match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?\/?$/)
  return m ? `${m[1]}/${m[2]}` : null
}

/**
 * Commit count reachable from `sha`, via one unauthenticated GitHub request:
 * list commits one per page and read the last page number from the Link header.
 */
export async function countCommitsOnGitHub({ repo, sha, fetchImpl = globalThis.fetch }) {
  if (!repo || !sha || !fetchImpl) return null
  try {
    const res = await fetchImpl(`https://api.github.com/repos/${repo}/commits?sha=${sha}&per_page=1`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'horrorwriter-build' }
    })
    if (!res.ok) return null
    const link = res.headers.get('link') || ''
    const last = link.match(/[?&]page=(\d+)>;\s*rel="last"/)
    if (last) return Number(last[1])
    const body = await res.json()
    return Array.isArray(body) && body.length === 1 ? 1 : null
  } catch {
    return null
  }
}

/** `run(cmd)` returns trimmed stdout or throws. Injected so tests need no git or network. */
export async function collectBuildInfo({ version, env = {}, run, fetchImpl, now = new Date() }) {
  const tryRun = (cmd) => {
    try { return run(cmd) } catch { return null }
  }
  const asCount = (raw) => (raw && /^\d+$/.test(raw) ? Number(raw) : null)

  const ci = Boolean(env.WORKERS_CI)
  const fullSha = env.WORKERS_CI_COMMIT_SHA || tryRun('git rev-parse HEAD') || null
  const sha = fullSha ? fullSha.slice(0, 7) : null
  const branch = env.WORKERS_CI_BRANCH || tryRun('git rev-parse --abbrev-ref HEAD') || null

  let build = null
  if (tryRun('git rev-parse --is-shallow-repository') !== 'true') {
    build = asCount(tryRun('git rev-list --count HEAD'))
  } else {
    tryRun('git fetch --unshallow --quiet')
    if (tryRun('git rev-parse --is-shallow-repository') === 'false') {
      build = asCount(tryRun('git rev-list --count HEAD'))
    }
    if (build == null) {
      const repo = githubRepoFromUrl(tryRun('git remote get-url origin'))
      build = await countCommitsOnGitHub({ repo, sha: fullSha, fetchImpl })
    }
  }

  return { version, build, sha, branch, ci, builtAt: now.toISOString() }
}

/**
 * "v0.1.398": major.minor from package.json, the build number as the third
 * part. Without a build number it stops at "v0.1" rather than inventing one.
 */
export function formatVersion(info) {
  if (!info?.version) return 'unknown build'
  const [major = '0', minor = '0'] = String(info.version).split('.')
  return info.build != null ? `v${major}.${minor}.${info.build}` : `v${major}.${minor}`
}

/** "v0.1.398 · bb7489d": the version plus the commit it was built from. */
export function formatBuildStamp(info) {
  const v = formatVersion(info)
  return info?.version && info.sha ? `${v} · ${info.sha}` : v
}
