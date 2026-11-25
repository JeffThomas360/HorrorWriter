import { useEffect, useState } from 'react'
import { fetchSuspected, suspicionHref, EVIDENCE_CAVEAT } from '../../lib/aiSuspicion'

const KIND = { story: 'Story', critique: 'Critique', thread: 'Thread', post: 'Post' }

const day = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

/**
 * Everything staff have tagged as suspected AI, newest first. The database only
 * returns rows from areas the viewer can screen. The tag is a mark for staff: it
 * hides nothing and tells nobody, so this list is the only place it adds up.
 */
export default function SuspectedAiTab() {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)
  const [member, setMember] = useState('')

  useEffect(() => {
    let stale = false
    fetchSuspected().then(
      (data) => { if (!stale) setRows(data) },
      (err) => { if (!stale) setError(err.message) },
    )
    return () => { stale = true }
  }, [])

  if (error) return <div className="card-error p-4 text-sm">Could not load the tagged list: {error}</div>
  if (!rows) {
    return <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-ash)] animate-pulse">Gathering what is tagged…</p>
  }
  if (rows.length === 0) {
    return <p className="py-4 text-sm italic font-serif text-[var(--color-ash)]">Nothing is tagged.</p>
  }

  const wanted = member.trim().replace(/^@/, '').toLowerCase()
  const shown = wanted
    ? rows.filter((row) => (row.author_handle || '').toLowerCase().includes(wanted))
    : rows

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-[var(--color-ash)]">{EVIDENCE_CAVEAT}</p>

      <div className="flex flex-col gap-1 max-w-xs">
        <label htmlFor="suspected-member" className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-ash)]">
          Filter by member
        </label>
        <input
          id="suspected-member"
          value={member}
          onChange={(e) => setMember(e.target.value)}
          placeholder="@handle"
          className="bg-[var(--color-void)] border border-[var(--color-line)] px-3 py-2 text-sm text-[var(--color-bone)] focus:border-[var(--color-ember)] outline-none font-mono"
        />
      </div>

      {shown.length === 0 ? (
        <p className="py-4 text-sm italic font-serif text-[var(--color-ash)]">
          Nothing tagged from a member matching &quot;{member.trim()}&quot;.
        </p>
      ) : (
        <ul>
          {shown.map((row) => (
            <li key={`${row.target_type}-${row.target_id}`} className="py-3 border-b border-[var(--color-line)] text-sm">
              <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-ash)] mr-2">
                {KIND[row.target_type] ?? row.target_type}
              </span>
              <a
                href={suspicionHref(row)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--color-bone)] underline decoration-[var(--color-line-hi)] underline-offset-2 hover:text-[var(--color-ember)]"
              >
                {row.title || 'Untitled'}
              </a>
              <span className="block mt-1 font-mono text-xs text-[var(--color-ash)]">
                <span className="text-[var(--color-bone)]">{row.author_handle ? `@${row.author_handle}` : 'deleted account'}</span>
                {' · '}tagged by {row.tagged_by_handle ? `@${row.tagged_by_handle}` : 'a former moderator'}
                {' · '}{day(row.tagged_at)}
                {row.machine_score !== null && row.machine_score !== undefined && (
                  <>{' · '}<span className="text-[var(--color-bone)]">Machine score {Number(row.machine_score).toFixed(2)}</span></>
                )}
              </span>
              <span className={`block mt-1 ${row.note ? 'text-[var(--color-bone)]' : 'italic text-[var(--color-ash)]'}`}>
                {row.note || 'No note left.'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
