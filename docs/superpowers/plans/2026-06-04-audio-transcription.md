# Audio Transcription Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Transcribe Audio" button to the story editor and thread composer that sends audio (uploaded file or browser recording) to a Cloudflare Worker, calls Workers AI Whisper, and injects the transcript into the textarea.

**Architecture:** A standalone Cloudflare Worker (`workers/transcribe/`) receives multipart audio POSTs, enforces a 4 MB size limit, calls `@cf/openai/whisper` via the AI binding, and returns `{ text }`. Two React components (`TranscribeButton`, `TranscribeModal`) are placed directly in `PublishStory.jsx` and `CreateThread.jsx`. No global listener; no auth check on the Worker.

**Tech Stack:** Cloudflare Workers + Workers AI (`@cf/openai/whisper`), React 19, MediaRecorder API, Playwright for E2E tests.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `workers/transcribe/src/index.js` | CF Worker: CORS, size check, Whisper call |
| Create | `workers/transcribe/wrangler.toml` | Worker config + AI binding |
| Create | `workers/transcribe/package.json` | Minimal package descriptor |
| Create | `src/components/TranscribeButton.jsx` | Mic icon button, opens TranscribeModal |
| Create | `src/components/TranscribeModal.jsx` | Modal: Upload + Record tabs, warning, POST |
| Create | `tests/transcribe.spec.js` | Playwright E2E tests |
| Modify | `playwright.config.js` | Add `VITE_TRANSCRIBE_URL` to webServer env |
| Modify | `src/pages/PublishStory.jsx` | Import + place TranscribeButton |
| Modify | `src/pages/CreateThread.jsx` | Import + place TranscribeButton |

---

## Task 1: Cloudflare Worker scaffold

**Files:**
- Create: `workers/transcribe/wrangler.toml`
- Create: `workers/transcribe/package.json`
- Create: `workers/transcribe/src/index.js` (CORS + routing only, no AI call yet)

- [ ] **Step 1: Create worker directory**

```powershell
New-Item -ItemType Directory -Force workers\transcribe\src
```

- [ ] **Step 2: Create `workers/transcribe/wrangler.toml`**

```toml
name = "horrorwriter-transcribe"
main = "src/index.js"
compatibility_date = "2024-09-23"

[ai]
binding = "AI"
```

- [ ] **Step 3: Create `workers/transcribe/package.json`**

```json
{
  "name": "horrorwriter-transcribe",
  "version": "1.0.0",
  "private": true
}
```

- [ ] **Step 4: Create `workers/transcribe/src/index.js` (CORS scaffold only)**

```js
const ALLOWED_ORIGINS = [
  'https://horrorwriter.org',
  'https://www.horrorwriter.org',
]

function corsHeaders(origin) {
  const ok =
    ALLOWED_ORIGINS.includes(origin) ||
    (typeof origin === 'string' && origin.endsWith('.horrorwriter.pages.dev'))
  return {
    'Access-Control-Allow-Origin': ok ? origin : 'https://horrorwriter.org',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  })
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') ?? ''

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) })
    }

    if (req.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405, origin)
    }

    return json({ text: 'scaffold ok' }, 200, origin)
  },
}
```

- [ ] **Step 5: Commit scaffold**

```bash
git add workers/
git commit -m "feat: add transcribe worker scaffold"
```

---

## Task 2: Worker transcription logic

**Files:**
- Modify: `workers/transcribe/src/index.js`

- [ ] **Step 1: Replace scaffold body with full implementation**

Replace the entire contents of `workers/transcribe/src/index.js`:

```js
const MAX_BYTES = 4 * 1024 * 1024

const ALLOWED_ORIGINS = [
  'https://horrorwriter.org',
  'https://www.horrorwriter.org',
]

function corsHeaders(origin) {
  const ok =
    ALLOWED_ORIGINS.includes(origin) ||
    (typeof origin === 'string' && origin.endsWith('.horrorwriter.pages.dev'))
  return {
    'Access-Control-Allow-Origin': ok ? origin : 'https://horrorwriter.org',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  })
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') ?? ''

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) })
    }

    if (req.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405, origin)
    }

    let formData
    try {
      formData = await req.formData()
    } catch {
      return json({ error: 'Invalid request body' }, 400, origin)
    }

    const audioFile = formData.get('audio')
    if (!audioFile || typeof audioFile === 'string') {
      return json({ error: 'No audio file provided' }, 400, origin)
    }

    const audioBuffer = await audioFile.arrayBuffer()

    if (audioBuffer.byteLength > MAX_BYTES) {
      return json({ error: 'File exceeds the 4 MB limit.' }, 413, origin)
    }

    try {
      const result = await env.AI.run('@cf/openai/whisper', {
        audio: [...new Uint8Array(audioBuffer)],
      })
      return json({ text: result.text ?? '' }, 200, origin)
    } catch (err) {
      console.error('[transcribe]', err)
      return json(
        { error: 'Transcription failed — try a shorter clip or cleaner audio.' },
        500,
        origin,
      )
    }
  },
}
```

