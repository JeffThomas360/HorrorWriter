import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from './AuthContext'
import { loadSealModules } from '../lib/sealLoader'

const WRONG_CODE_ERROR = "That code doesn't open this seal."
const CORRUPT_BUNDLE_ERROR = "This seal looks damaged. Please contact the keeper — don't delete anything."
const RATE_LIMIT_ERROR = "Some of your writing couldn't be restored yet. Try again in an hour — nothing is lost."
const RESTORE_FAILED_ERROR = 'Unsealed, but restoring failed. Your seal is kept; please try again.'
const ERROR_ID = 'recovery-code-error'
const COULDNT_CLEAR_LINE =
  "Your writing is back, but the seal couldn't be cleared — if this box appears again, unsealing it is safe."

// Inverse of DeleteAccount's bytesToBase64: build the Uint8Array in a plain
// loop rather than spreading atob's output, which is fine at these sizes and
// keeps this free of any call-stack-limited tricks. atob() throws
// InvalidCharacterError on malformed input, which the caller treats as a
// damaged bundle, not a wrong code.
function base64ToBytes(base64) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// "1 story"/"2 stories", "1 series"/"2 series" — "series" doesn't pluralize.
function count(n, singular, plural = `${singular}s`) {
  return `${n} ${n === 1 ? singular : plural}`
}

// supabase-js's functions.invoke() reports failure via a returned `error`,
// not by throwing — but guard with try/catch anyway in case the underlying
// fetch itself throws (e.g. a network drop). Either way, a failed DELETE is
// a loose end, never a reason to say the restore itself failed: the writing
// is already back by the time this runs.
async function deleteSeal(sealedAt) {
  try {
    const { error } = await supabase.functions.invoke(`sealed-writing?sealed_at=${encodeURIComponent(sealedAt)}`, {
      method: 'DELETE',
    })
    return !error
  } catch {
    return false
  }
}

