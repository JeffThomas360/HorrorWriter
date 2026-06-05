# Audio Transcription Feature — Design Spec
**Date:** 2026-06-04  
**Status:** Approved

---

## Overview

A contextual audio-to-text transcription button added to two specific large text fields in HorrorWriter: the story content editor and the thread body composer. Users can upload an audio file or record live via their microphone; the audio is sent to a Cloudflare Worker that calls Workers AI Whisper and returns a transcript, which is inserted at the cursor in the target textarea.

---

## Architecture

```
User audio (file upload OR browser MediaRecorder blob)
  → POST /transcribe  (CF Worker — workers/transcribe/)
      multipart/form-data, field: "audio"
  → env.AI.run('@cf/openai/whisper', { audio: ArrayBuffer })
  → { text: "transcript..." }
  → Injected into focused textarea at cursor position
```

**No auth check on the Worker.** Whisper per-request cost is low; open access is acceptable. A Cloudflare Access rule can be layered on later if abuse occurs.

---

## Cloudflare Worker (`workers/transcribe/`)

- **Runtime:** Cloudflare Worker (Wrangler)
- **Endpoint:** `POST /transcribe`
- **Request body:** `multipart/form-data` with field `audio`
- **Size limit:** 4 MB enforced in Worker (returns 413 if exceeded)
- **AI binding:** `env.AI.run('@cf/openai/whisper', { audio: <ArrayBuffer> })`
- **Response (success):** `{ text: "..." }`
- **Response (error):** `{ error: "..." }` with appropriate HTTP status
- **CORS:** `Access-Control-Allow-Origin` set to `https://horrorwriter.org`, `https://www.horrorwriter.org`, `https://*.horrorwriter.pages.dev`
- **Deploy:** `npx wrangler deploy` from `workers/transcribe/`

### Files
```
workers/
  transcribe/
    src/
      index.js       # Worker entry point
    wrangler.toml    # name = "horrorwriter-transcribe", ai binding
    package.json
```

---

## Frontend Components

### `TranscribeButton` (`src/components/TranscribeButton.jsx`)

A small button rendered inline within a form, positioned near its target textarea. Props:
- `textareaRef` — ref to the textarea to inject text into

Renders a microphone icon button. Opens `TranscribeModal` on click. On successful transcription, inserts the returned text at the textarea's current cursor position (or appends if no selection).

### `TranscribeModal` (`src/components/TranscribeModal.jsx`)

A modal with two tabs: **Upload** and **Record**.

**Warning banner (both tabs):**
> "For best results, use clear speech in a quiet room. Background music, heavy accents, or low-quality recordings may produce errors. Max 4 MB."

**Upload tab:**
- File picker accepting `.mp3`, `.wav`, `.m4a`, `.ogg`
- Shows filename + file size after selection
- Disables "Transcribe" button if file > 4 MB (red inline error: "File exceeds the 4 MB limit.")
- On submit: POST to CF Worker, show "Transcribing…" spinner

**Record tab:**
- Single Start/Stop button using `MediaRecorder` API (codec: `audio/webm;codecs=opus` or best available)
- Live timer showing recording duration
- Auto-stops at 10 minutes with notice: "Recording capped at 10 minutes."
- After stop: checks blob size; if > 4 MB, shows error: "Recording is too large — try a shorter clip."
- On submit: POST blob to CF Worker

---

## Error Handling

| Scenario | Message shown |
|---|---|
| File > 4 MB | "File exceeds the 4 MB limit." (inline, before upload) |
| Recording > 4 MB after stop | "Recording is too large — try a shorter clip." |
| Mic permission denied | "Microphone access was denied. Allow it in your browser settings." |
| Recording capped at 10 min | "Recording capped at 10 minutes." (auto-stops) |
| Worker returns error | "Transcription failed — try a shorter clip or cleaner audio." |
| Network failure | "Could not reach the transcription service. Check your connection." |

---

## Integration Points

The `TranscribeButton` is placed **only** in these two components:

| Component | Textarea | Placement |
|---|---|---|
| `src/pages/PublishStory.jsx` | Story content body | Below/beside the content textarea |
| `src/pages/CreateThread.jsx` | Thread body | Below/beside the body textarea |

No global listener or MutationObserver. The button is rendered directly in each form's JSX.

---

## Warnings to Users

Displayed prominently inside the modal before every transcription:
- Requires clear speech in a quiet environment
- Background music will degrade accuracy
- Heavy accents or fast speech may produce errors
- 4 MB file size cap (~4 minutes of MP3 at 128kbps)
- Results are a starting point — always review before publishing

---

## Out of Scope

- Reply box textarea (`ThreadView.jsx`)
- Bio field (`Profile.jsx`)
- Real-time streaming transcription
- Speaker diarization
- Translation (transcription only, no language conversion)
- Storage of audio files
