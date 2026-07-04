# Transcribe Flow Redesign ("Dictate") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the audio-transcription button and modal in the current "1980s paperback" theme with a record-first, clearly-stepped Record → Review → Add flow and an explicit success confirmation.

**Architecture:** Two React island components. `TranscribeButton` (a themed trigger) opens `TranscribeModal`, a self-contained state machine (`record` → `transcribing` → `review`) that funnels both a microphone recording and an uploaded file into the same editable review, then hands the text back to the caller via the unchanged `onTranscribed(text)` prop. No backend changes.

**Tech Stack:** React 19 islands, Tailwind CSS v4 (`--color-*` tokens), `sonner` toasts (already mounted globally), `MediaRecorder`/`getUserMedia`, Playwright E2E (chromium).

## Global Constraints

- No backend changes: transcription is `POST {import.meta.env.VITE_TRANSCRIBE_URL}/transcribe`, `multipart/form-data` field `audio`, **4 MB** max (`MAX_BYTES = 4 * 1024 * 1024`), accepted `'.mp3,.wav,.m4a,.ogg,audio/mpeg,audio/wav,audio/mp4,audio/ogg'`, recording auto-capped at **10 min**.
- The modal's outward contract is unchanged: it calls `onTranscribed(text)` and `onClose()`. Callers (`PublishStory.jsx:153`, `CreateThread.jsx:119`) keep appending: `setContent(prev => prev ? `${prev}\n\n${text}` : text)`.
- Theme: match `src/components/SignInModal.jsx` — overlay `fixed inset-0 z-50 bg-[#000]/80 backdrop-blur-sm flex items-center justify-center p-4`; panel `bg-[var(--color-bg-surface)]` + `vintage-border`; tokens `--color-text-primary`, `--color-text-secondary`, `--color-accent-crimson`, `--color-bg-primary`. **Remove every dead VHS class/var** (`btn`, `blood`, `ghost`, `modal-backdrop`, `modal-content`, `full-width`, `--blood`, `--bone`, `--muted`, `--mono`, `--bone-dim`).
- Button label is exactly **"Dictate"** (keep the mic SVG icon).
- Success toast: `toast.success(\`Added ${n} words to your draft.\`)` from `sonner`.
- Only these files change: `src/components/TranscribeButton.jsx`, `src/components/TranscribeModal.jsx`, `tests/transcribe.spec.js`, `playwright.config.js`. Do NOT touch the other dead-CSS components (tracked separately).
- Run E2E on Windows via the Bash tool (`npx playwright test ...`), not PowerShell.

## File Structure

- `src/components/TranscribeButton.jsx` — themed trigger button (label "Dictate"); opens/closes the modal. One responsibility: the trigger.
- `src/components/TranscribeModal.jsx` — the record/upload → transcribe → review → add state machine and all its UI. One responsibility: capturing audio and producing reviewed text.
- `tests/transcribe.spec.js` — E2E coverage of both components.
- `playwright.config.js` — add chromium fake-media launch flags so the record path is testable.

Stable selectors the tests rely on (defined by the implementation): dialog `role="dialog"` + `aria-label="Dictate a post"`; buttons by accessible name (`Dictate`, `Tap to record`, `Stop & review`, `Add to post`, `Re-record`, `Choose another file`); upload link text `upload an audio file instead`; file `input[accept*="audio"]`; review `<textarea aria-label="Transcript">`.

---

### Task 1: Reskin the trigger button to "Dictate"

**Files:**
- Modify: `src/components/TranscribeButton.jsx` (full replace)
- Test: `tests/transcribe.spec.js` (update the two button-presence tests)

**Interfaces:**
- Consumes: nothing new.
- Produces: renders a `<button>` with accessible name `Dictate` that toggles `<TranscribeModal onTranscribed onClose />` (modal contract unchanged, so the old modal keeps working until Task 2).

- [ ] **Step 1: Update the two button-presence tests to the new label**

In `tests/transcribe.spec.js`, replace the two tests at lines 18-26 with:

```javascript
  test('Dictate button appears on story editor', async ({ page }) => {
    await page.goto('/library/publish')
    await expect(page.getByRole('button', { name: /^Dictate$/ })).toBeVisible({ timeout: 15000 })
  })

  test('Dictate button appears on create thread form', async ({ page }) => {
    await page.goto('/forum/new')
    await expect(page.getByRole('button', { name: /^Dictate$/ })).toBeVisible({ timeout: 15000 })
  })
```

