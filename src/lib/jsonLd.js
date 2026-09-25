// JSON-LD goes into <script type="application/ld+json"> via set:html, and it
// carries user text (titles, display names). JSON.stringify leaves < > & and
// U+2028/U+2029 alone, so escape them as \uXXXX: still valid JSON, and the
// browser can no longer see </script> or <!-- inside the block.
const UNSAFE = /[<>&\u2028\u2029]/g

export function serializeJsonLd(data) {
  return JSON.stringify(data).replace(
    UNSAFE,
    (ch) => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0'),
  )
}
