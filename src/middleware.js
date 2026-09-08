// Redirect www.horrorwriter.org -> horrorwriter.org (301).
// The Worker serves both hosts; canonical tags already point at the apex, but Google had
// indexed a www URL, so make the redirect explicit. Kept host-agnostic so previews and
// localhost are untouched.
export function onRequest(context, next) {
  const url = new URL(context.request.url)
  if (url.hostname.startsWith('www.')) {
    url.hostname = url.hostname.slice(4)
    return Response.redirect(url.toString(), 301)
  }
  return next()
}
