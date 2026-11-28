import { storyPath } from './urls'
import { readMinutes } from './tapeWear'

/**
 * The homepage's "New in the Library" tiles. Pure: rows in, tiles out.
 *
 * rows = newest member stories, each { id, title, lede, content, profiles: { handle } }.
 * The first tile is the large one and is the only one that shows `body`.
 */
export function storyTiles(rows) {
  return (rows || []).map((s) => {
    const minutes = readMinutes(s.content)
    const handle = s.profiles?.handle
    return {
      tag: minutes ? `▸ STORY · ${minutes} MIN READ` : '▸ STORY',
      title: s.title,
      body: String(s.lede ?? '').trim(),
      meta: handle ? `By @${handle} · read it →` : 'Read it →',
      href: storyPath(s.id),
    }
  })
}
