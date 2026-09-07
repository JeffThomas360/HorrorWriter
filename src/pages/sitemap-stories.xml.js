// src/pages/sitemap-stories.xml.js
export const prerender = false

import { fetchLiveStoryUrls } from '../lib/sitemapQueries'
import { buildSitemapXml } from '../lib/seo'
import { ARCHIVE_STORIES } from '../lib/seedArchives'

export async function GET() {
  const rows = await fetchLiveStoryUrls()
  const archiveRows = ARCHIVE_STORIES.map(a => ({
    loc: `https://horrorwriter.org/library/read/${a.id}`,
    lastmod: a.created_at
  }))
  const liveRows = rows.map(r => ({
    loc: `https://horrorwriter.org/library/read/${r.id}`,
    lastmod: r.created_at
  }))
  const xml = buildSitemapXml([...archiveRows, ...liveRows])
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } })
}
