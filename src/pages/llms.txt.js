import { SITE_DESCRIPTION } from '../lib/seo'
import { absoluteUrl } from '../lib/urls'
import { FEED_PATH } from '../lib/feed'

// A plain-text map of the site for AI assistants (llmstxt.org). Built from the
// site's existing description and page names, so it adds no new copy to keep in
// step. Whether assistants read it is unproven; it costs one small static file.
const PAGES = [
  ['The Library', '/library/'],
  ['The Crypt', '/forum/'],
  ['Writing Prompts', '/prompts/'],
  ['Needs a First Reader', '/first-reader/'],
  ['House Rules', '/rules/'],
  ['Help', '/help/'],
  ['Transparency Log', '/transparency/'],
]

export function GET() {
  const lines = [
    '# Horror Writer',
    '',
    `> ${SITE_DESCRIPTION}`,
    '',
    '## Pages',
    '',
    ...PAGES.map(([name, path]) => `- [${name}](${absoluteUrl(path)})`),
    '',
    '## Feeds',
    '',
    `- [RSS](${absoluteUrl(FEED_PATH)})`,
    `- [Sitemap](${absoluteUrl('/sitemap-index.xml')})`,
    '',
  ]
  return new Response(lines.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
