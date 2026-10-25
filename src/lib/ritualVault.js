// What goes into a Midnight Ritual "Keep it" vault bundle. Pure data shaping, no network, so
// vitest can cover it. The bundle itself is locked with sealWriting() from ./seal (the same
// browser-side AES-GCM + recovery-code scheme as account sealing); this file only decides
// what is inside.
//
// Moderation-removed ('hidden') posts never go in: they were already read and judged. A visible
// reply under a removed post is dropped with it, since its parent will not exist on restore.
// The entry itself is kept even if hidden, so a writer under revision never loses their work;
// its mod_status is recorded so restore can bring it back still hidden.
// ritual_feedback (the private mentor conversation) is deliberately not collected here.

export const VAULT_PAYLOAD_VERSION = 1
export const VAULT_KIND = 'ritual-entry'

const ENTRY_FIELDS = ['title', 'content', 'created_at', 'updated_at', 'edited_at', 'mod_status']
const CRITIQUE_FIELDS = ['content', 'created_at', 'updated_at', 'edited_at', 'mod_status']

function pick(row, fields) {
  return Object.fromEntries(fields.map((f) => [f, row[f] ?? null]))
}

function byCreated(a, b) {
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * @param thread  { prompt_id, title, created_at } - the vault is keyed to the prompt, so the
 *                thread can be recreated if it was removed with the last entry.
 * @param entry   the author's top-level post row (with profiles(handle) if available)
 * @param posts   every post in the thread (the builder picks the entry's descendants)
 * @param seals   optional { [postId]: sealHex } made by the server at archive time
 */
export function buildVaultPayload({ thread, entry, posts = [], seals = null }) {
  const seal = (id) => seals?.[id] ?? null
  const item = (row, fields, parentKey) => ({
    key: row.id,
    parent_key: parentKey,
    author_id: row.author_id ?? null,
    author_handle: row.profiles?.handle ?? null,
    ...pick(row, fields),
    seal: seal(row.id),
  })

  const children = new Map()
  for (const p of posts) {
    if (p.parent_post_id == null) continue
    if (!children.has(p.parent_post_id)) children.set(p.parent_post_id, [])
    children.get(p.parent_post_id).push(p)
  }

  const critiques = []
  const queue = [entry.id]
  while (queue.length) {
    const parentId = queue.shift()
    for (const child of (children.get(parentId) ?? []).slice().sort(byCreated)) {
      if (child.mod_status === 'hidden') continue
      critiques.push(child)
      queue.push(child.id)
    }
  }
  critiques.sort(byCreated)

  return {
    v: VAULT_PAYLOAD_VERSION,
    kind: VAULT_KIND,
    thread: {
      prompt_id: thread.prompt_id,
      title: thread.title ?? null,
      created_at: thread.created_at ?? null,
    },
    entry: item(entry, ENTRY_FIELDS, null),
    critiques: critiques.map((c) => item(c, CRITIQUE_FIELDS, c.parent_post_id)),
  }
}
