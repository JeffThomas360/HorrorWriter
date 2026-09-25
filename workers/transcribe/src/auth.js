// Transcription runs a paid Workers AI model, so only signed-in HorrorWriter
// users may call it. The CORS allowlist is not a gate: it only stops browsers,
// not curl. The browser sends the user's Supabase access token, and Supabase
// confirms it here. Returns the user id, or null for anything else (fails closed).
export async function verifySupabaseUser(authHeader, env, fetchImpl = fetch) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null
  if (!authHeader.slice('Bearer '.length).trim()) return null
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null

  try {
    const res = await fetchImpl(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: authHeader, apikey: env.SUPABASE_ANON_KEY },
    })
    if (!res.ok) return null
    const user = await res.json()
    return user?.id ?? null
  } catch {
    return null
  }
}
