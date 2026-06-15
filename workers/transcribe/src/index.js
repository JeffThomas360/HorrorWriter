import { Buffer } from 'node:buffer'

const MAX_BYTES = 4 * 1024 * 1024

const ALLOWED_ORIGINS = [
  'https://horrorwriter.org',
  'https://www.horrorwriter.org',
  'https://horrorwriter.pages.dev',
  'http://localhost:5173',
  'http://localhost:4173',
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

    // Top-level guard: NOTHING leaves this worker without CORS headers. A bare
    // throw or early platform error would otherwise reach the browser as an
    // opaque "NetworkError" that masks the real cause (this bit us hard).
    try {
      if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders(origin) })
      }
      if (req.method !== 'POST') {
        return json({ error: 'Method not allowed' }, 405, origin)
      }

      let formData
      try {
        formData = await req.formData()
      } catch {
        return json({ error: 'Invalid request body' }, 400, origin)
      }

      const audioFile = formData.get('audio')
      if (!audioFile || typeof audioFile === 'string') {
        return json({ error: 'No audio file provided' }, 400, origin)
      }

      const cl = Number(req.headers.get('content-length'))
      if (!isNaN(cl) && cl > MAX_BYTES) {
        return json({ error: 'File exceeds the 4 MB limit.' }, 413, origin)
      }

      const audioBuffer = await audioFile.arrayBuffer()
      if (audioBuffer.byteLength > MAX_BYTES) {
        return json({ error: 'File exceeds the 4 MB limit.' }, 413, origin)
      }
      if (audioBuffer.byteLength === 0) {
        return json({ error: 'The recording was empty — please try again.' }, 400, origin)
      }

      if (!env.AI) {
        return json({ error: 'AI binding not configured.' }, 503, origin)
      }

      // whisper-large-v3-turbo takes base64-encoded audio. base64 is cheap to
      // build from the buffer; the older @cf/openai/whisper wanted the bytes
      // spread into a plain array ([...Uint8Array]), which for a multi-MB clip
      // allocates millions of JS numbers and can blow the isolate's CPU/memory
      // limit — crashing it before it can respond (the CORS-less NetworkError).
      const base64 = Buffer.from(audioBuffer).toString('base64')

      const result = await env.AI.run('@cf/openai/whisper-large-v3-turbo', {
        audio: base64,
        language: 'en',
      })

      return json({ text: result?.text ?? '' }, 200, origin)
    } catch (err) {
      // Surfaces in `wrangler tail` / Workers Logs (observability enabled).
      console.error('[transcribe]', err?.stack || String(err))
      return json(
        { error: 'Transcription failed — try a shorter clip or cleaner audio.' },
        500,
        origin,
      )
    }
  },
}
