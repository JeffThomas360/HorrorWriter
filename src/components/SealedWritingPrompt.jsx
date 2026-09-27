import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from './AuthContext'
import { loadSealModules } from '../lib/sealLoader'

const WRONG_CODE_ERROR = "That code doesn't open this seal."
const CORRUPT_BUNDLE_ERROR = "This seal looks damaged. Please contact the keeper — don't delete anything."
const RATE_LIMIT_ERROR = "Some of your writing couldn't be restored yet. Try again in an hour — nothing is lost."
const RESTORE_FAILED_ERROR = 'Unsealed, but restoring failed. Your seal is kept; please try again.'

// Inverse of DeleteAccount's bytesToBase64: build the Uint8Array in a plain
// loop rather than spreading atob's output, which is fine at these sizes and
// keeps this free of any call-stack-limited tricks.
function base64ToBytes(base64) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
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

  // No seal code is needed just to check whether one is waiting.
  useEffect(() => {
    if (!userId) return
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

  if (!seal && !done) return null

  const unseal = async () => {
    setBusy(true)
    setError(null)

    let api
    try {
      api = await loadSealModules()
    } catch {
      setError(RESTORE_FAILED_ERROR)
      setBusy(false)
      return
    }

    // The recovery code the member typed must never be logged or surface in
    // an error message — only the fixed, generic strings above ever reach setError.
    let payload
    try {
      const bytes = base64ToBytes(seal.bundle)
      payload = await api.unsealWriting(bytes, code)
    } catch (err) {
      setError(err?.message === 'corrupt-bundle' ? CORRUPT_BUNDLE_ERROR : WRONG_CODE_ERROR)
      setBusy(false)
      return
    }

    let counts
    try {
      counts = await api.restoreWriting(supabase, userId, payload)
    } catch (err) {
      setError(String(err?.message ?? '').includes('Rate limit exceeded') ? RATE_LIMIT_ERROR : RESTORE_FAILED_ERROR)
      setBusy(false)
      return
    }

    // restoreIdentity never throws — each field's outcome is reported independently.
    const identity = await api.restoreIdentity(supabase, userId, payload.identity)

    // Best-effort cleanup: the writing is already restored, so a failure to
    // remove the (now-redundant) seal is a loose end, not a reason to tell
    // the member their restore didn't work.
    try {
      await supabase.functions.invoke(`sealed-writing?sealed_at=${encodeURIComponent(seal.sealedAt)}`, { method: 'DELETE' })
    } catch {
      // ignored
    }
    refreshProfile?.().catch(() => {})

    setDone({ counts, identity, oldHandle: payload.identity?.handle ?? null, currentHandle: profile?.handle ?? null })
    setBusy(false)
  }

  if (done) {
    const lines = []
    if (done.identity.handle === 'restored') lines.push(`Your handle @${done.oldHandle} is yours again.`)
    else if (done.identity.handle === 'taken') {
      lines.push(`Your old handle @${done.oldHandle} is taken now, so you're still @${done.currentHandle}.`)
    }
    if (done.identity.displayName === 'restored') lines.push('Your display name is back.')

    return (
      <section className="border border-[var(--color-line)] p-4 mb-8 font-serif text-sm">
        <p>
          Welcome back. {done.counts.stories} stories and {done.counts.series} series are back, live.
        </p>
        {lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </section>
    )
  }

  return (
    <section className="border border-[var(--color-ember)] p-5 mb-8">
      <h2 className="font-serif font-bold text-lg mb-2">Sealed writing is waiting for you</h2>
      <p className="font-serif text-sm text-[var(--color-text-secondary)] mb-4">
        Enter the recovery code you saved when you left. Everything comes back, live.
      </p>
      <label htmlFor="recovery-code" className="font-mono text-xs uppercase block mb-2">
        Recovery code
      </label>
      <input
        id="recovery-code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        autoComplete="off"
        spellCheck="false"
        className="bg-[var(--color-bg-primary)] border border-[var(--color-line)] px-3 py-2 text-sm w-full font-mono mb-3"
      />
      {error && (
        <p role="alert" className="text-[var(--color-ember)] text-xs font-mono mb-3">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={!code.trim() || busy}
        onClick={unseal}
        className="bg-[var(--color-ember)] text-white font-mono text-xs uppercase px-4 py-2 disabled:opacity-40 cursor-pointer"
      >
        {busy ? 'Unsealing…' : 'Unseal my writing'}
      </button>
    </section>
  )
}
