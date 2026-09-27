import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from './AuthContext'

const FRESH_SIGN_IN_MS = 10 * 60 * 1000
const GENERIC_ERROR = 'Nothing was deleted. Please try again.'
const SEAL_ERROR = 'Nothing was deleted. Please try again, or choose Erase everything.'
const BASE64_CHUNK = 32 * 1024

// seal.js pulls in the ~25 KB (gzipped) EFF wordlist, which must not land in
// the Profile page's main chunk. Load it (and sealCollect.js) as a separate,
// dynamically-imported chunk as soon as this component's own code loads, so
// it's normally already cached by the time a member reaches the seal step —
// with a "Preparing…" fallback in beginSeal for the rare case it isn't yet.
let sealApi = null
const sealApiPromise = Promise.all([import('../lib/seal'), import('../lib/sealCollect')]).then(
  ([seal, sealCollect]) => {
    sealApi = { ...seal, ...sealCollect }
    return sealApi
  },
)

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
  const [step, setStep] = useState('closed') // closed | choose | erase | preparing | seal
  const [typed, setTyped] = useState('')
  const [lastPart, setLastPart] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const signedInAt = Date.parse(session?.user?.last_sign_in_at ?? '')
  const fresh = Number.isFinite(signedInAt) && Date.now() - signedInAt <= FRESH_SIGN_IN_MS

  const goErase = () => {
    setTyped('')
    setError(null)
    setStep('erase')
  }

  const beginSeal = () => {
    setError(null)
    setTyped('')
    setLastPart('')
    if (sealApi) {
      setCode(sealApi.generateRecoveryCode())
      setStep('seal')
      return
    }
    setStep('preparing')
    sealApiPromise
      .then((api) => {
        setCode(api.generateRecoveryCode())
        setStep('seal')
      })
      .catch(() => {
        setError(GENERIC_ERROR)
        setStep('choose')
      })
  }

  const copyCode = () => navigator.clipboard.writeText(code)

  const downloadCode = () => {
    const blob = new Blob([code + '\n'], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'horrorwriter-recovery-code.txt'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const printCode = () => window.print()

  const sealReady = lastPart.trim().toUpperCase() === code.split('-').pop() && typed === 'DELETE'

  const seal = async () => {
    setBusy(true)
    setError(null)
    try {
      const payload = await sealApi.collectWriting(supabase, session.user.id)
      const bundle = await sealApi.sealWriting(payload, code)
      const base64 = bytesToBase64(bundle)
      const { error: fnError } = await supabase.functions.invoke('delete-account', { body: { mode: 'seal', bundle: base64 } })
      if (fnError) {
        setError(await readErrorMessage(fnError))
        setBusy(false)
        return
      }
      await supabase.auth.signOut()
      window.location.href = '/'
    } catch {
      setError(SEAL_ERROR)
      setBusy(false)
    }
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
      await supabase.auth.signOut()
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
        <button type="button" onClick={() => setStep('choose')}
          className="border border-[var(--color-line)] hover:border-[var(--color-ember)] font-mono text-xs uppercase px-4 py-2 cursor-pointer">
          Delete my account
        </button>
      )}

      {step !== 'closed' && !fresh && (
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
            <button type="button" onClick={beginSeal}
              className="border border-[var(--color-line)] hover:border-[var(--color-ember)] font-mono text-xs uppercase px-4 py-2 cursor-pointer">
              Seal my writing
            </button>
            <button type="button" onClick={() => setStep('closed')} className="font-mono text-xs uppercase px-4 py-2 cursor-pointer">
              Cancel
            </button>
          </div>
          {error && <p role="alert" className="text-[var(--color-ember)] text-xs font-mono mt-3">{error}</p>}
        </div>
      )}

      {step === 'preparing' && fresh && (
        <p className="font-serif text-sm text-[var(--color-text-secondary)]">Preparing…</p>
      )}

      {step === 'seal' && fresh && (
        <div className="flex flex-col gap-3">
          <p className="font-serif text-sm">
            Without this code your writing can never be recovered. Not by us, not by anyone.
          </p>
          <code className="block bg-[var(--color-bg-primary)] border border-[var(--color-line)] px-3 py-2 text-sm break-all">{code}</code>
          <div className="flex gap-3">
            <button type="button" onClick={copyCode} className="border border-[var(--color-line)] font-mono text-xs uppercase px-4 py-2 cursor-pointer">Copy</button>
            <button type="button" onClick={downloadCode} className="border border-[var(--color-line)] font-mono text-xs uppercase px-4 py-2 cursor-pointer">Download</button>
            <button type="button" onClick={printCode} className="border border-[var(--color-line)] font-mono text-xs uppercase px-4 py-2 cursor-pointer">Print</button>
          </div>
          <label htmlFor="seal-last-part" className="font-mono text-xs uppercase">Type the last part of your code</label>
          <input id="seal-last-part" value={lastPart} onChange={(e) => setLastPart(e.target.value)} autoComplete="off"
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
            <button type="button" onClick={() => setStep('choose')} className="font-mono text-xs uppercase px-4 py-2 cursor-pointer">Back</button>
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
            <button type="button" onClick={() => setStep('choose')} className="font-mono text-xs uppercase px-4 py-2 cursor-pointer">Back</button>
          </div>
        </div>
      )}
    </section>
  )
}
