import { useEffect, useRef, useState } from 'react'
import { useAuth } from './AuthContext'
import { withProviders } from './Providers'
import { readArrival, settleArrival } from '../lib/arrival'
import { recordArrival, fetchArrivalPromptDue, recordFoundVia } from '../lib/arrivalApi'
import { passkeyPromptFor } from '../lib/passkeyPrompt'

/**
 * Two small jobs for a member who has just joined, on whatever page they land on.
 *
 * 1. Send how they arrived. lib/arrival.js noted it in this browser on their first
 *    page; within a day of joining it is sent, and once the server has taken it the
 *    note is marked done, so no later page is sent in its place. A send that fails
 *    is left to try again on the next page. An older account's note is marked done
 *    unsent.
 * 2. Ask "What brought you here?", once, in their first week. Optional, with a Skip.
 *    The server remembers they were asked, so no other device asks again.
 *
 * It renders nothing on the server and on its first client render, and reads storage
 * only after mount, so hydration always matches. Hooks all run before the early
 * return. Like PasskeyPrompt it is a notice, not a gate, and it waits its turn: while
 * the passkey prompt is waiting for this member, the card stays away until a later page.
 */

const DAY = 24 * 60 * 60 * 1000

const BUTTON =
  'inline-flex items-center font-mono text-xs uppercase tracking-widest px-4 min-h-[44px] border cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed'

function ArrivalPrompt() {
  const { user, profile, isLoading } = useAuth()
  const userId = user?.id ?? null
  const joinedAt = profile?.created_at ?? null
  const [asking, setAsking] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const sentFor = useRef(null)

  useEffect(() => {
    if (isLoading || !userId || !joinedAt) {
      setAsking(false)
      return
    }
    // The callback page signs the member in and redirects within moments.
    if (window.location.pathname.startsWith('/auth/')) return

    const age = Date.now() - new Date(joinedAt).getTime()
    if (!Number.isFinite(age)) return
    let stale = false

    // 1. Their arrival: sent once per page load, for a new account only.
    if (sentFor.current !== userId) {
      sentFor.current = userId
      const stored = readArrival()
      if (stored) {
        if (age < DAY) recordArrival(stored).then((taken) => { if (taken) settleArrival() })
        else settleArrival()
      }
    }

    // 2. The question: first week only, and never on top of the passkey prompt.
    if (age < 7 * DAY && passkeyPromptFor() !== userId) {
      fetchArrivalPromptDue().then((due) => { if (!stale) setAsking(due === true) })
    } else {
      setAsking(false)
    }

    return () => { stale = true }
  }, [isLoading, userId, joinedAt])

  async function save(answer) {
    if (busy) return
    setBusy(true)
    try {
      await recordFoundVia(answer)
      setAsking(false)
    } catch {
      if (failed || answer === '') {
        // They have tried, or they only wanted it gone: stop asking on this page.
        setAsking(false)
      } else {
        setFailed(true)
      }
    } finally {
      setBusy(false)
    }
  }

  if (!userId || !asking) return null

  return (
    <section
      role="region"
      aria-labelledby="arrival-prompt-heading"
      className="fixed bottom-4 left-4 right-4 z-40 border border-[var(--color-line-hi)] bg-[var(--color-surface)] p-4 shadow-lg sm:right-auto sm:max-w-sm"
    >
      <h2 id="arrival-prompt-heading" className="font-serif text-sm font-bold text-[var(--color-bone)]">
        What brought you here?
      </h2>
      <p className="mt-1 font-serif text-xs text-[var(--color-ash)]">Optional. Only the Keeper sees your answer.</p>
      <form
        className="mt-3 flex flex-col gap-3"
        onSubmit={(e) => { e.preventDefault(); save(text.trim()) }}
      >
        <input
          type="text"
          aria-label="What brought you here?"
          maxLength={200}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="min-h-[44px] w-full border border-[var(--color-line)] bg-[var(--color-void)] px-3 py-2 text-sm text-[var(--color-bone)] outline-none focus:border-[var(--color-ember)]"
        />
        {failed && (
          <p role="alert" className="font-serif text-xs text-[var(--color-ember)]">That didn't save. Try again, or skip.</p>
        )}
        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={busy}
            className={`${BUTTON} border-[var(--color-ember)] text-[var(--color-ember)] hover:bg-[var(--color-ember)] hover:text-[var(--color-void)]`}
          >
            Send
          </button>
          <button
            type="button"
            onClick={() => save('')}
            disabled={busy}
            className={`${BUTTON} border-[var(--color-line-hi)] text-[var(--color-bone)] hover:border-[var(--color-ember)] hover:text-[var(--color-ember)]`}
          >
            Skip
          </button>
        </div>
      </form>
    </section>
  )
}

export default withProviders(ArrivalPrompt)
