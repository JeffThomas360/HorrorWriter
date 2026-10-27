import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from './AuthContext'
import { withProviders } from './Providers'
import { supabase } from '../supabaseClient'
import { playTypewriterKey } from '../lib/soundscapes'
import { formatSlot } from '../lib/ritualSchedule'
import { screenContent } from '../lib/screenContent'
import {
  WORD_LIMIT,
  MIN_WORDS,
  countRitualWords,
  readLocalDraft,
  writeLocalDraft,
  clearLocalDraft,
  setSaveAfterSignin,
  takeSaveAfterSignin,
  fetchCurrentPrompt,
  fetchActivePrompts,
  fetchNextUnlock,
  fetchMyDraft,
  saveRitualDraft,
  shareRitualDraft,
  publishRitualToForum,
  fetchMyLatestEntryId,
  fetchEntryCounts,
} from '../lib/ritualDraft'

// The visual editor is only needed once the box opens.
const RitualEditor = lazy(() => import('./RitualEditor'))

const ROTATING_FALLBACK_PROMPTS = [
  'The astronomer realized the stars were not burning out—something vast was standing between the telescope and the sky.',
  'Every year, the village buries a carved wooden effigy of the oldest resident. This year, the wood bled.',
  'You bought a blank VHS cassette at an estate sale. The footage is from inside your bedroom, filmed last night.',
  'For three weeks, your reflection in the bathroom mirror has been blinking half a second after you do.',
  'The radio emergency broadcast system activated at 3:17 AM. It repeated only three words: Do not look.',
]

/**
 * The Midnight Ritual home box: 5 weekly rotating prompt frequencies (CH 13.0–13.4).
 * Each prompt stays active for 5 weeks as new ones unlock weekly.
 * Writers can tune frequencies, autosave drafts locally per channel, save to account,
 * and publish directly to The Crypt for community feedback and critique.
 */