- [ ] **Step 2: Commit**

```bash
git add workers/transcribe/src/index.js
git commit -m "feat: implement Whisper transcription in CF Worker"
```

---

## Task 3: Playwright test setup + failing tests

**Files:**
- Modify: `playwright.config.js`
- Create: `tests/transcribe.spec.js`

- [ ] **Step 1: Add `VITE_TRANSCRIBE_URL` to Playwright's dev server env**

In `playwright.config.js`, update the `webServer` block to add an `env` property:

```js
webServer: {
  command: 'npm run dev',
  url: 'http://localhost:5173',
  reuseExistingServer: !process.env.CI,
  timeout: 120 * 1000,
  env: {
    VITE_TRANSCRIBE_URL: 'http://localhost:5173',
  },
},
```

- [ ] **Step 2: Create `tests/transcribe.spec.js`**

```js
import { test, expect } from '@playwright/test'
import { setupSupabaseMocks, setupMockAuth } from './mocks'

test.describe('Audio Transcription', () => {
  test.beforeEach(async ({ page }) => {
    await setupSupabaseMocks(page)
    await setupMockAuth(page)

    await page.route('**/transcribe', async (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ text: 'Darkness fell upon the ancient house.' }),
      })
    })
  })

  test('Transcribe Audio button appears on story editor', async ({ page }) => {
    await page.goto('/library/publish')
    await expect(page.getByRole('button', { name: /Transcribe Audio/i })).toBeVisible()
  })

  test('Transcribe Audio button appears on create thread form', async ({ page }) => {
    await page.goto('/forum/new')
    await expect(page.getByRole('button', { name: /Transcribe Audio/i })).toBeVisible()
  })

  test('Modal opens with warning banner', async ({ page }) => {
    await page.goto('/library/publish')
    await page.getByRole('button', { name: /Transcribe Audio/i }).click()
    await expect(page.locator('.modal-content')).toBeVisible()
    await expect(page.locator('.modal-content')).toContainText('For best results')
  })

  test('File over 4 MB shows size error and disables Transcribe button', async ({ page }) => {
    await page.goto('/library/publish')
    await page.getByRole('button', { name: /Transcribe Audio/i }).click()

    await page.locator('input[type="file"]').setInputFiles({
      name: 'big.mp3',
      mimeType: 'audio/mpeg',
      buffer: Buffer.alloc(5 * 1024 * 1024, 0),
    })

    await expect(page.locator('.modal-content')).toContainText('File exceeds the 4 MB limit.')
    await expect(page.getByRole('button', { name: /^Transcribe$/ })).toBeDisabled()
  })

  test('Successful upload transcription injects text into story content textarea', async ({ page }) => {
    await page.goto('/library/publish')
    await page.getByRole('button', { name: /Transcribe Audio/i }).click()

    await page.locator('input[type="file"]').setInputFiles({
      name: 'test.mp3',
      mimeType: 'audio/mpeg',
      buffer: Buffer.alloc(1024, 0),
    })

    await page.getByRole('button', { name: /^Transcribe$/ }).click()

    await expect(page.locator('.modal-content')).not.toBeVisible()
    await expect(
      page.locator('textarea[placeholder*="Tell-Tale"]')
    ).toHaveValue('Darkness fell upon the ancient house.')
  })

  test('Successful upload transcription injects text into thread body textarea', async ({ page }) => {
    await page.goto('/forum/new')
    await page.getByRole('button', { name: /Transcribe Audio/i }).click()

    await page.locator('input[type="file"]').setInputFiles({
      name: 'test.mp3',
      mimeType: 'audio/mpeg',
      buffer: Buffer.alloc(1024, 0),
    })

    await page.getByRole('button', { name: /^Transcribe$/ }).click()

    await expect(page.locator('.modal-content')).not.toBeVisible()
    await expect(
      page.locator('textarea[placeholder*="void"]')
    ).toHaveValue('Darkness fell upon the ancient house.')
  })
})
```

