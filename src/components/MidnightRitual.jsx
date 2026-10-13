import { useEffect, useRef, useState } from 'react'
import { useAuth } from './AuthContext'
import { withProviders } from './Providers'
import { playTypewriterKey } from '../lib/soundscapes'
import { formatSlot } from '../lib/ritualSchedule'
import {
  WORD_LIMIT,
  countWords,
  readLocalDraft,
  writeLocalDraft,
  clearLocalDraft,
  setSaveAfterSignin,
  takeSaveAfterSignin,
  fetchCurrentPrompt,
  fetchNextUnlock,
  fetchMyDraft,
  saveRitualDraft,
} from '../lib/ritualDraft'

/**
 * The Midnight Ritual home box: this week's prompt, read from the database,
 * and a writing box that saves to the writer's account. Signed-out writers
 * write first and sign in to save; the draft survives the sign-in.
 */
function MidnightRitual() {
  const { user, isLoading: authLoading } = useAuth()
  const [prompt, setPrompt] = useState(undefined) // undefined = loading, null = none released
  const [nextUnlock, setNextUnlock] = useState(null)
  const [isWriting, setIsWriting] = useState(false)
  const [text, setText] = useState('')
  const [status, setStatus] = useState({ kind: 'idle' }) // idle | saving | saved | needs-signin | error
  const savingRef = useRef(false)

  const wordCount = countWords(text)
  const overLimit = wordCount > WORD_LIMIT

  useEffect(() => {
    let alive = true
    fetchCurrentPrompt()
      .then((p) => {
        if (!alive) return
        setPrompt(p ?? null)
        if (p) setText(readLocalDraft(p.id) ?? '')
      })
      .catch(() => alive && setPrompt(null))
    fetchNextUnlock().then((t) => alive && setNextUnlock(t))
    return () => {
      alive = false
    }
  }, [])

  // Signed in with nothing unsaved on this device: bring back the account's draft.
  useEffect(() => {
    if (!prompt || !user) return
    if (readLocalDraft(prompt.id)) return
    let alive = true
    fetchMyDraft(prompt.id, user.id).then((d) => {
      if (alive && d?.content) setText(d.content)
    })
    return () => {
      alive = false
    }
  }, [prompt, user])

  const save = async (content) => {
    if (savingRef.current) return
    savingRef.current = true
    setStatus({ kind: 'saving' })
    try {
      await saveRitualDraft({ promptId: prompt.id, userId: user.id, content })
      clearLocalDraft(prompt.id)
      setStatus({ kind: 'saved' })
      playTypewriterKey(true)
    } catch (err) {
      setStatus({ kind: 'error', message: err.message })
    } finally {
      savingRef.current = false
    }
  }

  // Back from sign-in (including OAuth and passkey redirects): finish the save.
  useEffect(() => {
    if (!prompt || !user || authLoading) return
    const flagged = takeSaveAfterSignin()
    if (flagged !== prompt.id) return
    const local = readLocalDraft(prompt.id)
    if (!local || countWords(local) === 0 || countWords(local) > WORD_LIMIT) return
    setText(local)
    setIsWriting(true)
    save(local)
    // save is stable enough for this one-shot hand-off
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt, user, authLoading])

  const handleChange = (value) => {
    setText(value)
    if (prompt) writeLocalDraft(prompt.id, value)
    if (status.kind !== 'idle') setStatus({ kind: 'idle' })
  }

  const handleSave = (e) => {
    e.preventDefault()
    if (!prompt || wordCount === 0 || overLimit) return
    if (!user) {
      writeLocalDraft(prompt.id, text)
      setSaveAfterSignin(prompt.id)
      window.dispatchEvent(new CustomEvent('open-signin'))
      setStatus({ kind: 'needs-signin' })
      return
    }
    save(text)
  }

  return (
    <div className="midnight-ritual relative border border-[var(--color-upside)] bg-[var(--color-void)] p-6 my-10 overflow-hidden shadow-[0_0_30px_rgba(25,165,184,0.15)]">
      {/* CRT Scanline Overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-15"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, rgba(25,165,184,0.1) 0px, rgba(25,165,184,0.1) 1px, transparent 1px, transparent 3px)',
          backgroundSize: '100% 3px'
        }}
      />

      {/* Terminal Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-line)] pb-4 mb-5">
        <div className="flex items-center gap-3">
          <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-ember)] shadow-[0_0_10px_var(--color-ember)] animate-pulse" />
          <span className="font-mono text-xs uppercase tracking-[0.25em] text-[var(--color-upside)] font-bold">
            The Midnight Ritual • Channel 13 Receiver
          </span>
        </div>
        {prompt && (
          <span className="font-mono text-[11px] uppercase text-[var(--color-text-secondary)]">
            {nextUnlock ? `Next prompt ${formatSlot(nextUnlock)}` : 'Next ritual coming soon'}
          </span>
        )}
      </div>

      {prompt === undefined && (
        <p className="font-mono text-xs uppercase text-[var(--color-text-secondary)]">Tuning in…</p>
      )}

      {prompt === null && (
        <p className="font-serif italic text-lg text-[var(--color-text-primary)]">
          The first ritual is being prepared.
        </p>
      )}

      {prompt && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
          <div className="md:col-span-8">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="font-mono text-[11px] uppercase tracking-widest text-[var(--color-ember)] bg-[var(--color-ember)]/10 px-2 py-0.5 border border-[var(--color-ember)]/30">
                This week&rsquo;s prompt
              </span>
              <span className="font-mono text-[11px] text-[var(--color-text-secondary)] uppercase">
                Live since {formatSlot(prompt.goes_live_at)} · up to {WORD_LIMIT} words
              </span>
            </div>
            <blockquote
              className="text-lg sm:text-xl font-serif italic text-[var(--color-text-primary)] leading-relaxed my-3"
              style={{ textShadow: '0 0 12px rgba(25,165,184,0.2)' }}
            >
              &ldquo;{prompt.body}&rdquo;
            </blockquote>
            <p className="font-mono text-xs text-[var(--color-text-secondary)] mt-3">
              Written by a human. Your answer stays yours: saved drafts are private.
            </p>
          </div>

          <div className="md:col-span-4 flex flex-col gap-3 justify-center">
            <button
              type="button"
              onClick={() => setIsWriting(!isWriting)}
              className="border border-[var(--color-upside)] text-[var(--color-upside)] font-mono text-xs uppercase px-5 py-3 tracking-wider shadow-[0_0_20px_rgba(25,165,184,0.25)] hover:bg-[var(--color-upside)] hover:text-[var(--color-void)] transition-all cursor-pointer text-center font-bold"
            >
              {isWriting ? 'Close the box' : 'Write to this prompt'}
            </button>
          </div>
        </div>
      )}

      {prompt && isWriting && (
        <form onSubmit={handleSave} className="mt-6 border-t border-[var(--color-line)] pt-6 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <label htmlFor="ritual-text" className="font-mono text-xs uppercase text-[var(--color-text-secondary)]">
              Your response
            </label>
            <span className={`font-mono text-xs font-bold ${overLimit ? 'text-[var(--color-ember)]' : 'text-[var(--color-upside)]'}`}>
              {wordCount} / {WORD_LIMIT} words
            </span>
          </div>

          <textarea
            id="ritual-text"
            value={text}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="Begin where the prompt ends…"
            rows={8}
            className="w-full bg-[var(--color-void)] text-[var(--color-text-primary)] border border-[var(--color-line)] p-4 font-serif text-sm leading-relaxed focus:border-[var(--color-upside)] outline-none"
          />

          <div className="flex flex-wrap items-center justify-between gap-4 mt-2">
            <p role="status" className="font-mono text-[11px] text-[var(--color-text-secondary)]">
              {status.kind === 'idle' && (user ? 'Kept on this device until you save.' : 'Kept on this device. Sign in to save it to your account.')}
              {status.kind === 'saving' && 'Saving…'}
              {status.kind === 'saved' && 'Saved to your account. Only you can see it.'}
              {status.kind === 'needs-signin' && 'Sign in to save. Your draft is kept on this device and saves as soon as you’re in.'}
              {status.kind === 'error' && <span className="text-[var(--color-ember)]">{status.message}</span>}
            </p>
            <button
              type="submit"
              disabled={wordCount === 0 || overLimit || status.kind === 'saving'}
              className="btn-vhs disabled:opacity-40 cursor-pointer"
            >
              Save draft
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

export default withProviders(MidnightRitual)
