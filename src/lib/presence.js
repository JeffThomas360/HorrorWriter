// Placeholder handles the forum lobby tracks for people with no public name.
const NAMELESS = new Set(['Guest', 'Summoning...'])

/**
 * Split lobby presence into writers to show (signed in, with a handle) and a
 * count of everyone else. Guests used to render as "??" circles under
 * "Writers Online", so a logged-out visitor saw themselves as a glitch.
 */
export function splitPresence(users) {
  const writers = []
  let readers = 0
  for (const u of users) {
    if (u?.handle && !NAMELESS.has(u.handle)) writers.push(u)
    else readers += 1
  }
  return { writers, readers }
}
