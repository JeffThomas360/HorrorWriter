import { useEffect, useMemo, useState } from 'react'
import { isPermanentBan } from '../../lib/moderation'
import {
  SUBMISSION_KINDS,
  fetchUserSubmissions,
  groupByKind,
  summarize,
  submissionHref,
  formatEdits,
} from '../../lib/submissions'
import CaseFileTabs from './CaseFileTabs'

const CRITIQUES = { key: 'critiques', label: 'Critiques', one: 'critique', many: 'critiques' }
const REPLIES = { key: 'replies', label: 'Replies', one: 'reply', many: 'replies' }
const EDITS = { key: 'edits', label: 'Edits', one: 'edit', many: 'edits', format: formatEdits }
const REPORTS = { key: 'reports', label: 'Reports', one: 'report', many: 'reports', hideAtZero: true }

// Only stories and Ritual entries can be edited, so only they get an Edits column.
const LAYOUT = {
  story: { first: 'Title', columns: [CRITIQUES, EDITS, REPORTS] },
  ritual: { first: 'Entry', columns: [CRITIQUES, EDITS, REPORTS] },
  thread: { first: 'Title', columns: [REPLIES, REPORTS] },
  reply: { first: 'Reply', columns: [REPORTS] },
  critique: { first: 'Critique', columns: [REPORTS] },
}

const STATUS = { live: 'Live', screening: 'In screening', hidden: 'Hidden' }

const day = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

function contextLine(row) {
  if (!row.context_title) return null
  if (row.kind === 'ritual') return `Prompt: ${row.context_title}`
  if (row.kind === 'reply') return `in ${row.context_title}`
  if (row.kind === 'critique') return `on ${row.context_title} (${row.context_kind === 'ritual' ? 'Ritual' : 'story'})`
  return null
}

function StatusText({ status }) {
  const live = status === 'live'
  return <span className={live ? 'text-[var(--color-ash)]' : 'text-[var(--color-ember)]'}>{STATUS[status] ?? status}</span>
}

/** The title or excerpt, linked to the submission, with what it belongs to underneath. */
function RowHeading({ row }) {
  const href = submissionHref(row)
  const text = row.title ?? row.excerpt ?? 'Untitled'
  const context = contextLine(row)
  return (
    <>
      {href
        ? <a href={href} target="_blank" rel="noopener noreferrer" className="text-[var(--color-bone)] underline decoration-[var(--color-line-hi)] underline-offset-2 hover:text-[var(--color-ember)]">{text}</a>
        : <span className="text-[var(--color-bone)]">{text}</span>}
      {context && <span className="block mt-0.5 text-xs text-[var(--color-ash)] line-clamp-2">{context}</span>}
    </>
  )
}

function metricClass(column, value) {
  if (column.key === 'reports' && value > 0) return 'text-[var(--color-ember)]'
  return value ? 'text-[var(--color-bone)]' : 'text-[var(--color-ash)]'
}

