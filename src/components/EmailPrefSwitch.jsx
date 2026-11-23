import { useEffect, useState } from 'react'
import { fetchEmailPref, saveEmailPref } from '../lib/emailPref'

/**
 * Profile → Email. One switch: email me when someone responds to my writing.
 * On by default. Renders nothing until the saved choice is known, and nothing
 * at all if it cannot be read: a switch showing the wrong state is worse than
 * none (every email also carries its own turn-off link).
 */
export default function EmailPrefSwitch() {
  const [on, setOn] = useState(null)
  const [state, setState] = useState('idle') // idle | saving | saved | error

  useEffect(() => {
    let alive = true
    fetchEmailPref().then((value) => { if (alive) setOn(value) })
    return () => { alive = false }
  }, [])

  if (on === null) return null

  const change = async (e) => {
    const next = e.target.checked
    setOn(next)
    setState('saving')
    const ok = await saveEmailPref(next)
    if (!ok) setOn(!next)
    setState(ok ? 'saved' : 'error')
  }

  return (
    <div className="mt-16 border-t border-[var(--color-line)] pt-12" data-testid="email-pref">
      <span className="block font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-text-secondary)] mb-2">Email</span>
      <h3 className="text-xl font-serif font-black mb-4">
        When someone <em className="italic text-[var(--color-accent-crimson)] font-serif">responds</em>
      </h3>
      <label className="flex items-start gap-3 min-h-[44px] cursor-pointer">
        <input
          type="checkbox"
          className="mt-1 h-5 w-5 shrink-0 accent-[var(--color-ember)] cursor-pointer"
          checked={on}
          disabled={state === 'saving'}
          onChange={change}
        />
        <span className="text-sm font-serif text-[var(--color-text-secondary)] leading-relaxed">
          Email me when someone critiques or replies to my writing. One short email with a link, at most one an hour.
          Nothing else is ever sent.
        </span>
      </label>
      <p className="font-mono text-xs mt-3 min-h-[1rem]" role="status">
        {state === 'saved' && <span className="text-green-700">✓ Saved</span>}
        {state === 'error' && <span className="text-[var(--color-ember)]">Couldn't save that. Try again.</span>}
      </p>
    </div>
  )
}