- [ ] **Step 2: Run the two tests to verify they fail**

Run: `npx playwright test tests/transcribe.spec.js -g "Dictate button appears"`
Expected: FAIL — the button still says "Transcribe Audio", so `name: /^Dictate$/` matches nothing.

- [ ] **Step 3: Replace `TranscribeButton.jsx`**

```jsx
import { useState } from 'react'
import TranscribeModal from './TranscribeModal'

export default function TranscribeButton({ onTranscribed }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 border border-[#2d2d2a] px-4 py-2 font-mono text-xs uppercase tracking-wider text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-accent-crimson)] hover:text-[var(--color-accent-crimson)] cursor-pointer"
      >
        <svg
          viewBox="0 0 24 24" width="15" height="15"
          fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
          <line x1="12" y1="19" x2="12" y2="23"/>
          <line x1="8" y1="23" x2="16" y2="23"/>
        </svg>
        Dictate
      </button>
      {open && (
        <TranscribeModal
          onTranscribed={(text) => { onTranscribed(text); setOpen(false) }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
```

- [ ] **Step 4: Run the two tests to verify they pass**

Run: `npx playwright test tests/transcribe.spec.js -g "Dictate button appears"`
Expected: PASS (2 passed). The other transcribe tests still target the old modal and remain green because Task 1 does not change the modal.

- [ ] **Step 5: Commit**

```bash
git add src/components/TranscribeButton.jsx tests/transcribe.spec.js
git commit -m "feat(transcribe): reskin trigger button, rename to Dictate"
```

---

### Task 2: Rebuild the modal — record-first flow, editable review, success toast

**Files:**
- Modify: `playwright.config.js` (add chromium fake-media flags)
- Modify: `src/components/TranscribeModal.jsx` (full replace)
- Test: `tests/transcribe.spec.js` (rewrite the modal tests to the new flow)

**Interfaces:**
- Consumes: `onTranscribed(text: string)` and `onClose()` from `TranscribeButton` (Task 1).
- Produces: a `role="dialog"` modal that, on "Add to post", calls `onTranscribed(reviewedText)` then a `sonner` success toast; on close/Esc/backdrop calls `onClose()`.

- [ ] **Step 1: Add fake-media flags so the record path is testable**

In `playwright.config.js`, replace the chromium project (lines ~34-38) with:

```javascript
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          // Auto-grant the mic and feed a synthetic audio stream so the
          // MediaRecorder record path runs headlessly without a real device.
          args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
        },
      },
    },
```

- [ ] **Step 2: Rewrite the modal tests for the new flow**

In `tests/transcribe.spec.js`, replace the three tests currently at lines 28-83 (the "Modal opens with warning banner", "Successful upload ... story", and "Successful upload ... thread" tests) with the following four tests. Leave the "File over 4 MB" test in place for now (Step 8 updates it):

