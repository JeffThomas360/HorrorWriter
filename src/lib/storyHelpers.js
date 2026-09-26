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
 * seeded archive stories have no author_id, and signed-out visitors have no
 * user id, so a bare === matched undefined to undefined.
 */
export function isStoryOwner(userId, book) {
  return Boolean(userId) && Boolean(book?.author_id) && userId === book.author_id
}

/**
 * The line shown under every story. Authors keep all rights (House Rules,
 * rule 1). The seeded archive classics are public domain, so they say that
 * instead: claiming copyright on them would be false.
 */
export function copyrightNotice(book) {
  if (!book) return null
  const year = book.created_at ? new Date(book.created_at).getUTCFullYear() : new Date().getUTCFullYear()
  if (book.is_artificial) return `Public domain · first published ${year}`
  const author = book.profiles?.handle ? `@${book.profiles.handle}` : 'the author'
  return `© ${year} ${author}. All rights reserved.`
}
