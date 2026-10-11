/**
 * Filters a story list to allow all real community stories,
 * but caps example/demo stories at most ONE per category/group.
 */
export function filterOneExamplePerGroup(stories = []) {
  if (!Array.isArray(stories)) return []

  const seenExampleCategories = new Set()
  const result = []

  for (const story of stories) {
    const isExample = Boolean(story.is_example || story.badge)
    if (!isExample) {
      result.push(story)
    } else {
      const groupKey = story.category_id || story.seriesId || 'default'
      if (!seenExampleCategories.has(groupKey)) {
        seenExampleCategories.add(groupKey)
        result.push(story)
      }
    }
  }

  return result
}

/**
 * True only when a signed-in user wrote the story. Both ids must be present:
 * archive classics have no author_id, and signed-out visitors have no
 * user id, so a bare === matched undefined to undefined.
 */
export function isStoryOwner(userId, book) {
  return Boolean(userId) && Boolean(book?.author_id) && userId === book.author_id
}

/**
 * The line shown under every story. Authors keep all rights (House Rules,
 * rule 1). The archive classics are public domain, so they say that
 * instead: claiming copyright on them would be false.
 */
export function copyrightNotice(book) {
  if (!book) return null
  const year = book.created_at ? new Date(book.created_at).getUTCFullYear() : new Date().getUTCFullYear()
  if (isArchive(book)) return `Public domain · first published ${year}`
  const author = book.profiles?.handle ? `@${book.profiles.handle}` : 'the author'
  return `© ${year} ${author}. All rights reserved.`
}

export const TOMBSTONE_TEXT = 'Removed by its author.'

/** Author credit: '@handle', or 'a departed member' once the account is deleted. */
export function authorLabel(profile) {
  return profile?.handle ? `@${profile.handle}` : 'a departed member'
}

/**
 * A public-domain classic: a books row with archive_author set and no member
 * author. Not a departed member's story, though both have author_id null.
 */
export function isArchive(book) {
  return Boolean(book?.archive_author)
}

/** Author credit for a story: the classic's author by name, else authorLabel. */
export function storyAuthorLabel(book) {
  return isArchive(book) ? book.archive_author : authorLabel(book?.profiles)
}

/**
 * Which books column a /library/read/<key>/ segment matches. Classics keep their
 * old archive-* slug URLs (the migration requires that prefix); everything else
 * is an id. Querying the uuid column with a slug is a PostgREST 400, so callers
 * must pick the column first.
 */
export function storyKeyColumn(key) {
  return String(key ?? '').startsWith('archive-') ? 'slug' : 'id'
}

/** The URL segment for a story: its slug when it has one, else its id. */
export function storyUrlKey(book) {
  return book?.slug || book?.id
}

/** A story or thread whose author deleted their account, kept for others' replies. */
export function isTombstone(row) {
  return Boolean(row?.removed_by_author)
}
