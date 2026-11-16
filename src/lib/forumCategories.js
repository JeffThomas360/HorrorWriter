/**
 * Purpose-driven metadata for The Crypt's forum categories.
 *
 * Why this lives in code alongside `public.categories`:
 * - The database's legacy `name` values ('The Crypt · Critique', 'The Writing Desk · Craft',
 *   etc.) had `description = null`, and splitting on `·` turned 'The Crypt · Critique' into a
 *   room literally named "The Crypt" inside The Crypt while stripping the functional purpose
 *   ('Critique', 'Craft', 'Market', 'Announcements') from every room.
 * - Known category IDs ('rituals', 'crypt', 'seance', 'dispatch', 'hours', 'coven') get clear,
 *   action-oriented labels, room missions, and starter prompts so empty or quiet rooms explain
 *   their purpose and invite specific posts.
 * - Unknown category IDs (e.g. unit/E2E fixtures like 'craft' or 'cat-1') fall back cleanly to
 *   the database row's `name` and `description`.
 */

export const CATEGORY_META = {
  rituals: {
    id: 'rituals',
    sidebarLabel: 'Midnight Rituals',
    fullTitle: 'Midnight Rituals · Weekly Prompts',
    badgeLabel: 'Midnight Rituals',
    mission: 'Five weekly rotating horror prompts (100–2,000 words) and peer critiques.',
    starterPrompt: 'Pick an active prompt below to read and critique submissions, or write your own entry on the front page.',
    staffOnly: false,
  },
  crypt: {
    id: 'crypt',
    sidebarLabel: 'First Lines & Snags',
    fullTitle: 'First Lines & Snags · Workshop',
    badgeLabel: 'First Lines & Snags',
    mission: 'Stuck on an opening 250 words, a broken ending, or a plot snag? Drop a fragment or pitch here for quick surgery. (Full stories belong in The Library.)',
    starterPrompt: 'Paste your opening paragraph or describe the scene where your draft stalled, and tell us what feels off.',
    staffOnly: false,
  },
  seance: {
    id: 'seance',
    sidebarLabel: 'Craft & Anatomy',
    fullTitle: 'The Writing Desk · Craft & Anatomy',
    badgeLabel: 'Craft & Anatomy',
    mission: 'How horror works: pacing dread, unreliable narrators, gore vs. atmosphere, and dissecting what scares us.',
    starterPrompt: 'Start a discussion on a technique, subgenre trope, or structural problem you are wrestling with.',
    staffOnly: false,
  },
  dispatch: {
    id: 'dispatch',
    sidebarLabel: 'Markets & Calls',
    fullTitle: 'Dispatches · Markets & Calls',
    badgeLabel: 'Markets & Calls',
    mission: 'Open anthologies, magazine submission windows, contest deadlines, and publishing notes.',
    starterPrompt: 'Share an open call (include word count, pay rate, and deadline) or compare notes on response times.',
    staffOnly: false,
  },
  hours: {
    id: 'hours',
    sidebarLabel: 'The Green Room',
    fullTitle: 'After Hours · The Green Room',
    badgeLabel: 'The Green Room',
    mission: 'Introduce yourself, share what you are reading or watching tonight, and celebrate finished drafts.',
    starterPrompt: 'Pull up a chair: tell us what kind of horror you write, or what book kept you awake this week.',
    staffOnly: false,
  },
  coven: {
    id: 'coven',
    sidebarLabel: 'Notice Board',
    fullTitle: 'Notice Board · Keeper Dispatches',
    badgeLabel: 'Notice Board',
    mission: 'Official site updates, house announcements, and dispatches from the Keeper.',
    starterPrompt: 'Announce a site update, community milestone, or house notice for members.',
    staffOnly: true,
  },
}

/**
 * Resolve rich metadata for a category row (`{ id, name, description }`) or category ID string.
 */
export function getCategoryMeta(catOrId) {
  const isObj = catOrId && typeof catOrId === 'object'
  const id = isObj ? catOrId.id : catOrId
  if (id && CATEGORY_META[id]) {
    return CATEGORY_META[id]
  }
  const rawName = isObj ? String(catOrId.name || '') : ''
  const shortName = rawName.split('·')[0].trim()
  return {
    id: id || '',
    sidebarLabel: shortName,
    fullTitle: rawName.trim() || shortName,
    badgeLabel: shortName || 'Thread',
    mission: (isObj && catOrId.description) ? String(catOrId.description) : null,
    starterPrompt: null,
    staffOnly: false,
  }
}

export function categorySidebarLabel(cat) {
  return getCategoryMeta(cat).sidebarLabel
}

export function categoryOptionLabel(cat) {
  return getCategoryMeta(cat).fullTitle || String(cat?.name || '')
}
