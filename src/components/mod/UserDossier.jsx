import { useEffect, useMemo, useState } from 'react'
import { fetchUserDossier } from '../../lib/dossierApi'
import { dossierLines } from '../../lib/dossier'
import { groupProblems } from '../../lib/siteErrors'

/**
 * The Dossier tab of the case file: what happened after this member joined, on one
 * screen. Keeper only (the database refuses anyone else). Nothing here is stored for
 * the purpose: mod_user_dossier() works it out from what the site already holds.
 *
 * The member's own answer and their error messages are shown as text, never markup.
 */

const shortDate = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

export default function UserDossier({ userId, handle }) {
  const [dossier, setDossier] = useState(undefined) // undefined = loading, null = no such member
  const [error, setError] = useState(null)

  useEffect(() => {
    let stale = false
    setDossier(undefined)
    setError(null)
    fetchUserDossier(userId).then(
      (data) => { if (!stale) setDossier(data ?? null) },
      (err) => { if (!stale) setError(err.message) },
    )
    return () => { stale = true }
  }, [userId])

  const lines = useMemo(() => dossierLines(dossier ?? null), [dossier])
  const problems = useMemo(() => groupProblems(dossier?.errors ?? []), [dossier])

  if (error) return <div className="card-error p-4 text-sm">Could not load the dossier: {error}</div>
  if (dossier === undefined) {
    return <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-ash)] animate-pulse">Compiling the dossier…</p>
  }
  if (dossier === null) {
    return <p className="text-sm text-[var(--color-ash)] italic font-serif">No such member.</p>
  }

  const listed = dossier.errors?.length ?? 0
  const errorCount = Number(dossier.error_count) || 0
  const tickets = Number(dossier.tickets?.total) || 0

  return (
    <div className="flex flex-col gap-5" aria-label={handle ? `Dossier for @${handle}` : 'Dossier'}>
      <dl className="flex flex-col gap-3">
        {lines.map((l) => (
          <div key={l.label} className="grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-[7rem_1fr]">
            <dt className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-ash)] sm:pt-0.5">{l.label}</dt>
            <dd className="min-w-0">
              <span className="block break-words text-sm text-[var(--color-bone)]">{l.text}</span>
              {l.sub && <span className="block break-words text-xs text-[var(--color-ash)]">{l.sub}</span>}
            </dd>
          </div>
        ))}
      </dl>

      {(problems.length > 0 || tickets > 0) && (
        <section className="flex flex-col gap-2">
          {problems.length > 0 && (
            <>
              <ul className="flex flex-col gap-2">
                {problems.map((p) => (
                  <li key={p.key} data-testid="dossier-problem" className="card-surface flex flex-col gap-1 px-3 py-2">
                    <span className="flex items-baseline gap-3">
                      <span className="min-w-0 flex-1 break-words text-sm text-[var(--color-bone)]">{p.title}</span>
                      <span className="shrink-0 font-mono text-xs text-[var(--color-ember)]">{p.count}×</span>
                      <span className="shrink-0 font-mono text-xs text-[var(--color-ash)]">{shortDate(p.lastSeen)}</span>
                    </span>
                    <span className="break-words text-xs text-[var(--color-ash)]">
                      {[p.pages[0]?.path, p.devices[0]?.label].filter(Boolean).join(' · ')}
                    </span>
                  </li>
                ))}
              </ul>
              {errorCount > listed && (
                <p className="font-mono text-xs text-[var(--color-ash)]">The most recent {listed} of {errorCount}.</p>
              )}
            </>
          )}
          <p className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs">
            {problems.length > 0 && (
              <a href={`/admin/?tab=errors&member=${encodeURIComponent(userId)}`} className="inline-flex min-h-[44px] items-center underline">
                See these in Site Errors
              </a>
            )}
            {tickets > 0 && (
              <a href="/admin/?tab=queue" className="inline-flex min-h-[44px] items-center underline">Open the work queue</a>
            )}
          </p>
        </section>
      )}
    </div>
  )
}