```javascript
  test('Modal opens on the record step with the stepper and helper', async ({ page }) => {
    await page.goto('/library/publish')
    await page.getByRole('button', { name: /^Dictate$/ }).click()
    const dialog = page.getByRole('dialog', { name: /Dictate a post/i })
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('Speak clearly in a quiet room')
    await expect(dialog.getByRole('button', { name: /Tap to record/i })).toBeVisible()
    await expect(dialog.getByText(/upload an audio file instead/i)).toBeVisible()
  })

  test('Record path: record, review the transcript, add to the story', async ({ page }) => {
    await page.goto('/library/publish')
    await page.getByRole('button', { name: /^Dictate$/ }).click()
    const dialog = page.getByRole('dialog', { name: /Dictate a post/i })

    await dialog.getByRole('button', { name: /Tap to record/i }).click()
    await expect(dialog.getByText(/listening/i)).toBeVisible()
    await page.waitForTimeout(1500)
    await dialog.getByRole('button', { name: /Stop & review/i }).click()

    const review = dialog.getByRole('textbox', { name: /Transcript/i })
    await expect(review).toHaveValue('Darkness fell upon the ancient house.', { timeout: 15000 })

    await dialog.getByRole('button', { name: /Add to post/i }).click()
    await expect(dialog).not.toBeVisible()
    await expect(page.getByText(/Added \d+ words to your draft/i)).toBeVisible()
    await expect(page.locator('textarea.md-textarea')).toHaveValue('Darkness fell upon the ancient house.')
  })

  test('Upload path: choose a file, review, add to the story', async ({ page }) => {
    await page.goto('/library/publish')
    await page.getByRole('button', { name: /^Dictate$/ }).click()
    const dialog = page.getByRole('dialog', { name: /Dictate a post/i })

    await dialog.getByText(/upload an audio file instead/i).click()
    await dialog.locator('input[accept*="audio"]').setInputFiles({
      name: 'test.mp3', mimeType: 'audio/mpeg', buffer: Buffer.alloc(1024, 0),
    })

    const review = dialog.getByRole('textbox', { name: /Transcript/i })
    await expect(review).toHaveValue('Darkness fell upon the ancient house.', { timeout: 15000 })

    await dialog.getByRole('button', { name: /Add to post/i }).click()
    await expect(dialog).not.toBeVisible()
    await expect(page.locator('textarea.md-textarea')).toHaveValue('Darkness fell upon the ancient house.')
  })

  test('Upload path injects text into the thread body', async ({ page }) => {
    await page.goto('/forum/new')
    await page.getByRole('button', { name: /^Dictate$/ }).click()
    const dialog = page.getByRole('dialog', { name: /Dictate a post/i })

    await dialog.getByText(/upload an audio file instead/i).click()
    await dialog.locator('input[accept*="audio"]').setInputFiles({
      name: 'test.mp3', mimeType: 'audio/mpeg', buffer: Buffer.alloc(1024, 0),
    })

    const review = dialog.getByRole('textbox', { name: /Transcript/i })
    await expect(review).toHaveValue('Darkness fell upon the ancient house.', { timeout: 15000 })

    await dialog.getByRole('button', { name: /Add to post/i }).click()
    await expect(dialog).not.toBeVisible()
    await expect(page.locator('textarea.md-textarea')).toHaveValue('Darkness fell upon the ancient house.')
  })
```

- [ ] **Step 3: Run the new tests to verify they fail**

Run: `npx playwright test tests/transcribe.spec.js -g "record step|Record path|Upload path"`
Expected: FAIL — the old modal has no `role="dialog"`, no "Tap to record", no `Transcript` textbox.

- [ ] **Step 4: Replace `TranscribeModal.jsx`**

