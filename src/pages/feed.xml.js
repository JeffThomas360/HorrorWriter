export const prerender = false

import { fetchPromptArchive } from '../lib/promptArchive'
import { fetchFeedStories, buildFeedItems, buildRssXml } from '../lib/feed'
import { isPlaywrightTest } from '../lib/testMode'

// RSS: released prompts and newly published stories, newest first.
export async function GET() {
  let prompts = []
  let stories = []
  try {
    if (!isPlaywrightTest()) {
      [prompts, stories] = await Promise.all([fetchPromptArchive(), fetchFeedStories()])
    }
  } catch (e) {
    console.error('Error building the feed:', e)
  }
  return new Response(buildRssXml(buildFeedItems(prompts, stories)), {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=900',
    },
  })
}
