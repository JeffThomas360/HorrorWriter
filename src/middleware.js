import { withSecurityHeaders } from './lib/securityHeaders.js'

// Built from the same env the client uses, so local dev (local Supabase stack) gets a CSP that
// allows it, and production gets the production project.
const URLS = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  transcribeUrl: import.meta.env.VITE_TRANSCRIBE_URL,
}

// Redirect www.horrorwriter.org -> horrorwriter.org (301).
// The Worker serves both hosts; canonical tags already point at the apex, but Google had
// indexed a www URL, so make the redirect explicit. Kept host-agnostic so previews and
// localhost are untouched.
//
// Every other response gets the security headers: public/_headers never reaches responses the
// Worker renders (see src/lib/securityHeaders.js).
export async function onRequest(context, next) {
  const url = new URL(context.request.url)
  if (url.hostname.startsWith('www.')) {
    url.hostname = url.hostname.slice(4)
    return Response.redirect(url.toString(), 301)
  }
  const response = await next()
  return response instanceof Response ? withSecurityHeaders(response, URLS) : response
}