- [ ] **Step 3: Run tests — verify they fail because components don't exist yet**

```powershell
npx playwright test tests/transcribe.spec.js --reporter=line
```

Expected: all 6 tests fail (buttons not found).

- [ ] **Step 4: Commit failing tests**

```bash
git add tests/transcribe.spec.js playwright.config.js
git commit -m "test: add failing Playwright tests for audio transcription"
```

---

## Task 4: TranscribeButton component

**Files:**
- Create: `src/components/TranscribeButton.jsx`

- [ ] **Step 1: Create `src/components/TranscribeButton.jsx`**

```jsx
import { useState } from 'react'
import TranscribeModal from './TranscribeModal'

export default function TranscribeButton({ onTranscribed }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        className="btn ghost transcribe-btn"
        onClick={() => setOpen(true)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '8px 14px' }}
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
        Transcribe Audio
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

- [ ] **Step 2: Commit**

```bash
git add src/components/TranscribeButton.jsx
git commit -m "feat: add TranscribeButton component"
```

---

## Task 5: TranscribeModal component

**Files:**
- Create: `src/components/TranscribeModal.jsx`

- [ ] **Step 1: Create `src/components/TranscribeModal.jsx`**

```jsx
import { useState, useRef, useEffect } from 'react'

const TRANSCRIBE_URL = import.meta.env.VITE_TRANSCRIBE_URL
const MAX_BYTES = 4 * 1024 * 1024
const ACCEPTED = '.mp3,.wav,.m4a,.ogg,audio/mpeg,audio/wav,audio/mp4,audio/ogg'
const MAX_RECORD_MS = 10 * 60 * 1000
const WARNING =
  'For best results, use clear speech in a quiet room. Background music, heavy accents, or low-quality recordings may produce errors. Max 4 MB (~4 min MP3).'

async function postAudio(blob, filename) {
  if (!TRANSCRIBE_URL) throw new Error('Transcription service is not configured.')
  const form = new FormData()
  form.append('audio', blob, filename)
  const res = await fetch(`${TRANSCRIBE_URL}/transcribe`, { method: 'POST', body: form })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'Transcription failed.')
  return data.text
}