```jsx
import { useState, useRef, useEffect } from 'react'
import { toast } from 'sonner'

const TRANSCRIBE_URL = import.meta.env.VITE_TRANSCRIBE_URL
const MAX_BYTES = 4 * 1024 * 1024
const ACCEPTED = '.mp3,.wav,.m4a,.ogg,audio/mpeg,audio/wav,audio/mp4,audio/ogg'
const MAX_RECORD_MS = 10 * 60 * 1000
const HELPER = 'Speak clearly in a quiet room. Up to ~4 min.'
const STEPS = ['Record', 'Review', 'Add']

async function postAudio(blob, filename) {
  if (!TRANSCRIBE_URL) throw new Error('Transcription service is not configured.')
  const form = new FormData()
  form.append('audio', blob, filename)
  const res = await fetch(`${TRANSCRIBE_URL}/transcribe`, { method: 'POST', body: form })
  if (!res.ok) {
    let msg = 'Transcription failed.'
    try { const d = await res.json(); msg = d.error ?? msg } catch { /* ignore */ }
    throw new Error(msg)
  }
  const data = await res.json()
  return data.text
}

function fmtTime(s) {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

function wordCount(t) {
  return t.trim() ? t.trim().split(/\s+/).length : 0
}

export default function TranscribeModal({ onTranscribed, onClose }) {
  // step: 'record' | 'transcribing' | 'review'
  const [step, setStep] = useState('record')
  const [source, setSource] = useState('record') // 'record' | 'upload' — labels the discard button
  const [showUpload, setShowUpload] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState(null)

  const [recording, setRecording] = useState(false)
  const [recSecs, setRecSecs] = useState(0)

  const mrRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)
  const autoStopRef = useRef(null)

  useEffect(() => {
    const onEsc = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [onClose])

  useEffect(() => () => {
    clearInterval(timerRef.current)
    clearTimeout(autoStopRef.current)
    if (mrRef.current?.state && mrRef.current.state !== 'inactive') mrRef.current.stop()
  }, [])

  const currentStepIndex = step === 'record' ? 0 : step === 'review' ? 1 : 0

  const transcribe = async (blob, filename) => {
    setStep('transcribing')
    setError(null)
    try {
      const t = await postAudio(blob, filename)
      setText(t)
      setStep('review')
    } catch (err) {
      setError(err.message || 'Could not reach the transcription service. Check your connection.')
      setStep('record')
    }
  }

  const startRec = async () => {
    setError(null)
    setRecSecs(0)
    chunksRef.current = []
    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setError('Microphone access was denied. Allow it in your browser settings.')
      return
    }
    const mr = new MediaRecorder(stream)
    mrRef.current = mr
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    mr.onstop = () => {
      stream.getTracks().forEach(t => t.stop())
      clearInterval(timerRef.current)
      clearTimeout(autoStopRef.current)
      setRecording(false)
      const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' })
      if (blob.size > MAX_BYTES) {
        setError('Recording is too large — try a shorter clip.')
        return
      }
      setSource('record')
      transcribe(blob, 'recording.webm')
    }
    mr.start(1000)
    setRecording(true)
    timerRef.current = setInterval(() => setRecSecs(s => s + 1), 1000)
    autoStopRef.current = setTimeout(() => {
      if (mrRef.current?.state !== 'inactive') mrRef.current.stop()
    }, MAX_RECORD_MS)
  }

  const stopRec = () => {
    if (mrRef.current?.state !== 'inactive') mrRef.current.stop()
  }

  const onFileChange = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setError(null)
    if (f.size > MAX_BYTES) { setError('That file is over the 4 MB limit — try a shorter clip.'); return }
    setSource('upload')
    transcribe(f, f.name)
  }

  const addToPost = () => {
    const n = wordCount(text)
    toast.success(`Added ${n} ${n === 1 ? 'word' : 'words'} to your draft.`)
    onTranscribed(text)
  }

  const reset = () => {
    setText('')
    setError(null)
    setRecSecs(0)
    setStep('record')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#000]/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Dictate a post"
        className="vintage-border relative w-full max-w-md bg-[var(--color-bg-surface)] p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] cursor-pointer"
        >
          ×
        </button>

        <h2 className="mb-4 font-serif text-xl font-black text-[var(--color-text-primary)]">Dictate a post</h2>

        {/* Stepper */}
        <div className="mb-4 flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider">
          {STEPS.map((label, i) => (
            <span key={label} className="flex items-center gap-2">
              <span className={i === currentStepIndex ? 'text-[var(--color-accent-crimson)]' : 'text-[var(--color-text-secondary)]'}>
                {label}
              </span>
              {i < STEPS.length - 1 && <span className="text-[var(--color-text-secondary)]">→</span>}
            </span>
          ))}
        </div>

        <p className="mb-5 font-serif text-sm text-[var(--color-text-secondary)]">{HELPER}</p>

        {error && <p className="mb-4 font-mono text-xs text-[var(--color-accent-crimson)]">{error}</p>}

        {/* Record step */}
        {step === 'record' && (
          <div>
            {!recording && (
              <>
                <button
                  type="button"
                  onClick={startRec}
                  className="flex w-full items-center justify-center gap-2 bg-[var(--color-accent-crimson)] px-5 py-3 font-mono text-xs uppercase tracking-wider text-white transition-colors hover:bg-red-700 cursor-pointer"
                >
                  🎙 Tap to record
                </button>
                <button
                  type="button"
                  onClick={() => setShowUpload(v => !v)}
                  className="mt-4 w-full text-center font-mono text-xs text-[var(--color-text-secondary)] underline hover:text-[var(--color-text-primary)] cursor-pointer"
                >
                  or upload an audio file instead
                </button>
                {showUpload && (
                  <input
                    type="file"
                    accept={ACCEPTED}
                    onChange={onFileChange}
                    className="mt-3 w-full text-[var(--color-text-primary)]"
                  />
                )}
              </>
            )}
            {recording && (
              <div className="text-center">
                <p className="mb-1 font-mono text-2xl text-[var(--color-accent-crimson)]">
                  <span className="animate-pulse">●</span> REC · {fmtTime(recSecs)}
                </p>
                <p className="mb-4 font-mono text-xs uppercase tracking-wider text-[var(--color-text-secondary)]">listening…</p>
                <button
                  type="button"
                  onClick={stopRec}
                  className="w-full border border-[#2d2d2a] px-5 py-3 font-mono text-xs uppercase tracking-wider text-[var(--color-text-primary)] transition-colors hover:border-white cursor-pointer"
                >
                  ■ Stop &amp; review
                </button>
              </div>
            )}
          </div>
        )}

        {/* Transcribing step */}
        {step === 'transcribing' && (
          <p className="py-8 text-center font-mono text-xs uppercase tracking-widest text-[var(--color-text-secondary)] animate-pulse">
            Transcribing…
          </p>
        )}

        {/* Review step */}
        {step === 'review' && (
          <div>
            <textarea
              aria-label="Transcript"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              className="w-full resize-y border border-[#2d2d2a] bg-[var(--color-bg-primary)] p-3 font-serif text-sm text-[var(--color-text-primary)] focus:border-[var(--color-accent-crimson)] focus:outline-none"
            />
            <p className="mb-4 mt-1 font-mono text-xs text-[var(--color-text-secondary)]">
              ~{wordCount(text)} {wordCount(text) === 1 ? 'word' : 'words'} transcribed
            </p>
            <button
              type="button"
              onClick={addToPost}
              className="w-full bg-[var(--color-accent-crimson)] px-5 py-3 font-mono text-xs uppercase tracking-wider text-white transition-colors hover:bg-red-700 cursor-pointer"
            >
              Add to post
            </button>
            <button
              type="button"
              onClick={reset}
              className="mt-2 w-full border border-[#2d2d2a] px-5 py-3 font-mono text-xs uppercase tracking-wider text-[var(--color-text-primary)] transition-colors hover:border-white cursor-pointer"
            >
              {source === 'upload' ? 'Choose another file' : 'Re-record'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Run the new modal tests to verify they pass**

Run: `npx playwright test tests/transcribe.spec.js -g "record step|Record path|Upload path"`
Expected: PASS (4 passed).

- [ ] **Step 6: Run the whole transcribe spec to catch fallout**

Run: `npx playwright test tests/transcribe.spec.js`
Expected: the "File over 4 MB" test FAILS (it still uses the old `.modal-content` / `/^Transcribe$/` selectors). That is fixed in Step 8. Every other test passes.

- [ ] **Step 7: Commit**

```bash
git add playwright.config.js src/components/TranscribeModal.jsx tests/transcribe.spec.js
git commit -m "feat(transcribe): rebuild modal — record-first flow, editable review, success toast"
```

- [ ] **Step 8: Fix the 4 MB test for the new flow**

In `tests/transcribe.spec.js`, replace the "File over 4 MB" test with:

```javascript
  test('A file over 4 MB shows the size error and does not transcribe', async ({ page }) => {
    await page.goto('/library/publish')
    await page.getByRole('button', { name: /^Dictate$/ }).click()
    const dialog = page.getByRole('dialog', { name: /Dictate a post/i })

    await dialog.getByText(/upload an audio file instead/i).click()
    await dialog.locator('input[accept*="audio"]').setInputFiles({
      name: 'big.mp3', mimeType: 'audio/mpeg', buffer: Buffer.alloc(5 * 1024 * 1024, 0),
    })

    await expect(dialog).toContainText('over the 4 MB limit')
    await expect(dialog.getByRole('textbox', { name: /Transcript/i })).toHaveCount(0)
  })