function SubmissionsTable({ kind, rows }) {
  const { first, columns } = LAYOUT[kind]
  const th = 'font-mono text-[10px] uppercase tracking-widest text-[var(--color-ash)] py-2 pr-4 font-normal'
  return (
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="border-b border-[var(--color-line)] text-left">
          <th className={th}>{first}</th>
          <th className={th}>Posted</th>
          {columns.map((c) => <th key={c.key} className={`${th} text-right`}>{c.label}</th>)}
          <th className={th}>Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} className="border-b border-[var(--color-line)] align-top">
            <td className="py-2 pr-4"><RowHeading row={row} /></td>
            <td className="py-2 pr-4 font-mono text-xs text-[var(--color-ash)] whitespace-nowrap">{day(row.created_at)}</td>
            {columns.map((c) => {
              const value = row[c.key] ?? 0
              return (
                <td key={c.key} className={`py-2 pr-4 text-right font-mono text-xs ${metricClass(c, value)}`}>
                  {c.format ? c.format(row) : value}
                </td>
              )
            })}
            <td className="py-2 font-mono text-xs whitespace-nowrap"><StatusText status={row.mod_status} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** The same details in a line of words, for panels too narrow for a table. */
function SubmissionsStacked({ kind, rows }) {
  const { columns } = LAYOUT[kind]
  return (
    <ul data-testid="submissions-stacked">
      {rows.map((row) => (
        <li key={row.id} className="py-2.5 border-b border-[var(--color-line)] text-sm">
          <RowHeading row={row} />
          <span className="block mt-1 font-mono text-[11px] leading-relaxed text-[var(--color-ash)]">
            {day(row.created_at)}
            {columns.map((c) => {
              const value = row[c.key] ?? 0
              if (c.hideAtZero && !value) return null
              const shown = String(c.format ? c.format(row) : value)
              return <span key={c.key} className={c.key === 'reports' ? 'text-[var(--color-ember)]' : undefined}> · {shown} {shown === '1' ? c.one : c.many}</span>
            })}
            {' · '}<StatusText status={row.mod_status} />
          </span>
        </li>
      ))}
    </ul>
  )
}

function SummaryLine({ rows }) {
  if (rows.length === 0) {
    return <p data-testid="submissions-summary" className="text-sm italic font-serif text-[var(--color-ash)]">Nothing on the site from this member right now.</p>
  }
  const s = summarize(rows)
  const flags = [
    s.hidden > 0 && `${s.hidden} hidden`,
    s.screening > 0 && `${s.screening} in screening`,
    s.reports > 0 && plural(s.reports, 'report', 'reports'),
  ].filter(Boolean)
  return (
    <p data-testid="submissions-summary" className="font-mono text-xs leading-relaxed text-[var(--color-ash)]">
      <span className="text-[var(--color-bone)]">First post</span> {day(s.first)}
      {' · '}<span className="text-[var(--color-bone)]">Last post</span> {day(s.last)}
      {flags.map((f) => <span key={f} className="text-[var(--color-ember)]"> · {f}</span>)}
    </p>
  )
}

/**
 * The case file's second tab: what this member has put on the site. Counts and rows mean
 * "on the site now"; anything deleted is gone, by the site's deletion policy.
 *
 * The case file is wide when opened from Admin → Users and narrow from Reports or Sanctions,
 * on the same screen, so the table/stacked switch follows the panel's width rather than the
 * viewport's: a container query.
 */
export default function UserSubmissions({ userId, bannedUntil }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)
  const [picked, setPicked] = useState(null)

  useEffect(() => {
    let stale = false
    setRows(null)
    setError(null)
    setPicked(null)
    fetchUserSubmissions(userId).then(
      (data) => { if (!stale) setRows(data) },
      (err) => { if (!stale) setError(err.message) },
    )
    return () => { stale = true }
  }, [userId])

  const groups = useMemo(() => groupByKind(rows ?? []), [rows])

  if (error) return <div className="card-error p-4 text-sm">Could not load submissions: {error}</div>
  if (!rows) {
    return <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-ash)] animate-pulse">Gathering submissions…</p>
  }

  const active = picked ?? SUBMISSION_KINDS.find((k) => groups[k.id].length > 0)?.id ?? SUBMISSION_KINDS[0].id
  const activeKind = SUBMISSION_KINDS.find((k) => k.id === active)
  const activeRows = groups[active]
  const sanctioned = bannedUntil && new Date(bannedUntil) > new Date()

  return (
    <div className="@container flex flex-col gap-4">
      {sanctioned && (
        <div role="status" className="border border-[var(--color-blood)] px-3 py-2 text-sm text-[var(--color-bone)]">
          {isPermanentBan(bannedUntil)
            ? "Permanently banned. Readers can't see any of this, including rows marked Live."
            : `Suspended until ${new Date(bannedUntil).toLocaleDateString()}. Readers can't see any of this while the suspension runs, including rows marked Live.`}
        </div>
      )}

      <SummaryLine rows={rows} />

      <CaseFileTabs
        label="Submission types"
        idPrefix="submissions"
        variant="sub"
        tabs={SUBMISSION_KINDS.map((k) => ({ ...k, count: groups[k.id].length, muted: groups[k.id].length === 0 }))}
        active={active}
        onChange={setPicked}
      />

      <div role="tabpanel" id="submissions-panel" aria-labelledby={`submissions-tab-${active}`}>
        {activeRows.length === 0 ? (
          <p className="py-4 text-sm italic font-serif text-[var(--color-ash)]">No {activeKind.label.toLowerCase()} from this member.</p>
        ) : (
          <>
            <div className="hidden @2xl:block"><SubmissionsTable kind={active} rows={activeRows} /></div>
            <div className="@2xl:hidden"><SubmissionsStacked kind={active} rows={activeRows} /></div>
          </>
        )}
      </div>
    </div>
  )
}
