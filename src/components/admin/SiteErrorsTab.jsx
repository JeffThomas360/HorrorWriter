import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchSiteErrors } from '../../lib/siteErrorsApi'
import { WINDOWS, KINDS, groupProblems, summarize, describeDevice, pagePath } from '../../lib/siteErrors'
import UserModProfile from '../mod/UserModProfile'

/**
 * Admin → Site Errors. The error log (public.client_errors) grouped by cause,
 * so the Keeper can see what members ran into without opening the SQL editor.
 *
 * The time window is fetched; kind and member narrow what is already loaded.
 * Everything from the log is rendered as text: messages and stacks come from
 * members' browsers and are never trusted as markup.
 *
 * A Dossier links here with `?member=<id>`: the tab then starts on that member,
 * over the longest window, so their trouble is all on screen.
 */

function memberFromUrl() {
  try {
    return new URLSearchParams(window.location.search).get('member') || 'all'
  } catch {
    return 'all'
  }
}

const SELECT = 'card-surface min-h-[44px] px-3 py-2 text-xs font-mono uppercase border border-[var(--color-line-hi)] cursor-pointer'
const LABEL = 'block font-mono text-[10px] uppercase tracking-wider text-[var(--color-ash)]'

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`
const shortDate = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
const fullDate = (iso) => new Date(iso).toLocaleString()

/** "1 member, 2 signed out": zero parts are left out. */
function whoLine(problem) {
  const parts = []
  if (problem.memberIds.length) parts.push(plural(problem.memberIds.length, 'member', 'members'))
  if (problem.signedOut) parts.push(`${problem.signedOut} signed out`)
  return parts.join(', ')
}

function Occurrence({ row, nameOf, onOpenMember }) {
  return (
    <li data-testid="occurrence" className="card-surface flex flex-col gap-1 px-3 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-mono text-[var(--color-ash)]">{fullDate(row.created_at)}</span>
        {row.user_id ? (
          <button
            type="button"
            aria-label={`Open case file for ${nameOf(row.user_id)}`}
            onClick={() => onOpenMember(row.user_id)}
            className="min-h-[44px] underline text-[var(--color-upside)] hover:text-[var(--color-ember)] cursor-pointer"
          >
            {nameOf(row.user_id)}
          </button>
        ) : (
          <span className="text-[var(--color-ash)]">signed out</span>
        )}
        <span className="font-mono text-[var(--color-bone)] break-all">{pagePath(row.url)}</span>
        <span className="text-[var(--color-ash)]">{describeDevice(row.user_agent)}</span>
      </div>
      {row.stack && (
        <details>
          <summary className="min-h-[44px] flex items-center cursor-pointer font-mono uppercase tracking-wider text-[var(--color-ash)] hover:text-[var(--color-bone)]">Stack trace</summary>
          <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[11px] text-[var(--color-ash)]">{row.stack}</pre>
        </details>
      )}
    </li>
  )
}

function ProblemDetail({ problem, nameOf, onOpenMember }) {
  return (
    <div data-testid="problem-detail" className="flex flex-col gap-3 border-t border-[var(--color-line)] px-3 py-3 text-xs">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <span className={LABEL}>First seen</span>
          <span className="text-[var(--color-bone)]">{fullDate(problem.firstSeen)}</span>
        </div>
        <div>
          <span className={LABEL}>Last seen</span>
          <span className="text-[var(--color-bone)]">{fullDate(problem.lastSeen)}</span>
        </div>
        <div>
          <span className={LABEL}>Pages</span>
          <ul className="font-mono text-[var(--color-bone)]">
            {problem.pages.map((p) => <li key={p.path} className="break-all">{p.path} ({p.count})</li>)}
          </ul>
        </div>
        <div>
          <span className={LABEL}>Devices</span>
          <ul className="text-[var(--color-bone)]">
            {problem.devices.map((d) => <li key={d.label}>{d.label} ({d.count})</li>)}
          </ul>
        </div>
      </div>

      {problem.kind === 'request' && (
        <div>
          <span className={LABEL}>Request</span>
          <span className="font-mono text-[var(--color-bone)] break-all">
            {problem.action ?? 'unnamed'} · status {problem.status ?? 'none'} · code {problem.code ?? 'none'}
          </span>
        </div>
      )}

      <div>
        <span className={LABEL}>Message</span>
        <p className="whitespace-pre-wrap break-words font-mono text-[var(--color-bone)]">{problem.message}</p>
      </div>

      <div>
        <span className={LABEL}>
          {problem.count > problem.occurrences.length
            ? `Most recent ${problem.occurrences.length} of ${problem.count}`
            : 'Each time it happened'}
        </span>
        <ul className="mt-1 flex flex-col gap-2">
          {problem.occurrences.map((row) => (
            <Occurrence key={row.id} row={row} nameOf={nameOf} onOpenMember={onOpenMember} />
          ))}
        </ul>
      </div>
    </div>
  )
}

export default function SiteErrorsTab() {
  const [windowId, setWindowId] = useState(() => (memberFromUrl() === 'all' ? '7d' : '90d'))
  const [kind, setKind] = useState('all')
  const [memberId, setMemberId] = useState(memberFromUrl)
  const [openKey, setOpenKey] = useState(null)
  const [caseFileFor, setCaseFileFor] = useState(null)

  const hours = WINDOWS.find((w) => w.id === windowId)?.hours ?? 168

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'site-errors', windowId],
    queryFn: () => fetchSiteErrors(hours),
  })

  const rows = data?.rows ?? []
  const handles = data?.handles ?? {}

  const nameOf = (id) => (handles[id] ? `@${handles[id]}` : 'a member')

  const members = useMemo(() => {
    const ids = [...new Set(rows.map((r) => r.user_id).filter(Boolean))]
    return ids
      .map((id) => ({ id, label: handles[id] ? `@${handles[id]}` : 'a member' }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [rows, handles])

  // A member picked in one window may have nothing in the next. Their option is
  // gone then, so fall back to everyone rather than filter by a name not on screen.
  const activeMember = members.some((m) => m.id === memberId) ? memberId : 'all'

  const problems = useMemo(() => groupProblems(rows, {
    kind: kind === 'all' ? undefined : kind,
    userId: activeMember === 'all' ? undefined : activeMember,
  }), [rows, kind, activeMember])

  const totals = useMemo(() => summarize(problems), [problems])

  const capNotice = data?.capped ? (
    <p className="text-xs text-[var(--color-ash)] font-mono">
      Showing the most recent {rows.length} of {data.total} entries in this window; older ones are not counted.
    </p>
  ) : null

  if (caseFileFor) {
    const back = () => setCaseFileFor(null)
    return (
      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={back}
          className="self-start min-h-[44px] font-mono text-xs uppercase text-[var(--color-ash)] hover:text-[var(--color-bone)] cursor-pointer"
        >
          ← Back to Site Errors
        </button>
        <UserModProfile userId={caseFileFor} onClose={back} initialTab="dossier" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <select aria-label="Time window" value={windowId} onChange={(e) => { setWindowId(e.target.value); setOpenKey(null) }} className={SELECT}>
          {WINDOWS.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
        </select>
        <select aria-label="Kind" value={kind} onChange={(e) => setKind(e.target.value)} className={SELECT}>
          <option value="all">All kinds</option>
          {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
        </select>
        <select aria-label="Member" value={activeMember} onChange={(e) => setMemberId(e.target.value)} className={SELECT}>
          <option value="all">All members</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </div>

      {isLoading ? (
        <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-ash)] animate-pulse">Reading the error log…</p>
      ) : error ? (
        <div className="card-error p-4 text-sm">Could not load the error log: {error.message}</div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-[var(--color-ash)] italic font-serif py-6 text-center">Nothing went wrong in this window.</p>
      ) : problems.length === 0 ? (
        <>
          <p className="text-sm text-[var(--color-ash)] italic font-serif py-6 text-center">Nothing matches those filters.</p>
          {capNotice}
        </>
      ) : (
        <>
          <p className="font-mono text-xs text-[var(--color-bone)]">
            {plural(totals.problems, 'problem', 'problems')} · {plural(totals.members, 'member', 'members')} affected · {plural(totals.occurrences, 'occurrence', 'occurrences')}
          </p>
          {capNotice}
          <ul className="flex flex-col gap-2">
            {problems.map((p) => {
              const open = openKey === p.key
              return (
                <li key={p.key} className="card-surface">
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setOpenKey(open ? null : p.key)}
                    className="flex w-full min-h-[44px] flex-col gap-1 px-3 py-2 text-left cursor-pointer hover:bg-[var(--color-raised)]"
                  >
                    <span className="flex w-full items-baseline gap-3">
                      <span data-testid="problem-title" className="min-w-0 flex-1 break-words text-sm text-[var(--color-bone)]">{p.title}</span>
                      <span className="shrink-0 font-mono text-xs text-[var(--color-ember)]">{p.count}×</span>
                      <span className="shrink-0 font-mono text-xs text-[var(--color-ash)]">{shortDate(p.lastSeen)}</span>
                    </span>
                    <span className="break-words text-xs text-[var(--color-ash)]">
                      {[whoLine(p), p.pages[0]?.path, p.devices[0]?.label].filter(Boolean).join(' · ')}
                    </span>
                  </button>
                  {open && <ProblemDetail problem={p} nameOf={nameOf} onOpenMember={setCaseFileFor} />}
                </li>
              )
            })}
          </ul>
        </>
      )}

    </div>
  )
}
