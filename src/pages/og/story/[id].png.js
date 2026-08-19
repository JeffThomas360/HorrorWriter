export const prerender = false

import { ImageResponse } from 'workers-og'
import { supabase } from '../../../supabaseClient'

// Mirrors PublishStory.jsx's COVER_OPTIONS and the design tokens in global.css
const COVER_COLORS = {
  blood: '#C8102E',
  cyan: '#19A5B8',
  bone: '#E5E1D8'
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function GET({ params }) {
  const { id } = params

  let book = null
  try {
    if (supabase) {
      const { data } = await supabase
        .from('books')
        .select('title, cover, profiles(handle)')
        .eq('id', id)
        .single()
      book = data
    }
  } catch (e) {
    console.error('Error fetching book details for OG image:', e)
  }

  const title = escapeHtml(book?.title || 'A story on Horror Writer')
  const author = escapeHtml(book?.profiles?.handle ? `@${book.profiles.handle}` : 'Horror Writer')
  const accent = COVER_COLORS[book?.cover] || COVER_COLORS.blood

  const html = `
    <div style="display: flex; flex-direction: column; justify-content: center; width: 1200px; height: 630px; background: #08090C; padding: 80px; font-family: sans-serif;">
      <div style="display: flex; width: 60px; height: 6px; background: ${accent}; margin-bottom: 40px;"></div>
      <div style="display: flex; font-size: 56px; color: #E5E1D8; line-height: 1.2; max-height: 380px; overflow: hidden;">${title}</div>
      <div style="display: flex; font-size: 28px; color: #A3A39C; margin-top: 40px;">${author} · Horror Writer</div>
    </div>
  `

  return new ImageResponse(html, {
    width: 1200,
    height: 630,
    headers: { 'Cache-Control': 'public, max-age=86400' }
  })
}