```

- [ ] **Step 9: Run it to verify pass, then the whole spec**

Run: `npx playwright test tests/transcribe.spec.js`
Expected: PASS (all transcribe tests green).

- [ ] **Step 10: Commit**

```bash
git add tests/transcribe.spec.js
git commit -m "test(transcribe): update 4 MB guard test to the new upload flow"
```

---

### Task 3: Error-path hardening + full suite sweep

**Files:**
- Test: `tests/transcribe.spec.js` (add transcribe-failure test)
- Modify: `src/components/TranscribeModal.jsx` only if the failure test reveals a gap (the Task 2 code already routes failures back to the record step with an error).

**Interfaces:**
- Consumes: the modal from Task 2.
- Produces: no new interface; verifies resilience.

- [ ] **Step 1: Add a transcription-failure test**

In `tests/transcribe.spec.js`, add inside the describe block:

```javascript
  test('Transcription failure surfaces an error and stays on the record step', async ({ page }) => {
    // Override the happy-path mock from beforeEach with a 500.
    await page.route('**/transcribe', async (route) => {
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Transcription failed.' }) })
    })

    await page.goto('/library/publish')
    await page.getByRole('button', { name: /^Dictate$/ }).click()
    const dialog = page.getByRole('dialog', { name: /Dictate a post/i })

    await dialog.getByText(/upload an audio file instead/i).click()
    await dialog.locator('input[accept*="audio"]').setInputFiles({
      name: 'test.mp3', mimeType: 'audio/mpeg', buffer: Buffer.alloc(1024, 0),
    })

    await expect(dialog).toContainText('Transcription failed.', { timeout: 15000 })
    await expect(dialog.getByRole('button', { name: /Tap to record/i })).toBeVisible()
    await expect(dialog.getByRole('textbox', { name: /Transcript/i })).toHaveCount(0)
  })
