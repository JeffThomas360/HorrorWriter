/**
 * Which build is live. Collected once at build time (astro.config.mjs) and
 * baked into the bundle as __BUILD_INFO__; shown on the admin Overview.
 *
 * Workers Builds sets WORKERS_CI, WORKERS_CI_COMMIT_SHA and WORKERS_CI_BRANCH.
 * The build number is the commit count on the branch; in a shallow clone that
 * count is wrong, so it is left out rather than shown.
 */

/** `run(cmd)` returns trimmed stdout or throws. Injected so tests need no git. */
export function collectBuildInfo({ version, env = {}, run, now = new Date() }) {
  const tryRun = (cmd) => {
    try { return run(cmd) } catch { return null }
  }
  const ci = Boolean(env.WORKERS_CI)
  const sha = (env.WORKERS_CI_COMMIT_SHA || tryRun('git rev-parse HEAD') || '').slice(0, 7) || null
  const branch = env.WORKERS_CI_BRANCH || tryRun('git rev-parse --abbrev-ref HEAD') || null
  const shallow = tryRun('git rev-parse --is-shallow-repository') === 'true'
  const countRaw = shallow ? null : tryRun('git rev-list --count HEAD')
  const build = countRaw && /^\d+$/.test(countRaw) ? Number(countRaw) : null
  return { version, build, sha, branch, ci, builtAt: now.toISOString() }
}

/** "0.1.0+142.5c99ccc", dropping whatever is unknown. */
export function formatBuildStamp(info) {
  if (!info?.version) return 'unknown build'
  const meta = [info.build, info.sha].filter((x) => x != null && x !== '').join('.')
  return meta ? `${info.version}+${meta}` : info.version
}
