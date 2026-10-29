import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from './AuthContext'
import { withProviders } from './Providers'
import { registerPasskey } from '../lib/passkey'
import { hasPasskeyPrompt, clearPasskeyPrompt } from '../lib/passkeyPrompt'

/**
 * The nudge after an email-link sign-in: add a passkey, so the next sign-in needs no
 * email. /auth/callback leaves a flag in localStorage when the link carried
 * `?via=email`; this island, mounted on every page, picks it up on whatever page the
 * member lands on and keeps showing until they press one of the two buttons.
 *
 * It renders nothing on the server and on its first client render, and only reads the
 * flag after mount, so hydration always matches. Hooks all run before the early
 * return. Like TicketReplyBanner it is a notice, not a gate: signed out, still
 * loading, or on the callback page itself (about to redirect), it shows nothing.
 */

const BUTTON =
  'inline-flex items-center font-mono text-xs uppercase tracking-widest px-4 min-h-[44px] border cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed'

function PasskeyPrompt() {
  const { session, user } = useAuth()
  const signedIn = Boolean(user || session)
  const [flagged, setFlagged] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!signedIn) {
      setFlagged(false)
      return
    }
    // The callback page signs the member in and redirects within moments; the
    // prompt belongs on the page they land on, not on this one.
    if (window.location.pathname.startsWith('/auth/')) return
    setFlagged(hasPasskeyPrompt())
  }, [signedIn])

  async function add() {
    if (busy) return
    setBusy(true)
    // Cleared up front: once they have chosen, no later page should ask again,
    // whether the device dialog succeeds, fails or is cancelled.
    clearPasskeyPrompt()
    try {
      await registerPasskey()
      toast.success('Passkey added')
      setFlagged(false)
    } catch (err) {
      // The panel stays so a cancelled dialog can be tried again.
      toast.error(err?.message || 'Could not add a passkey.')
    } finally {
      setBusy(false)
    }
  }

  function notNow() {
    clearPasskeyPrompt()
    setFlagged(false)
  }

  if (!signedIn || !flagged) return null

  return (
    <section
      role="region"
      aria-labelledby="passkey-prompt-text"
      className="fixed bottom-4 left-4 right-4 z-40 border border-[var(--color-line-hi)] bg-[var(--color-surface)] p-4 shadow-lg sm:right-auto sm:max-w-sm"
    >
      <p id="passkey-prompt-text" className="font-serif text-sm text-[var(--color-bone)]">
        Add a passkey so you won't need an email link next time.
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={add}
          disabled={busy}
          className={`${BUTTON} border-[var(--color-ember)] text-[var(--color-ember)] hover:bg-[var(--color-ember)] hover:text-[var(--color-void)]`}
        >
          Add passkey
        </button>
        <button
          type="button"
          onClick={notNow}
          className={`${BUTTON} border-[var(--color-line-hi)] text-[var(--color-bone)] hover:border-[var(--color-ember)] hover:text-[var(--color-ember)]`}
        >
          Not now
        </button>
      </div>
    </section>
  )
}

export default withProviders(PasskeyPrompt)
