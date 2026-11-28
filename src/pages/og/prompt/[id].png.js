export const prerender = false

import { ImageResponse } from 'workers-og'
import { supabase } from '../../../supabaseClient'
import { lookupOutcome } from '../../../lib/lookup'

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// A prompt runs from 10 to 400 characters; shrink the type so the longest still fits.
function promptFontSize(length) {
  if (length <= 110) return 56
  if (length <= 220) return 44
  if (length <= 320) return 36
  return 31
}

// The share card for one Midnight Ritual prompt: the prompt itself, large.
export async function GET({ params }) {
  const { id } = params

  let prompt = null
  let outcome = 'unknown'
  try {
    if (supabase) {
      // Released prompts only. Explicit filters, not just RLS: see promptArchive.js.
      const result = await supabase
        .from('ritual_prompts')
        .select('body')
        .eq('id', id)
        .eq('status', 'scheduled')
        .lte('goes_live_at', new Date().toISOString())
        .maybeSingle()
      prompt = result.data
      outcome = lookupOutcome(result)
    }
  } catch (e) {
    console.error('Error fetching prompt for OG image:', e)
  }

  // Unknown, pending and future prompts get no card.
  if (!prompt) {
    const missing = outcome === 'missing'
    return new Response(missing ? 'Not found' : 'Unavailable', { status: missing ? 404 : 503 })
  }

  const body = prompt.body.trim()
  const html = `
    <div style="display: flex; flex-direction: column; justify-content: center; width: 1200px; height: 630px; background: #08090C; padding: 80px; font-family: sans-serif;">
      <div style="display: flex; font-size: 24px; letter-spacing: 6px; color: #19A5B8; margin-bottom: 36px;">MIDNIGHT RITUAL · HORROR WRITING PROMPT</div>
      <div style="display: flex; font-size: ${promptFontSize(body.length)}px; color: #E5E1D8; line-height: 1.3; max-height: 390px; overflow: hidden;">${escapeHtml(body)}</div>
      <div style="display: flex; align-items: center; margin-top: 40px;">
        <div style="display: flex; width: 60px; height: 6px; background: #C8102E; margin-right: 24px;"></div>
        <div style="display: flex; font-size: 28px; color: #A3A39C;">horrorwriter.org</div>
      </div>
    </div>
  `

  return new ImageResponse(html, {
    width: 1200,
    height: 630,
    headers: { 'Cache-Control': 'public, max-age=86400' }
  })
}
