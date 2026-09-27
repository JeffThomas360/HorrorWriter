import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from './AuthContext'
import { loadSealModules } from '../lib/sealLoader'

const FRESH_SIGN_IN_MS = 10 * 60 * 1000
const GENERIC_ERROR = 'Nothing was deleted. Please try again.'
const SEAL_ERROR = 'Nothing was deleted. Please try again, or choose Erase everything.'
const COPY_FAILED = 'Copy failed — select the code and copy it'
const BASE64_CHUNK = 32 * 1024
// Kept in sync with MAX_BUNDLE_BYTES in supabase/functions/_shared/deleteRequest.ts. Checking
// here too — before uploading, not just server-side — means an oversized bundle is rejected
// without spending a request, and with a clear message instead of a generic server 400.
const MAX_BUNDLE_BYTES = 5 * 1024 * 1024
const TOO_LARGE_ERROR = 'Your writing is too large to seal. Nothing was deleted.'

// seal.js pulls in the ~25 KB (gzipped) EFF wordlist, which must not land in
// the Profile page's main chunk, and must not start loading during SSR. Load
// it (and sealCollect.js) as a separate, dynamically-imported chunk lazily,
// on demand — never at module-evaluation time. Memoized so we don't refetch
// once it succeeds; reset to null on failure so a later attempt retries
// instead of being stuck on a cached rejection for the rest of the page's
// life.
let sealApiPromise = null
function loadSealApi() {
  if (!sealApiPromise) {
    sealApiPromise = loadSealModules().catch((err) => {
      sealApiPromise = null
      throw err
    })
  }
  return sealApiPromise
}

// Test-only seam: the cache above is deliberately module-scoped (it should
// live for the whole page, not per-render), which means it otherwise leaks
// across test cases in the same file. Not used by the app itself.
export function __resetSealApiCacheForTests() {
  sealApiPromise = null
}

// btoa(String.fromCharCode(...bytes)) blows the call stack on large bundles;
// build the binary string in chunks instead.
function bytesToBase64(bytes) {
  let binary = ''
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + BASE64_CHUNK))
  }
  return btoa(binary)
}

// The Edge Function can fail after partly succeeding (e.g. delete_member
// committed but signOut/deleteUser then failed), and it says so in the
// response body. A FunctionsHttpError carries that Response on `.context`;
// read it and show the server's own message when there is one, falling back
// to the generic text only when there's nothing readable there.
async function readErrorMessage(fnError) {
  try {
    const body = await fnError?.context?.json?.()
    if (body?.error) return body.error
  } catch {
    // context wasn't readable JSON -- fall through to the generic message
  }
  return GENERIC_ERROR
}

const ROWS = [
  ['Stories and series', 'Deleted for good', 'Encrypted in your browser, then removed from the site'],
  ['Can you get them back?', 'No, not by anyone', 'Yes: sign up again with the same email and enter your recovery code'],
  ['Can the keeper read them?', 'No, they\'re gone', 'No, only your code opens them'],
  ['Your critiques and forum replies', 'Deleted', 'Deleted (conversations aren\'t sealed)'],
  ['Profile, avatar, follows, sign-in', 'Deleted', 'Deleted'],
]

