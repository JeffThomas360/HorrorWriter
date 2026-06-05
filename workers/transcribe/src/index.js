const ALLOWED_ORIGINS = [
  'https://horrorwriter.org',
  'https://www.horrorwriter.org',
]

function corsHeaders(origin) {
  const ok =
    ALLOWED_ORIGINS.includes(origin) ||
    (typeof origin === 'string' && origin.endsWith('.horrorwriter.pages.dev'))
  return {
    'Access-Control-Allow-Origin': ok ? origin : 'https://horrorwriter.org',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  })
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') ?? ''

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) })
    }

    if (req.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405, origin)
    }

    return json({ text: 'scaffold ok' }, 200, origin)
  },
}
