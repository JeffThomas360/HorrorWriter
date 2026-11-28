import { useEffect, useState } from 'react'
import { offTokenFrom, turnOffByToken } from '../lib/emailPref'

/**
 * /email-off/?t=<token> — where the "Turn these emails off" link in a response
 * email lands. Works signed out: the token is the proof.
 *
 * It asks for one click rather than acting on load, because mail scanners open
 * the links in an email before the member does.
 */
export default function EmailOff() {
  // The token is read after mount: the server render has no query string, and
  // reading it during render would not match on hydration.
  const [token, setToken] = useState(undefined)
  const [state, setState] = useState('idle') // idle | working | done | failed

  useEffect(() => {
    setToken(offTokenFrom(window.location.search))
  }, [])

  const turnOff = async () => {
    setState('working')
    setState((await turnOffByToken(token)) ? 'done' : 'failed')
  }

  const fallback = (
    <p className="text-sm font-serif text-[var(--color-text-secondary)] leading-relaxed">
      You can also turn these emails off on <a className="underline underline-offset-4 hover:text-[var(--color-ember)]" href="/profile/">your profile</a>, under Email.
    </p>
  )

  return (
    <section className="max-w-xl mx-auto py-16" data-testid="email-off">
      <h1 className="text-3xl font-serif font-black mb-6">Response emails</h1>

      {state === 'done' ? (
        <>
          <p className="text-base font-serif leading-relaxed mb-4" role="status">
            Done. We won't email you when someone responds to your writing.
          </p>
          <p className="text-sm font-serif text-[var(--color-text-secondary)] leading-relaxed">
            Changed your mind? Turn them back on from <a className="underline underline-offset-4 hover:text-[var(--color-ember)]" href="/profile/">your profile</a>, under Email.
          </p>
        </>
      ) : token === null || state === 'failed' ? (
        <>
          <p className="text-base font-serif leading-relaxed mb-4" role="alert">
            {state === 'failed'
              ? "That didn't work. The link may be old, or the connection dropped."
              : 'This link is missing its code, so we cannot tell whose emails to turn off.'}
          </p>
          {fallback}
        </>
      ) : (
        <>
          <p className="text-base font-serif leading-relaxed mb-6">
            We send one short email when someone critiques or replies to your writing. Turn those emails off?
          </p>
          <button
            type="button"
            onClick={turnOff}
            disabled={!token || state === 'working'}
            className="border border-[var(--color-upside)] text-[var(--color-upside)] font-mono text-xs uppercase px-6 py-3.5 tracking-wider hover:bg-[var(--color-upside)] hover:text-[var(--color-void)] transition-colors cursor-pointer disabled:opacity-60"
          >
            {state === 'working' ? 'Turning off…' : 'Turn these emails off'}
          </button>
        </>
      )}
    </section>
  )
}
