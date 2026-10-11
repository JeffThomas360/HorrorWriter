// src/pages/sitemap-stories.xml.js
export const prerender = false

import { fetchLiveStoryUrls } from '../lib/sitemapQueries'
import { buildSitemapXml } from '../lib/seo'
import { absoluteUrl, storyPath } from '../lib/urls'
import { isArchive, storyUrlKey } from '../lib/storyHelpers'

export async function GET() {
  const rows = await fetchLiveStoryUrls()
  const liveRows = rows.map(r => ({
    loc: absoluteUrl(storyPath(storyUrlKey(r))),
    // A classic's created_at is the work's original date (1843…); Google discards
    // implausible lastmod values, so report when the row last changed instead.
    lastmod: isArchive(r) ? r.updated_at : r.created_at
  }))
  const xml = buildSitemapXml(liveRows)
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } })
}
