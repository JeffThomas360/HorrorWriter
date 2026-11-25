/**
 * How a story's text reached the editor: counts of characters typed, pasted,
 * dictated and imported, and roughly how long the editor was in use.
 *
 * Counts only. Nothing here ever holds a keystroke or a piece of the text.
 * Staff read the counts when a story is suspected of being machine-written;
 * the browser reports them, so they are context, not proof.
 */

const PASTE_INPUT_TYPES = new Set(['insertFromPaste', 'insertFromDrop', 'insertFromYank'])

/** A pause longer than this is the writer away from the editor, not writing. */
const IDLE_GAP_MS = 60000

const COUNT_KEYS = ['typed', 'pasted', 'pastes', 'largest_paste', 'dictated', 'imported', 'active_ms']

/**
 * The editor's toolbar and file import call onChange with a bare `{ target }`,
 * so a change with no native event did not come from the keyboard or clipboard.
 */
export function classifyChange(event) {
  const native = event?.nativeEvent
  if (!native) return 'imported'
  return PASTE_INPUT_TYPES.has(native.inputType) ? 'pasted' : 'typed'
}

const count = (value) => (Number.isFinite(value) && value > 0 ? Math.floor(value) : 0)

/**
 * `saved` is an earlier snapshot kept with the draft: counts carry on from it,
 * and this is one more sitting.
 */
export function createComposeTracker(saved, now = Date.now) {
  const counts = {}
  for (const key of COUNT_KEYS) counts[key] = count(saved?.[key])
  const sittings = count(saved?.sittings) + 1
  let charsAtOpen = Number.isFinite(saved?.chars_at_open) ? count(saved.chars_at_open) : null
  let lastAt = null

  function touch() {
    const at = now()
    if (lastAt !== null) {
      const gap = at - lastAt
      if (gap > 0 && gap < IDLE_GAP_MS) counts.active_ms += gap
    }
    lastAt = at
  }

  return {
    open(length) {
      if (charsAtOpen === null) charsAtOpen = count(length)
    },
    change(event, prevLength, nextLength) {
      touch()
      const growth = nextLength - prevLength
      if (!(growth > 0)) return
      const kind = classifyChange(event)
      counts[kind] += growth
      if (kind === 'pasted') {
        counts.pastes += 1
        counts.largest_paste = Math.max(counts.largest_paste, growth)
      }
    },
    dictated(length) {
      touch()
      counts.dictated += count(length)
    },
    snapshot(finalLength) {
      return { ...counts, sittings, chars_at_open: charsAtOpen ?? 0, chars_final: count(finalLength) }
    },
  }
}

/**
 * Send the counts for a story the author just published. Awaited before the
 * redirect, like screenContent, so the call is not cancelled; capped so a slow
 * call never traps the writer on the page. Never rejects.
 */
export async function recordComposeSignals(supabase, storyId, snapshot, timeoutMs = 4000) {
  if (!supabase || !storyId) return
  let timer
  try {
    const call = Promise.resolve(
      supabase.rpc('record_compose_signals', { p_story_id: storyId, p_signals: snapshot })
    ).catch(console.error)
    const timeout = new Promise((resolve) => { timer = setTimeout(resolve, timeoutMs) })
    await Promise.race([call, timeout])
  } catch (err) {
    console.error(err)
  } finally {
    clearTimeout(timer)
  }
}
