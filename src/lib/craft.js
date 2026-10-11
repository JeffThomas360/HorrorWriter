// Which craft pages exist on this build, in index order.
// Drafts appear only in dev; production never builds them.
export function visibleCraft(entries, { dev = false } = {}) {
  return entries
    .filter((e) => dev || !e.data.draft)
    .sort((a, b) => a.data.order - b.data.order || a.data.title.localeCompare(b.data.title))
}
