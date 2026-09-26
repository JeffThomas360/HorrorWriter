// src/pages/sitemap-profiles.xml.js
export const prerender = false

import { fetchPublicProfileHandles } from '../lib/sitemapQueries'
import { buildSitemapXml } from '../lib/seo'
import { absoluteUrl, profilePath } from '../lib/urls'

export async function GET() {
  const rows = await fetchPublicProfileHandles()
  const xml = buildSitemapXml(rows.map(r => ({
    loc: absoluteUrl(profilePath(r.handle)),
    lastmod: r.updated_at
  })))
  return new Response(xml, { headers: { 'Content-Type': 'application/xml' } })
}