```

- [ ] **Step 2: Run it to verify it passes against the Task 2 implementation**

Run: `npx playwright test tests/transcribe.spec.js -g "Transcription failure"`
Expected: PASS. (Task 2's `transcribe()` catch sets `error` and `setStep('record')`.) If it FAILS, fix `TranscribeModal.jsx` so a failed `postAudio` returns to `step === 'record'` with the error visible — do not leave the user stuck on "Transcribing…".

- [ ] **Step 3: Run the full E2E suite**

Run: `npx playwright test`
Expected: PASS (all specs green, including the Astro 7 sign-in-modal regression test).

- [ ] **Step 4: Run unit tests + build**

Run: `npm run test:unit && npm run build`
Expected: unit `9 passed`, build `Complete!`.

- [ ] **Step 5: Grep for any remaining dead VHS tokens in the two files**

Run: `grep -nE "modal-backdrop|modal-content|btn |blood|ghost|full-width|--bone|--muted|--mono|transcribe-btn" src/components/TranscribeButton.jsx src/components/TranscribeModal.jsx`
Expected: no matches (empty output).

- [ ] **Step 6: Commit**

```bash
git add tests/transcribe.spec.js src/components/TranscribeModal.jsx
git commit -m "test(transcribe): cover transcription failure path"
```

---

## Self-Review

**Spec coverage:**
- Rebuild button + modal in current theme → Tasks 1 & 2 (SignInModal pattern, dead tokens removed; grep gate in Task 3 Step 5). ✓
- Record-first, Record→Review→Add stepper → Task 2 (stepper, record default, "Tap to record"). ✓
- Recording feedback (pulsing REC + timer + "listening…") → Task 2 modal record sub-state. ✓
- Upload secondary via link → Task 2 (`showUpload` link + picker). ✓
- Editable review + word count → Task 2 review step (`<textarea aria-label="Transcript">` + `wordCount`). ✓
- Success toast → Task 2 `addToPost` (`toast.success`). ✓
- Path-aware discard label ("Re-record" / "Choose another file") → Task 2 (`source` state). ✓
- No backend change / `onTranscribed` contract → constraints honored; callers untouched. ✓
- Errors: mic denied (Task 2 `startRec` catch), 4 MB file (Task 2 `onFileChange` + Task 2 Step 8 test), recording too large (Task 2 `onstop`), transcribe failure (Task 3). ✓
- Tests updated to new copy/flow + new success/toast assertion → Tasks 1-3. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code; every command has an expected result. ✓

**Type/name consistency:** `onTranscribed`/`onClose` props match callers and Task 1's usage. Step values `record`/`transcribing`/`review`, `source` values `record`/`upload`, and helper names `postAudio`/`fmtTime`/`wordCount`/`transcribe`/`startRec`/`stopRec`/`onFileChange`/`addToPost`/`reset` are used consistently across steps. Selectors (`role="dialog"` name "Dictate a post", "Tap to record", "Stop & review", "Transcript", "Add to post") match between the component and the tests. ✓
