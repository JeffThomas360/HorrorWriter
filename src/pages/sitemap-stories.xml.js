// src/pages/sitemap-stories.xml.js
export const prerender = false

import { fetchLiveStoryUrls } from '../lib/sitemapQueries'
import { buildSitemapXml } from '../lib/seo'

export async function GET() {
  const rows = await fetchLiveStoryUrls()
  const xml = buildSitemapXml(rows.map(r => ({
    loc: `https://horrorwriter.org/library/read/${r.id}`,
    lastmod: r.created_at
  })))
  return new Response(xml, { headers: { 'Content-Type': 'application/xml' } })
}