export default function DeleteAccount() {
  const { session } = useAuth()
  const [step, setStep] = useState('closed') // closed | choose | erase | preparing | seal | sealed-already
  const [typed, setTyped] = useState('')
  const [lastPart, setLastPart] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [copyStatus, setCopyStatus] = useState('')

  const signedInAt = Date.parse(session?.user?.last_sign_in_at ?? '')
  const fresh = Number.isFinite(signedInAt) && Date.now() - signedInAt <= FRESH_SIGN_IN_MS
  const emailConfirmed = Boolean(session?.user?.email_confirmed_at)

  // Kick off the seal chunk fetch as soon as the member is looking at the
  // choose step, so it's normally already cached by the time they click
  // "Seal my writing" — but fire-and-forget: a failure here is silent, and
  // just leaves loadSealApi() ready to retry on the next call.
  const openChoose = () => {
    setStep('choose')
    loadSealApi().catch(() => {})
  }

  const goErase = () => {
    setTyped('')
    setError(null)
    setStep('erase')
  }

  const beginSeal = async () => {
    setError(null)
    setTyped('')
    setLastPart('')
    setStep('preparing')
    try {
      const api = await loadSealApi()
      // Keep the code from an earlier visit to this step (e.g. after pressing Back): a
      // member who already saved or printed the first code must keep seeing that same
      // one, never a freshly generated replacement they haven't saved.
      setCode((prev) => prev || api.generateRecoveryCode())
      setStep('seal')
    } catch {
      setError(GENERIC_ERROR)
      setStep('choose')
    }
  }

  const copyCode = () => {
    setCopyStatus('')
    const clip = navigator.clipboard?.writeText ? navigator.clipboard.writeText(code) : Promise.reject()
    clip.then(
      () => setCopyStatus('Copied'),
      () => setCopyStatus(COPY_FAILED),
    )
  }

  const downloadCode = () => {
    const blob = new Blob([code + '\n'], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'horrorwriter-recovery-code.txt'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  // Printing the live page would print the whole dark-themed site (bone text
  // on white paper is ~1.25:1, unreadable) with no print stylesheet of its
  // own. Print a dedicated, minimal, black-on-white document instead, built
  // in a hidden iframe so the member's own page is untouched. The code is
  // inserted as text (never innerHTML) so it can't be misinterpreted as
  // markup.
  const printCode = () => {
    const iframe = document.createElement('iframe')
    iframe.style.position = 'fixed'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = '0'
    iframe.setAttribute('aria-hidden', 'true')
    document.body.appendChild(iframe)

    let cleaned = false
    const cleanup = () => {
      if (cleaned) return
      cleaned = true
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
    }
    const fallback = setTimeout(cleanup, 3000)

    iframe.onload = () => {
      const doc = iframe.contentDocument
      const win = iframe.contentWindow
      if (!doc || !win) {
        cleanup()
        return
      }
      const heading = doc.createElement('h1')
      heading.textContent = 'HorrorWriter recovery code'
      const codeEl = doc.createElement('pre')
      codeEl.textContent = code
      codeEl.style.fontFamily = 'monospace'
      codeEl.style.fontSize = '28px'
      codeEl.style.whiteSpace = 'pre-wrap'
      codeEl.style.wordBreak = 'break-all'
      const note = doc.createElement('p')
      note.textContent = 'Without this code your writing can never be recovered. Not by us, not by anyone.'
      doc.body.style.color = '#000'
      doc.body.style.background = '#fff'
      doc.body.style.fontFamily = 'sans-serif'
      doc.body.appendChild(heading)
      doc.body.appendChild(codeEl)
      doc.body.appendChild(note)

      win.addEventListener(
        'afterprint',
        () => {
          clearTimeout(fallback)
          cleanup()
        },
        { once: true },
      )
      win.focus()
      win.print()
    }
    iframe.srcdoc = '<!DOCTYPE html><html><head><title>HorrorWriter recovery code</title></head><body></body></html>'
  }

  const sealReady = lastPart.trim().toUpperCase() === code.split('-').pop() && typed === 'DELETE'

  const seal = async () => {
    setBusy(true)
    setError(null)
    try {
      const api = await loadSealApi()
      const payload = await api.collectWriting(supabase, session.user.id)
      const bundle = await api.sealWriting(payload, code)
      if (bundle.length > MAX_BUNDLE_BYTES) {
        setError(TOO_LARGE_ERROR)
        setBusy(false)
        return
      }
      const base64 = bytesToBase64(bundle)
      const { data, error: fnError } = await supabase.functions.invoke('delete-account', { body: { mode: 'seal', bundle: base64 } })
      if (fnError) {
        setError(await readErrorMessage(fnError))
        setBusy(false)
        return
      }
      // A retry of a partial failure: the real seal was stored on the FIRST attempt, and
      // the code shown on THIS attempt was never sent anywhere -- it doesn't open anything.
      // Don't sign out or redirect yet; make the member read that before leaving the page.
      if (data?.sealAlreadyStored === true) {
        setBusy(false)
        setStep('sealed-already')
        return
      }
      // The server has already deleted the account at this point. A signOut failure here
      // is a client-side loose end, not a reason to tell the member nothing happened.
      try {
        await supabase.auth.signOut()
      } catch {
        // ignored: fall through to the redirect below regardless
      }
      window.location.href = '/'
    } catch {
      setError(SEAL_ERROR)
      setBusy(false)
    }
  }

  const continueAfterAlreadySealed = async () => {
    try {
      await supabase.auth.signOut()
    } catch {
      // ignored: fall through to the redirect below regardless
    }
    window.location.href = '/'
  }

  const erase = async () => {
    setBusy(true)
    setError(null)
    try {
      const { error: fnError } = await supabase.functions.invoke('delete-account', { body: { mode: 'erase' } })
      if (fnError) {
        setError(await readErrorMessage(fnError))
        setBusy(false)
        return
      }
      // The server has already deleted the account at this point. A signOut failure here
      // is a client-side loose end, not a reason to tell the member nothing happened.
      try {
        await supabase.auth.signOut()
      } catch {
        // ignored: fall through to the redirect below regardless
      }
      window.location.href = '/'
    } catch (err) {
      setError(GENERIC_ERROR)
      setBusy(false)
    }
  }

  return (
    <section className="mt-12 border-t border-[var(--color-line)] pt-8 max-w-2xl">
      <h2 className="font-serif font-bold text-xl mb-3">Delete my account</h2>

      {step === 'closed' && (
        <button type="button" onClick={openChoose}
          className="border border-[var(--color-line)] hover:border-[var(--color-ember)] font-mono text-xs uppercase px-4 py-2 cursor-pointer">
          Delete my account
        </button>
      )}

      {step !== 'closed' && step !== 'sealed-already' && !fresh && (
        <p className="font-serif text-sm text-[var(--color-text-secondary)]">
          For your safety, sign in again, then come back here within 10 minutes.{' '}
          <button type="button" onClick={() => supabase.auth.signOut()} className="underline cursor-pointer">Sign out now</button>
        </p>
      )}

      {step === 'choose' && fresh && (
        <div>
          <table className="w-full text-xs font-serif mb-6 border-collapse">
            <thead>
              <tr className="text-left font-mono uppercase">
                <th className="py-2 pr-3"></th><th className="py-2 pr-3">Erase everything</th><th className="py-2">Seal my writing</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map(([label, eraseText, sealText]) => (
                <tr key={label} className="border-t border-[var(--color-line)] align-top">
                  <th scope="row" className="py-2 pr-3 text-left font-mono">{label}</th>
                  <td className="py-2 pr-3">{eraseText}</td><td className="py-2">{sealText}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex gap-3">
            <button type="button" onClick={goErase}
              className="border border-[var(--color-ember)] text-[var(--color-ember)] font-mono text-xs uppercase px-4 py-2 cursor-pointer">
              Erase everything
            </button>
            <button type="button" onClick={beginSeal} disabled={!emailConfirmed}
              className="border border-[var(--color-line)] hover:border-[var(--color-ember)] font-mono text-xs uppercase px-4 py-2 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
              Seal my writing
            </button>
            <button type="button" onClick={() => setStep('closed')} className="font-mono text-xs uppercase px-4 py-2 cursor-pointer">
              Cancel
            </button>
          </div>
          {!emailConfirmed && (
            <p className="font-serif text-xs text-[var(--color-text-secondary)] mt-3">
              Sealing needs a confirmed email address, so you can find your seal again.
            </p>
          )}
          {error && <p role="alert" className="text-[var(--color-ember)] text-xs font-mono mt-3">{error}</p>}
        </div>
      )}

      {step === 'preparing' && fresh && (
        <p role="status" className="font-serif text-sm text-[var(--color-text-secondary)]">Preparing…</p>
      )}

      {step === 'seal' && fresh && (
        <div className="flex flex-col gap-3">
          <p className="font-serif text-sm">
            Without this code your writing can never be recovered. Not by us, not by anyone.
          </p>
          <code className="block bg-[var(--color-bg-primary)] border border-[var(--color-line)] px-3 py-2 text-sm break-all">{code}</code>
          <div className="flex gap-3 items-center">
            <button type="button" disabled={busy} onClick={copyCode}
              className="border border-[var(--color-line)] font-mono text-xs uppercase px-4 py-2 disabled:opacity-40 cursor-pointer">Copy</button>
            <button type="button" disabled={busy} onClick={downloadCode}
              className="border border-[var(--color-line)] font-mono text-xs uppercase px-4 py-2 disabled:opacity-40 cursor-pointer">Download</button>
            <button type="button" disabled={busy} onClick={printCode}
              className="border border-[var(--color-line)] font-mono text-xs uppercase px-4 py-2 disabled:opacity-40 cursor-pointer">Print</button>
            {copyStatus && <span role="status" className="font-mono text-xs text-[var(--color-text-secondary)]">{copyStatus}</span>}
          </div>
          <label htmlFor="seal-last-part" className="font-mono text-xs uppercase">Type the last 4 characters of your code (after the final dash)</label>
          <input id="seal-last-part" maxLength={4} value={lastPart} onChange={(e) => setLastPart(e.target.value)} autoComplete="off"
            spellCheck={false} autoCapitalize="characters"
            className="bg-[var(--color-bg-primary)] border border-[var(--color-line)] px-3 py-2 text-sm max-w-xs" />
          <label htmlFor="confirm-delete-seal" className="font-mono text-xs uppercase">Type DELETE to confirm</label>
          <input id="confirm-delete-seal" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off"
            className="bg-[var(--color-bg-primary)] border border-[var(--color-line)] px-3 py-2 text-sm max-w-xs" />
          {error && <p role="alert" className="text-[var(--color-ember)] text-xs font-mono">{error}</p>}
          <div className="flex gap-3">
            <button type="button" disabled={!sealReady || busy} onClick={seal}
              className="bg-[var(--color-ember)] text-white font-mono text-xs uppercase px-4 py-2 disabled:opacity-40 cursor-pointer">
              {busy ? 'Sealing…' : 'Seal and delete'}
            </button>
            <button type="button" disabled={busy} onClick={openChoose}
              className="font-mono text-xs uppercase px-4 py-2 disabled:opacity-40 cursor-pointer">Back</button>
          </div>
        </div>
      )}

      {step === 'sealed-already' && (
        <div className="flex flex-col gap-3">
          <p role="status" className="font-serif text-sm">
            Your writing was already sealed on your first attempt. Keep the recovery code from that
            attempt — the code from this attempt won't open it.
          </p>
          <div className="flex gap-3">
            <button type="button" onClick={continueAfterAlreadySealed}
              className="bg-[var(--color-ember)] text-white font-mono text-xs uppercase px-4 py-2 cursor-pointer">
              Continue
            </button>
          </div>
        </div>
      )}

      {step === 'erase' && fresh && (
        <div className="flex flex-col gap-3">
          <p className="font-serif text-sm">This cannot be undone. Your stories, series, critiques, posts and profile will be gone for good.</p>
          <label htmlFor="confirm-delete" className="font-mono text-xs uppercase">Type DELETE to confirm</label>
          <input id="confirm-delete" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off"
            className="bg-[var(--color-bg-primary)] border border-[var(--color-line)] px-3 py-2 text-sm max-w-xs" />
          {error && <p role="alert" className="text-[var(--color-ember)] text-xs font-mono">{error}</p>}
          <div className="flex gap-3">
            <button type="button" disabled={typed !== 'DELETE' || busy} onClick={erase}
              className="bg-[var(--color-ember)] text-white font-mono text-xs uppercase px-4 py-2 disabled:opacity-40 cursor-pointer">
              {busy ? 'Erasing…' : 'Erase my account'}
            </button>
            <button type="button" onClick={openChoose} className="font-mono text-xs uppercase px-4 py-2 cursor-pointer">Back</button>
          </div>
        </div>
      )}
    </section>
  )
}
