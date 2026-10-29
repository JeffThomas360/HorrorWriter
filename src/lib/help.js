// Which Help (FAQ) entries exist on this build, and how they are grouped.
// Drafts appear only in dev; production never builds them. An entry with no answer
// from Jeff is never shown, in dev or in production. An HTML comment (the note the
// template leaves in the body) is not an answer.
const hasAnswer = (entry) => (entry.body ?? '').replace(/<!--[\s\S]*?-->/g, '').trim() !== ''

export function visibleHelp(entries, { dev = false } = {}) {
  return entries.filter((e) => (dev || !e.data.draft) && hasAnswer(e))
}

// topic slug -> entries in reading order. Slugs with no entries are absent.
export function groupByTopic(entries) {
  const groups = {}
  const sorted = [...entries].sort(
    (a, b) => a.data.order - b.data.order || a.data.question.localeCompare(b.data.question),
  )
  for (const entry of sorted) (groups[entry.data.topic] ??= []).push(entry)
  return groups
}

// What the OpenTicket island receives for one entry. `rendered.html` is Astro's own
// build-time render of Jeff's markdown, never member text.
export function toFaqItem(entry) {
  return { topic: entry.data.topic, question: entry.data.question, html: entry.rendered?.html ?? '' }
}
