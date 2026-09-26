import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from './AuthContext'

const FRESH_SIGN_IN_MS = 10 * 60 * 1000
const GENERIC_ERROR = 'Nothing was deleted. Please try again.'

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
  const [step, setStep] = useState('closed') // closed | choose | erase
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const signedInAt = Date.parse(session?.user?.last_sign_in_at ?? '')
  const fresh = Number.isFinite(signedInAt) && Date.now() - signedInAt <= FRESH_SIGN_IN_MS

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
            <button type="button" onClick={() => setStep('erase')}
              className="border border-[var(--color-ember)] text-[var(--color-ember)] font-mono text-xs uppercase px-4 py-2 cursor-pointer">
              Erase everything
            </button>
            <button type="button" onClick={() => setStep('closed')} className="font-mono text-xs uppercase px-4 py-2 cursor-pointer">
              Cancel
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
            <button type="button" onClick={() => setStep('choose')} className="font-mono text-xs uppercase px-4 py-2 cursor-pointer">Back</button>
          </div>
        </div>
      )}
    </section>
  )
}
