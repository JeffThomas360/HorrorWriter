import { supabase } from '../supabaseClient'
import { SITE_DESCRIPTION, xmlEscape } from './seo'
import { absoluteUrl, storyPath, threadPath } from './urls'
import { storyUrlKey, storyAuthorLabel } from './storyHelpers'

export const FEED_PATH = '/feed.xml'
export const FEED_TITLE = 'Horror Writer: new prompts and stories'
const FEED_LIMIT = 30

/** Newest live member stories. Classics are left out: they are not news. */
export async function fetchFeedStories() {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('books')
    .select('id, slug, title, lede, created_at, archive_author, profiles(handle)')
    .eq('mod_status', 'live')
    .eq('removed_by_author', false)
    .is('archive_author', null)
    .order('created_at', { ascending: false })
    .limit(FEED_LIMIT)
  if (error || !data) return []
  return data
}

const day = (iso) => new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })

/** One list, newest first, from the prompt archive (see promptArchive.js) and stories. */
export function buildFeedItems(prompts, stories, limit = FEED_LIMIT) {
  const promptItems = (prompts || []).map((p) => ({
    title: `Horror writing prompt, ${day(p.goesLiveAt)}`,
    // A prompt's own page is its critique thread; one with no thread yet lives on the archive.
    link: absoluteUrl(p.threadId ? threadPath(p.threadId) : '/prompts/'),
    guid: `prompt:${p.id}`,
    description: p.body,
    date: p.goesLiveAt,
  }))
  const storyItems = (stories || []).map((b) => {
    const link = absoluteUrl(storyPath(storyUrlKey(b)))
    return {
      title: `${b.title} by ${storyAuthorLabel(b)}`,
      link,
      guid: link,
      description: b.lede || '',
      date: b.created_at,
    }
  })
  return [...promptItems, ...storyItems]
    .filter((i) => i.date)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, limit)
}

export function buildRssXml(items) {
  const body = items.map((i) => [
    '<item>',
    `<title>${xmlEscape(i.title)}</title>`,
    `<link>${xmlEscape(i.link)}</link>`,
    `<guid isPermaLink="${i.guid === i.link}">${xmlEscape(i.guid)}</guid>`,
    `<pubDate>${new Date(i.date).toUTCString()}</pubDate>`,
    `<description>${xmlEscape(i.description)}</description>`,
    '</item>',
  ].join('')).join('')
  return '<?xml version="1.0" encoding="UTF-8"?>'
    + '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>'
    + `<title>${xmlEscape(FEED_TITLE)}</title>`
    + `<link>${absoluteUrl('/')}</link>`
    + `<description>${xmlEscape(SITE_DESCRIPTION)}</description>`
    + '<language>en-us</language>'
    + `<atom:link href="${absoluteUrl(FEED_PATH)}" rel="self" type="application/rss+xml"/>`
    + body
    + '</channel></rss>'
}