function MidnightRitual() {
  const { user, isLoading: authLoading } = useAuth()
  const [activePrompts, setActivePrompts] = useState(undefined)
  const [entryCounts, setEntryCounts] = useState({})
  const [nextUnlock, setNextUnlock] = useState(null)
  const [activeChannelIndex, setActiveChannelIndex] = useState(0)
  const [isWriting, setIsWriting] = useState(false)
  const [text, setText] = useState('')
  const [draftId, setDraftId] = useState(null)
  const [isPublishing, setIsPublishing] = useState(false)
  const [storyTitle, setStoryTitle] = useState('')
  const [status, setStatus] = useState({ kind: 'idle' }) // idle | saving | saved | needs-signin | error | published
  const savingRef = useRef(false)

  const channels = useMemo(() => {
    return Array.from({ length: 5 }, (_, i) => {
      const dbP = activePrompts?.[i]
      const freq = `CH 13.${i}`
      const isDbPrompt = Boolean(dbP?.id)
      const weekLabel = i === 0 ? 'This week' : `Prompt ${i + 1} of 5`
      return {
        id: dbP?.id || `channel-${i}`,
        dbPromptId: dbP?.id || null,
        freq,
        name: weekLabel,
        prompt: dbP?.body || ROTATING_FALLBACK_PROMPTS[i],
        category: i === 0 ? "This week's prompt" : `Still open · prompt ${i + 1}`,
        isDbPrompt,
        goes_live_at: dbP?.goes_live_at,
      }
    })
  }, [activePrompts])

  const activeChannel = channels[activeChannelIndex] || channels[0]
  const wordCount = countRitualWords(text)
  const overLimit = wordCount > WORD_LIMIT
  const tooShort = wordCount < MIN_WORDS

  useEffect(() => {
    let alive = true
    // Reads featured prompt via fetchCurrentPrompt / fetchActivePrompts
    fetchCurrentPrompt().catch(() => {})
    fetchActivePrompts(5)
      .then((prompts) => {
        if (!alive) return
        setActivePrompts(prompts || [])
        if (prompts?.[0]?.id && activeChannelIndex === 0) {
          const local = readLocalDraft(prompts[0].id)
          if (local) setText(local)
        }
      })
      .catch(() => alive && setActivePrompts([]))
    fetchNextUnlock().then((t) => alive && setNextUnlock(t))
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!activePrompts?.length) return
    let alive = true
    fetchEntryCounts(activePrompts.map((p) => p.id)).then((c) => alive && setEntryCounts(c)).catch(() => {})
    return () => { alive = false }
  }, [activePrompts])

  // Load draft on mount / channel tune
  useEffect(() => {
    if (!activeChannel) return
    const local = readLocalDraft(activeChannel.id)
    if (local !== null) {
      setText(local)
    } else if (activeChannel.isDbPrompt && user) {
      fetchMyDraft(activeChannel.id, user.id).then((d) => {
        if (d?.content) setText(d.content)
        if (d?.id) setDraftId(d.id)
      })
    } else {
      setText('')
    }
  }, [activeChannelIndex, activeChannel?.id, user])

  const handleTune = (idx) => {
    if (activeChannel?.id && text) {
      writeLocalDraft(activeChannel.id, text)
    }
    setActiveChannelIndex(idx)
    playTypewriterKey(true)
    const target = channels[idx]
    if (!target) return
    const local = readLocalDraft(target.id)
    setText(local ?? '')
    if (status.kind !== 'idle') setStatus({ kind: 'idle' })
  }

  const save = async (content) => {
    if (savingRef.current) return
    savingRef.current = true
    setStatus({ kind: 'saving' })
    try {
      if (activeChannel.isDbPrompt) {
        const savedId = await saveRitualDraft({ promptId: activeChannel.dbPromptId, userId: user.id, content })
        if (savedId) setDraftId(savedId)
        clearLocalDraft(activeChannel.id)
        setStatus({ kind: 'saved' })
        playTypewriterKey(true)
        return savedId
      } else {
        writeLocalDraft(activeChannel.id, content)
        setStatus({ kind: 'saved', message: 'Saved on this device. Ready to publish to The Crypt!' })
        playTypewriterKey(true)
        return null
      }
    } catch (err) {
      setStatus({ kind: 'error', message: err.message })
      return null
    } finally {
      savingRef.current = false
    }
  }

  // Back from sign-in (including OAuth and passkey redirects): finish the save.
  useEffect(() => {
    if (activePrompts === undefined || !user || authLoading) return
    const flagged = takeSaveAfterSignin()
    if (!flagged) return

    const chIdx = channels.findIndex((c) => c.id === flagged)
    if (chIdx === -1) return
    if (chIdx !== activeChannelIndex) setActiveChannelIndex(chIdx)

    const local = readLocalDraft(flagged)
    if (!local || countRitualWords(local) === 0 || countRitualWords(local) > WORD_LIMIT) return
    setText(local)
    setIsWriting(true)
    const targetChannel = channels[chIdx]
    if (targetChannel.isDbPrompt) {
      saveRitualDraft({ promptId: targetChannel.dbPromptId, userId: user.id, content: local })
        .then((id) => {
          if (id) setDraftId(id)
          clearLocalDraft(flagged)
          setStatus({ kind: 'saved' })
          playTypewriterKey(true)
        })
        .catch((err) => setStatus({ kind: 'error', message: err.message }))
    }
  }, [activePrompts, user, authLoading, channels, activeChannelIndex])

  const handleChange = (value) => {
    setText(value)
    if (activeChannel?.id) writeLocalDraft(activeChannel.id, value)
    if (status.kind !== 'idle') setStatus({ kind: 'idle' })
  }

  const handleSave = (e) => {
    e?.preventDefault()
    if (!activeChannel || wordCount === 0 || overLimit) return
    if (activeChannel.isDbPrompt && !user) {
      writeLocalDraft(activeChannel.id, text)
      setSaveAfterSignin(activeChannel.id)
      window.dispatchEvent(new CustomEvent('open-signin'))
      setStatus({ kind: 'needs-signin' })
      return
    }
    save(text)
  }

  const handleStartPublish = () => {
    if (!activeChannel || wordCount === 0 || overLimit || tooShort) return
    if (!activeChannel.isDbPrompt) {
      setStatus({ kind: 'error', message: "This channel's prompt isn't live yet. Save your draft; you can publish once it airs." })
      return
    }
    if (!user) {
      writeLocalDraft(activeChannel.id, text)
      setSaveAfterSignin(activeChannel.id)
      window.dispatchEvent(new CustomEvent('open-signin'))
      setStatus({ kind: 'needs-signin', message: 'Sign in to publish your story for critique. Your draft is kept on this device.' })
      return
    }
    setIsPublishing(true)
  }

  const handleConfirmPublish = async () => {
    const trimmedTitle = storyTitle.trim()
    if (!trimmedTitle || trimmedTitle.length > 200 || !user || !activeChannel) return
    if (savingRef.current) return
    savingRef.current = true
    setStatus({ kind: 'saving', message: 'Posting to The Crypt…' })

    try {
      let threadId
      if (activeChannel.isDbPrompt) {
        const savedId = await saveRitualDraft({ promptId: activeChannel.dbPromptId, userId: user.id, content: text })
        const activeDraftId = savedId || draftId
        if (activeDraftId) {
          threadId = await shareRitualDraft({ draftId: activeDraftId, title: trimmedTitle })
        } else {
          threadId = await publishRitualToForum({
            title: trimmedTitle,
            content: text,
            promptId: activeChannel.dbPromptId,
          })
        }
      } else {
        throw new Error("This channel's prompt isn't live yet, so it can't take entries.")
      }

      const entryId = await fetchMyLatestEntryId(threadId, user.id)
      await screenContent(supabase, 'post', entryId)
      clearLocalDraft(activeChannel.id)
      playTypewriterKey(true)
      setStatus({ kind: 'published' })
      window.location.assign(`/forum/thread/${threadId}/${entryId ? `#post-${entryId}` : ''}`)
    } catch (err) {
      setStatus({ kind: 'error', message: err.message || 'Failed to publish draft.' })
    } finally {
      savingRef.current = false
    }
  }

  return (
    <div id="midnight-ritual" className="midnight-ritual relative border border-[var(--color-upside)] bg-[var(--color-void)] p-6 my-10 overflow-hidden shadow-[0_0_30px_rgba(25,165,184,0.15)]">
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
            The Midnight Ritual · weekly writing prompt
          </span>
        </div>

        {/* Multi-Channel Frequencies Tuner */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-mono text-[10px] uppercase text-[var(--color-text-secondary)] mr-1">
            Prompts:
          </span>
          {channels.map((ch, idx) => {
            const count = ch.dbPromptId ? entryCounts[ch.dbPromptId] || 0 : 0
            return (
            <button
              key={ch.freq}
              type="button"
              onClick={() => handleTune(idx)}
              aria-label={count ? `${ch.freq}, ${count} ${count === 1 ? 'entry' : 'entries'}` : ch.freq}
              title={idx === 0 ? "This week's prompt" : `Prompt from ${idx} ${idx === 1 ? 'week' : 'weeks'} ago, still open`}
              className={`font-mono text-xs px-3 py-2 min-h-[36px] border transition-all cursor-pointer ${
                activeChannelIndex === idx
                  ? 'bg-[var(--color-upside)] text-[var(--color-void)] border-[var(--color-upside)] font-black shadow-[0_0_10px_rgba(25,165,184,0.3)]'
                  : 'bg-[var(--color-surface)] text-[var(--color-text-secondary)] border-[var(--color-line)] hover:border-white'
              }`}
            >
              {ch.freq}
              {count > 0 && (
                <span aria-hidden="true" className="ml-1 px-1 bg-[var(--color-void)] text-[var(--color-ember)] font-bold">
                  {count}
                </span>
              )}
            </button>
            )
          })}
        </div>
      </div>

      {/* Main Broadcast Box */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
        <div className="md:col-span-8">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="font-mono text-[11px] uppercase tracking-widest text-[var(--color-ember)] bg-[var(--color-ember)]/10 px-2 py-0.5 border border-[var(--color-ember)]/30">
              {activeChannel.category}
            </span>
            <span className="font-mono text-[11px] text-[var(--color-text-secondary)] uppercase">
              {activeChannel.isDbPrompt && activeChannel.goes_live_at
                ? `Live since ${formatSlot(activeChannel.goes_live_at)} · ${MIN_WORDS} to ${WORD_LIMIT} words to publish`
                : `${activeChannel.freq} · ${MIN_WORDS} to ${WORD_LIMIT} words to publish`}
            </span>
            {activeChannelIndex === 0 && nextUnlock && (
              <span className="font-mono text-[10px] text-[var(--color-text-secondary)]">
                (Next: {formatSlot(nextUnlock)})
              </span>
            )}
          </div>
          <blockquote
            className="text-lg sm:text-xl font-serif italic text-[var(--color-text-primary)] leading-relaxed my-3"
            style={{ textShadow: '0 0 12px rgba(25,165,184,0.2)' }}
          >
            &ldquo;{activeChannel.prompt}&rdquo;
          </blockquote>
          <p className="font-mono text-xs text-[var(--color-text-secondary)] mt-3">
            Written by a human. Save private drafts to your account or publish for critique in The Crypt.
          </p>
        </div>

        <div className="md:col-span-4 flex flex-col gap-3 justify-center">
          <button
            type="button"
            onClick={() => setIsWriting(!isWriting)}
            className="border border-[var(--color-upside)] text-[var(--color-upside)] font-mono text-xs uppercase px-5 py-3 tracking-wider shadow-[0_0_20px_rgba(25,165,184,0.25)] hover:bg-[var(--color-upside)] hover:text-[var(--color-void)] transition-all cursor-pointer text-center font-bold"
          >
            {isWriting ? 'Close the editor' : 'Write your response'}
          </button>
        </div>
      </div>

      {isWriting && (
        <form onSubmit={handleSave} className="mt-6 border-t border-[var(--color-line)] pt-6 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <label htmlFor="ritual-text" className="font-mono text-xs uppercase text-[var(--color-text-secondary)]">
              Your response to prompt {activeChannelIndex + 1}
            </label>
            <span className={`font-mono text-xs font-bold ${overLimit ? 'text-[var(--color-ember)]' : 'text-[var(--color-upside)]'}`}>
              {wordCount} / {WORD_LIMIT} words
            </span>
          </div>

          <Suspense fallback={<div className="min-h-[14rem] border border-[var(--color-line)] bg-[var(--color-void)]" aria-busy="true" />}>
            <RitualEditor
              id="ritual-text"
              value={text}
              onChange={handleChange}
              placeholder="Begin where the prompt ends…"
            />
          </Suspense>

          {isPublishing ? (
            <div className="p-4 bg-[var(--color-surface)] border border-[var(--color-upside)] mt-2">
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="ritual-title" className="font-mono text-xs uppercase tracking-wider text-[var(--color-upside)] font-bold">
                  Title your story:
                </label>
                <span className="font-mono text-[10px] text-[var(--color-text-secondary)]">Required (max 200 chars)</span>
              </div>
              <input
                id="ritual-title"
                type="text"
                value={storyTitle}
                onChange={(e) => setStoryTitle(e.target.value)}
                placeholder="Enter a story title…"
                maxLength={200}
                className="w-full bg-[var(--color-void)] text-[var(--color-text-primary)] border border-[var(--color-line)] p-3 font-serif text-sm focus:border-[var(--color-upside)] outline-none mb-3"
              />
              <p className="font-serif italic text-xs text-[var(--color-text-secondary)] mb-4">
                Your piece will be published as an open critique thread under Midnight Rituals in The Crypt. Community writers can read and comment on your submission.
              </p>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsPublishing(false)}
                  disabled={status.kind === 'saving'}
                  className="font-mono text-xs uppercase px-4 py-2 border border-[var(--color-line)] text-[var(--color-text-secondary)] hover:border-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmPublish}
                  disabled={!storyTitle.trim() || status.kind === 'saving'}
                  className="btn-vhs bg-[var(--color-accent-crimson)] text-white hover:bg-red-700 border-red-800 disabled:opacity-40 cursor-pointer"
                >
                  {status.kind === 'saving' ? 'Publishing…' : 'Post to The Crypt →'}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-4 mt-2">
              <p role="status" className="font-mono text-[11px] text-[var(--color-text-secondary)]">
                {status.kind === 'idle' && (user ? 'Kept on this device until you save.' : 'Kept on this device. Sign in to save it to your account.')}
                {status.kind === 'idle' && wordCount > 0 && tooShort && ` ${MIN_WORDS - wordCount} more ${MIN_WORDS - wordCount === 1 ? 'word' : 'words'} to publish.`}
                {status.kind === 'saving' && (status.message || 'Saving…')}
                {status.kind === 'saved' && (status.message || 'Saved to your account. Only you can see it.')}
                {status.kind === 'published' && 'Published! Taking you to The Crypt…'}
                {status.kind === 'needs-signin' && (status.message || 'Sign in to save. Your draft is kept on this device and saves as soon as you’re in.')}
                {status.kind === 'error' && <span className="text-[var(--color-ember)]">{status.message}</span>}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={wordCount === 0 || overLimit || status.kind === 'saving'}
                  className="btn-vhs disabled:opacity-40 cursor-pointer"
                >
                  Save draft
                </button>
                <button
                  type="button"
                  onClick={handleStartPublish}
                  disabled={wordCount === 0 || overLimit || tooShort || status.kind === 'saving'}
                  className="btn-vhs bg-[var(--color-accent-crimson)] text-white hover:bg-red-700 border-red-800 disabled:opacity-40 cursor-pointer"
                >
                  Publish for Critique →
                </button>
              </div>
            </div>
          )}
        </form>
      )}
    </div>
  )
}

export default withProviders(MidnightRitual)
