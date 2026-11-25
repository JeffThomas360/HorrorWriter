// Where a page can be shared to. Plain links, so they work without JavaScript
// and send nothing anywhere until the visitor clicks one.
// X/Twitter was removed on purpose (#129); don't add it back here.
export function shareTargets({ url, title }) {
  const u = encodeURIComponent(url)
  const t = encodeURIComponent(title)
  return [
    { id: 'reddit', label: 'Reddit', href: `https://www.reddit.com/submit?url=${u}&title=${t}` },
    { id: 'bluesky', label: 'Bluesky', href: `https://bsky.app/intent/compose?text=${encodeURIComponent(`${title} ${url}`)}` },
  ]
}

// Reddit caps a post title at 300 characters; a prompt can run to 400.
export function promptShareTitle(body, max = 240) {
  const text = String(body ?? '').replace(/\s+/g, ' ').trim()
  const cut = text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
  return `Horror writing prompt: ${cut}`
}