export default function SealedWritingPrompt() {
  const { session, profile, refreshProfile } = useAuth()
  const userId = session?.user?.id
  // { bundle: base64 string, sealedAt: exact value from GET, echoed back on DELETE } or null
  const [seal, setSeal] = useState(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(null)
  const unsealingRef = useRef(false)
  const successRef = useRef(null)

  // No seal code is needed just to check whether one is waiting.
  useEffect(() => {
    if (!supabase || !userId) return
    let cancelled = false
    supabase.functions
      .invoke('sealed-writing', { method: 'GET' })
      .then(({ data }) => {
        if (!cancelled && data?.waiting) setSeal({ bundle: data.bundle, sealedAt: data.sealed_at })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [userId])

  // Success is announced (role="status") but that alone doesn't move focus —
  // push it to the success section so screen reader / keyboard users land on it.
  useEffect(() => {
    if (done) successRef.current?.focus()
  }, [done])

  if (!seal && !done) return null

  const unseal = async () => {
    if (unsealingRef.current) return
    unsealingRef.current = true
    setBusy(true)
    setError(null)

    const fail = (message) => {
      setError(message)
      setBusy(false)
      unsealingRef.current = false
    }

    let api
    try {
      api = await loadSealModules()
    } catch {
      fail(RESTORE_FAILED_ERROR)
      return
    }

    // The recovery code the member typed must never be logged or surface in
    // an error message — only the fixed, generic strings above ever reach setError.
    let bytes
    try {
      bytes = base64ToBytes(seal.bundle)
    } catch {
      fail(CORRUPT_BUNDLE_ERROR)
      return
    }

    let payload
    try {
      payload = await api.unsealWriting(bytes, code)
    } catch (err) {
      fail(err?.message === 'corrupt-bundle' ? CORRUPT_BUNDLE_ERROR : WRONG_CODE_ERROR)
      return
    }

    const failRestore = (err) =>
      fail(String(err?.message ?? '').includes('Rate limit exceeded') ? RATE_LIMIT_ERROR : RESTORE_FAILED_ERROR)

    // Decide up front, before writing anything, whether any writing is still
    // missing. If it is (or the seal holds no writing at all), identity goes
    // back FIRST: a crash between the two steps then leaves writing missing,
    // so the replay plans it again and still gets it in. If nothing is missing
    // (e.g. Unseal again after a DELETE that silently failed last time), the
    // writing is already back — restoring identity again would revert any
    // rename made since the first restore, so skip it and just clear the seal.
    let plan
    try {
      plan = await api.planRestore(supabase, userId, payload)
    } catch (err) {
      failRestore(err)
      return
    }
    const alreadyRestored = !plan.missing && !plan.empty

    let identity = { handle: 'none', displayName: 'none' }
    if (!alreadyRestored) {
      try {
        identity = await api.restoreIdentity(supabase, userId, payload.identity)
      } catch {
        identity = { handle: 'failed', displayName: 'failed' }
      }
    }

    // Still run on an already-restored replay: it inserts no stories or series
    // then, but idempotently links any series part a crashed run left unlinked.
    let counts
    try {
      counts = await api.restoreWriting(supabase, userId, payload)
    } catch (err) {
      if (!alreadyRestored) refreshProfile?.().catch(() => {})
      failRestore(err)
      return
    }

    let cleared = await deleteSeal(seal.sealedAt)
    if (!cleared) cleared = await deleteSeal(seal.sealedAt)

    if (!alreadyRestored) refreshProfile?.().catch(() => {})

    setDone({
      counts,
      identity,
      alreadyRestored,
      cleared,
      oldHandle: payload.identity?.handle ?? null,
      currentHandle: profile?.handle ?? null,
    })
    setBusy(false)
    unsealingRef.current = false
  }

  if (done) {
    const lines = []
    if (done.counts?.drafts > 0) {
      lines.push(`${done.counts.drafts === 1 ? '1 private ritual draft is' : `${done.counts.drafts} private ritual drafts are`} back.`)
    }
    if (done.identity.handle === 'restored') lines.push(`Your handle @${done.oldHandle} is yours again.`)
    else if (done.identity.handle === 'taken') {
      lines.push(`Your old handle @${done.oldHandle} is taken now, so you're still @${done.currentHandle}.`)
    }
    else if (done.identity.handle === 'failed' && done.oldHandle) {
      lines.push(`We couldn't restore your handle @${done.oldHandle} — you can set it below.`)
    }
    if (done.identity.displayName === 'restored') lines.push('Your display name is back.')
    else if (done.identity.displayName === 'failed') lines.push("We couldn't restore your display name — you can set it below.")

    let headline
    if (done.alreadyRestored) {
      headline = `Your writing was already back.${done.cleared ? ' The old seal has been cleared.' : ''}`
    } else {
      const alreadyHereNote =
        done.counts.skipped > 0 ? ` (${done.counts.skipped} ${done.counts.skipped === 1 ? 'was' : 'were'} already here)` : ''
      headline = `Welcome back. ${count(done.counts.stories, 'story', 'stories')} and ${count(
        done.counts.series,
        'series',
        'series',
      )} are back, live.${alreadyHereNote}`
    }

    return (
      <section
        ref={successRef}
        role="status"
        tabIndex={-1}
        className="border border-[var(--color-line)] p-4 mb-8 font-serif text-sm outline-none"
      >
        <p>{headline}</p>
        {lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
        {!done.cleared && <p>{COULDNT_CLEAR_LINE}</p>}
      </section>
    )
  }

  return (
    <section className="border border-[var(--color-ember)] p-5 mb-8">
      <h2 className="font-serif font-bold text-lg mb-2">Sealed writing is waiting for you</h2>
      <p className="font-serif text-sm text-[var(--color-text-secondary)] mb-4">
        Enter the recovery code you saved when you left. Everything comes back, live.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!code.trim() || busy) return
          unseal()
        }}
      >
        <label htmlFor="recovery-code" className="font-mono text-xs uppercase block mb-2">
          Recovery code
        </label>
        <input
          id="recovery-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck="false"
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? ERROR_ID : undefined}
          className="bg-[var(--color-bg-primary)] border border-[var(--color-line)] px-3 py-2 text-sm w-full font-mono mb-3"
        />
        {error && (
          <p id={ERROR_ID} role="alert" className="text-[var(--color-ember)] text-xs font-mono mb-3">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={!code.trim() || busy}
          className="bg-[var(--color-ember)] text-white font-mono text-xs uppercase px-4 py-2 disabled:opacity-40 cursor-pointer"
        >
          {busy ? 'Unsealing…' : 'Unseal my writing'}
        </button>
      </form>
    </section>
  )
}
