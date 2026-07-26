// src/pages/sitemap-threads.xml.js
export const prerender = false

import { fetchLiveThreadUrls } from '../lib/sitemapQueries'
import { buildSitemapXml } from '../lib/seo'

export async function GET() {
  const rows = await fetchLiveThreadUrls()
  const xml = buildSitemapXml(rows.map(r => ({
    loc: `https://horrorwriter.org/forum/thread/${r.id}`,
    lastmod: r.updated_at
  })))
  return new Response(xml, { headers: { 'Content-Type': 'application/xml' } })
}