function fmtTime(s) {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export default function TranscribeModal({ onTranscribed, onClose }) {
  const [tab, setTab] = useState('upload')
  const [file, setFile] = useState(null)
  const [fileError, setFileError] = useState(null)
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState(null)

  const [recording, setRecording] = useState(false)
  const [recSecs, setRecSecs] = useState(0)
  const [recBlob, setRecBlob] = useState(null)
  const [recError, setRecError] = useState(null)

  const mrRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)
  const autoStopRef = useRef(null)

  useEffect(() => {
    const onEsc = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [onClose])

  useEffect(() => {
    return () => {
      clearInterval(timerRef.current)
      clearTimeout(autoStopRef.current)
      if (mrRef.current?.state !== 'inactive') mrRef.current?.stop()
    }
  }, [])

  const onFileChange = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setFileError(f.size > MAX_BYTES ? 'File exceeds the 4 MB limit.' : null)
    setError(null)
  }

  const transcribeFile = async () => {
    if (!file || fileError) return
    setIsBusy(true)
    setError(null)
    try {
      const text = await postAudio(file, file.name)
      onTranscribed(text)
    } catch (err) {
      setError(err.message || 'Could not reach the transcription service. Check your connection.')
    } finally {
      setIsBusy(false)
    }
  }

  const startRec = async () => {
    setRecError(null)
    setRecBlob(null)
    setRecSecs(0)
    chunksRef.current = []

    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setRecError('Microphone access was denied. Allow it in your browser settings.')
      return
    }

    const mr = new MediaRecorder(stream)
    mrRef.current = mr

    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    mr.onstop = () => {
      stream.getTracks().forEach(t => t.stop())
      const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' })
      clearInterval(timerRef.current)
      setRecording(false)
      if (blob.size > MAX_BYTES) {
        setRecError('Recording is too large — try a shorter clip.')
      } else {
        setRecBlob(blob)
      }
    }

    mr.start(1000)
    setRecording(true)

    timerRef.current = setInterval(() => setRecSecs(s => s + 1), 1000)
    autoStopRef.current = setTimeout(() => {
      if (mrRef.current?.state !== 'inactive') {
        mrRef.current.stop()
        setRecError('Recording capped at 10 minutes.')
      }
    }, MAX_RECORD_MS)
  }

  const stopRec = () => {
    clearTimeout(autoStopRef.current)
    clearInterval(timerRef.current)
    if (mrRef.current?.state !== 'inactive') mrRef.current.stop()
  }

  const transcribeRec = async () => {
    if (!recBlob) return
    setIsBusy(true)
    setError(null)
    try {
      const text = await postAudio(recBlob, 'recording.webm')
      onTranscribed(text)
    } catch (err) {
      setError(err.message || 'Could not reach the transcription service. Check your connection.')
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <button className="modal-close" onClick={onClose} aria-label="Close">×</button>

        <div className="modal-header">
          <h2>Transcribe <em>Audio</em></h2>
        </div>

        <div style={{
          background: 'rgba(255,200,0,0.07)',
          border: '1px solid rgba(255,200,0,0.25)',
          borderRadius: 6,
          padding: '10px 14px',
          fontSize: 13,
          color: 'var(--bone-dim)',
          marginBottom: 20,
          lineHeight: 1.55,
        }}>
          ⚠ {WARNING}
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {['upload', 'record'].map(t => (
            <button
              key={t}
              type="button"
              className={`btn ${tab === t ? 'primary' : 'ghost'}`}
              onClick={() => setTab(t)}
              style={{ flex: 1, padding: '8px 0', fontSize: 13 }}
            >
              {t === 'upload' ? '📎 Upload File' : '🎙 Record'}
            </button>
          ))}
        </div>

        {tab === 'upload' && (
          <div>
            <input
              type="file"
              accept={ACCEPTED}
              onChange={onFileChange}
              style={{ width: '100%', marginBottom: 8, color: 'var(--bone)' }}
            />
            {file && !fileError && (
              <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
                {file.name} · {(file.size / 1024).toFixed(0)} KB
              </p>
            )}
            {fileError && (
              <p style={{ color: 'var(--blood)', fontSize: 13, marginBottom: 8 }}>{fileError}</p>
            )}
            {error && (
              <p style={{ color: 'var(--blood)', fontSize: 13, marginBottom: 8 }}>{error}</p>
            )}
            <button
              type="button"
              className="btn blood full-width"
              onClick={transcribeFile}
              disabled={!file || !!fileError || isBusy}
            >
              {isBusy ? 'Transcribing…' : 'Transcribe'}
            </button>
          </div>
        )}

        {tab === 'record' && (
          <div>
            {!recording && !recBlob && (
              <button
                type="button"
                className="btn blood full-width"
                onClick={startRec}
                style={{ marginBottom: 8 }}
              >
                🎙 Start Recording
              </button>
            )}
            {recording && (
              <div style={{ textAlign: 'center', marginBottom: 12 }}>
                <p style={{ fontFamily: 'var(--mono)', fontSize: 28, color: 'var(--blood)', margin: '0 0 12px' }}>
                  ● {fmtTime(recSecs)}
                </p>
                <button type="button" className="btn ghost full-width" onClick={stopRec}>
                  ■ Stop
                </button>
              </div>
            )}
            {recBlob && !recording && (
              <div>
                <p style={{ fontSize: 13, color: 'var(--bone-dim)', marginBottom: 8 }}>
                  Recording ready · {fmtTime(recSecs)}
                </p>
                <button
                  type="button"
                  className="btn blood full-width"
                  onClick={transcribeRec}
                  disabled={isBusy}
                >
                  {isBusy ? 'Transcribing…' : 'Transcribe'}
                </button>
                <button
                  type="button"
                  className="btn ghost full-width"
                  onClick={() => { setRecBlob(null); setRecSecs(0); setRecError(null) }}
                  disabled={isBusy}
                  style={{ marginTop: 8 }}
                >
                  Record Again
                </button>
              </div>
            )}
            {recError && (
              <p style={{ color: 'var(--blood)', fontSize: 13, marginTop: 8 }}>{recError}</p>
            )}
            {error && (
              <p style={{ color: 'var(--blood)', fontSize: 13, marginTop: 8 }}>{error}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/TranscribeModal.jsx
git commit -m "feat: add TranscribeModal with upload and record tabs"
```

---

## Task 6: Wire TranscribeButton into PublishStory.jsx

**Files:**
- Modify: `src/pages/PublishStory.jsx`

- [ ] **Step 1: Add import at the top of `src/pages/PublishStory.jsx`**

After the existing imports (line ~5), add:

```js
import TranscribeButton from '../components/TranscribeButton'
```

- [ ] **Step 2: Add TranscribeButton after the content textarea's `profile-field-input` div**

Find the block ending around line 171:

```jsx
          <div className="profile-field-input">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              required
              rows={20}
              placeholder="True!—nervous—very, very dreadfully nervous I had been and am; but why will you say that I am mad?"
              style={{ fontFamily: 'var(--body)', fontSize: '1.1rem', lineHeight: 1.7 }}
            />
          </div>
```

Replace it with:

```jsx
          <div className="profile-field-input">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              required
              rows={20}
              placeholder="True!—nervous—very, very dreadfully nervous I had been and am; but why will you say that I am mad?"
              style={{ fontFamily: 'var(--body)', fontSize: '1.1rem', lineHeight: 1.7 }}
            />
          </div>
          <div style={{ marginTop: 8 }}>
            <TranscribeButton
              onTranscribed={(text) => setContent(prev => prev ? `${prev}\n\n${text}` : text)}
            />
          </div>
```

- [ ] **Step 3: Run the transcription tests — verify story editor tests now pass**

```powershell
npx playwright test tests/transcribe.spec.js --reporter=line
```

Expected: the two story-editor tests pass; thread tests still fail.

- [ ] **Step 4: Commit**

```bash
git add src/pages/PublishStory.jsx
git commit -m "feat: add TranscribeButton to story editor"
```

---

## Task 7: Wire TranscribeButton into CreateThread.jsx

**Files:**
- Modify: `src/pages/CreateThread.jsx`

- [ ] **Step 1: Add import at the top of `src/pages/CreateThread.jsx`**

After the existing imports (line ~5), add:

```js
import TranscribeButton from '../components/TranscribeButton'
```

- [ ] **Step 2: Add TranscribeButton after the thread body textarea's `profile-field-input` div**

Find the block around line 110:

```jsx
          <div className="profile-field-input">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              required
              rows={8}
              placeholder="Speak into the void…"
            />
          </div>
```

Replace it with:

```jsx
          <div className="profile-field-input">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              required
              rows={8}
              placeholder="Speak into the void…"
            />
          </div>
          <div style={{ marginTop: 8 }}>
            <TranscribeButton
              onTranscribed={(text) => setContent(prev => prev ? `${prev}\n\n${text}` : text)}
            />
          </div>
```

- [ ] **Step 3: Run all transcription tests — verify all 6 pass**

```powershell
npx playwright test tests/transcribe.spec.js --reporter=line
```

Expected: all 6 tests pass.

- [ ] **Step 4: Run full test suite to check for regressions**

```powershell
npx playwright test --reporter=line
```

Expected: all existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/pages/CreateThread.jsx
git commit -m "feat: add TranscribeButton to thread composer"
```

---

## Task 8: Deploy Worker + configure env vars

> This task is manual steps. No code changes.

- [ ] **Step 1: Deploy the Worker**

Run from `workers/transcribe/`:

```powershell
cd workers\transcribe
npx wrangler deploy
```

Expected output includes: `Deployed horrorwriter-transcribe` with a Workers URL like `https://horrorwriter-transcribe.<account>.workers.dev`.

Note the URL — you'll need it in the next steps.

- [ ] **Step 2: Add `VITE_TRANSCRIBE_URL` to `.env.local` for local dev**

In the project root `.env.local`, add:

```
VITE_TRANSCRIBE_URL=https://horrorwriter-transcribe.<account>.workers.dev
```

(Replace `<account>` with your actual Cloudflare account subdomain from the deploy output.)

- [ ] **Step 3: Add `VITE_TRANSCRIBE_URL` to Cloudflare Pages env vars**

1. Go to Cloudflare Dashboard → Pages → `horrorwriter` → Settings → Environment Variables
2. Add variable: `VITE_TRANSCRIBE_URL` = `https://horrorwriter-transcribe.<account>.workers.dev`
3. Set for both Production and Preview environments

- [ ] **Step 4: Deploy the site**

```powershell
cd D:\CLAUDECODE\Projects\horrorwriter
npm run build
npx wrangler pages deploy dist --project-name horrorwriter
```

- [ ] **Step 5: Smoke-test on prod**

1. Go to `https://horrorwriter.org/library/publish`
2. Click "Transcribe Audio" — modal should open with warning banner
3. Upload a short MP3 (< 4 MB) — click Transcribe — verify text appears in story editor

- [ ] **Step 6: Final commit**

```bash
git add .
git commit -m "chore: add VITE_TRANSCRIBE_URL to local env (gitignored)"
```

(`.env.local` is gitignored — this commit will be empty if `.env.local` is already ignored. That's fine — skip if so.)
