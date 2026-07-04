# Transcribe flow redesign — "Record a post"

**Date:** 2026-07-04
**Status:** Approved design, pending implementation plan
**Files:** `src/components/TranscribeButton.jsx`, `src/components/TranscribeModal.jsx`, `tests/transcribe.spec.js`

## Problem

The audio-transcription controls are confusing: users can't tell whether recording is
working or what step they're on. Two root causes:

1. **Rendering broken.** `TranscribeButton.jsx` and `TranscribeModal.jsx` are the last
   components still built on the **removed VHS design system** — classes/vars like
   `modal-backdrop`, `modal-content`, `.btn`, `.btn.blood`, `.btn.ghost`, `full-width`,
   `--blood`, `--bone`, `--muted`, `--mono` have **zero definitions** in `src/styles/`.
   The modal therefore renders with no backdrop overlay, default browser buttons, and
   colors that resolve to nothing.
2. **No guidance or confirmation.** There is no step structure, minimal recording
   feedback (a plain timer), and on success the transcript is silently dumped into the
   editor and the modal closes — so users can't tell it worked.

## Goals

- Rebuild the modal + button in the **current "1980s paperback" theme**, matching the
  established modal pattern in `src/components/SignInModal.jsx`.
- Make the flow **record-first** with a clear **Record → Review → Add** structure.
- Give legible feedback at every stage: recording indicator, transcribing state, an
  editable review of the transcript, and an explicit success confirmation.

## Non-goals

- No backend changes. Same transcribe Worker (`POST {VITE_TRANSCRIBE_URL}/transcribe`,
  `multipart/form-data` field `audio`), same 4 MB limit, same accepted formats, same
  10-minute recording cap.
- No change to the integration contract: the modal still calls `onTranscribed(text)`,
  and callers (`PublishStory`, the new-thread form) keep appending that text as they do
  today.
- Not touching the other components still on the dead design system (`ReportModal`,
  `ShareBar`, the `mod/` tabs). Same rot, separate cleanup pass.

## Design

### Trigger button (`TranscribeButton.jsx`)

- Reskinned to the current theme (Tailwind utilities + `--color-*` tokens); all dead
  classes/inline VHS styles removed.
- Relabeled **"🎙 Record audio"** (was "Transcribe Audio").
- Unchanged placement and props (`onTranscribed`).

### Modal shell (`TranscribeModal.jsx`)

- Overlay: `fixed inset-0 z-50 bg-[#000]/80 backdrop-blur-sm flex items-center justify-center p-4`.
- Panel: `bg-[var(--color-bg-surface)]` with `vintage-border`, close (×) button, and the
  existing Esc-to-close behavior.
- Header: **"Record a post"** + a step indicator **Record → Review → Add**, current step
  in `--color-accent-crimson`.
- Calm helper line (replaces the large yellow warning banner): *"Speak clearly in a quiet
  room. Up to ~4 min."*

### Step 1 — Record (default view)

- Primary crimson button **"🎙 Tap to record"**.
- Secondary text link beneath: *"or upload an audio file instead"* → reveals the themed
  file picker (secondary path, feeds the same Review step).
- While recording: pulsing **● REC · MM:SS · listening…** and a full-width
  **"■ Stop & review"** button.
- Inline themed errors: microphone permission denied; recording auto-capped at 10 minutes.

### Step 2 — Review

- On Stop (or file selection), immediately POST to the transcribe Worker and show a
  legible **"Transcribing…"** busy state (disabled controls + spinner/label).
- Success: an **editable `<textarea>`** prefilled with the transcript, a **"~N words"**
  count, and buttons: primary **"Add to post"**, secondary **path-aware discard** that
  returns to Step 1 and clears state — labeled **"Re-record"** when the source was a
  recording, **"Choose another file"** when the source was an upload.
- Failure: themed inline error with a retry affordance (re-record / re-transcribe).
- Size guard: a recording or file over 4 MB shows the size error and does not submit.

### Step 3 — Add

- **"Add to post"** calls `onTranscribed(editedText)`, closes the modal, and fires a
  **sonner** toast: **"✓ Added ~N words to your draft."** (sonner's `<Toaster>` is already
  mounted globally in `MainLayout.astro`.)

### State model

Single `step` state machine: `record` → `transcribing` → `review` → (add closes) with
`record` reachable again via Re-record. Recording sub-state (idle/recording) lives inside
`record`. Upload selection jumps straight to `transcribing`. Errors are per-step and do
not lose the user's place.

## Testing

Update `tests/transcribe.spec.js` (currently 6 tests) to the new copy and flow, keeping
the mocked transcribe endpoint:

- Button label "Record audio" appears on the story editor and the new-thread form.
- Modal opens showing the Record step + step indicator + helper line.
- Upload path: choose file → Review shows editable transcript → "Add to post" injects
  text into the editor.
- **New:** success shows the confirmation toast and the transcript lands in the editor.
- A file over 4 MB shows the size error and disables submission.

## Rollout

Pure frontend change; ships via the normal push-to-`main` Workers Build. Manual smoke on
`horrorwriter.org` (record a short clip, review, add) folds into the pending P1
verification.
