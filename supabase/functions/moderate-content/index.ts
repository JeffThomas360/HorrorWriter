// supabase/functions/moderate-content/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Maps our target_type vocabulary to the table/content-column it lives in.
const TARGET_TABLE: Record<string, { table: string; column: string }> = {
  story: { table: 'books', column: 'content' },
  critique: { table: 'book_comments', column: 'content' },
  thread: { table: 'threads', column: 'title' },
  post: { table: 'posts', column: 'content' },
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { targetType, targetId } = await req.json()
    if (!targetType || !targetId) throw new Error('Missing targetType or targetId')
    const mapping = TARGET_TABLE[targetType]
    if (!mapping) throw new Error(`Unknown targetType: ${targetType}`)

    // Service-role client: this function needs to read content regardless of
    // RLS (it runs unauthenticated, right after insert) and needs to call
    // apply_automated_mod_status(), which is service-role-only by design.
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: row, error: fetchError } = await supabaseAdmin
      .from(mapping.table)
      .select(mapping.column)
      .eq('id', targetId)
      .single()
    if (fetchError || !row) throw new Error('Target content not found')

    const content = row[mapping.column]
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return new Response(JSON.stringify({ flagged: false, reason: 'empty content' }), { headers: corsHeaders })
    }

    // ── Stage 1: OpenAI Moderation endpoint (free, runs on everything) ──
    const openaiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiKey) {
      console.error('[moderate-content] OPENAI_API_KEY not set — skipping stage 1')
      return new Response(JSON.stringify({ flagged: false, reason: 'stage 1 unavailable' }), { headers: corsHeaders })
    }

    const modRes = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
      body: JSON.stringify({ model: 'omni-moderation-latest', input: content }),
    })
    if (!modRes.ok) {
      console.error('[moderate-content] OpenAI moderation call failed', await modRes.text())
      return new Response(JSON.stringify({ flagged: false, reason: 'stage 1 error' }), { headers: corsHeaders })
    }
    const modJson = await modRes.json()
    const result = modJson.results?.[0]
    if (!result?.flagged) {
      return new Response(JSON.stringify({ flagged: false }), { headers: corsHeaders })
    }

    const flaggedCategories = Object.entries(result.categories ?? {})
      .filter(([, v]) => v)
      .map(([k]) => k)
    // OpenAI's closest taxonomy match to CSAM-adjacent content.
    const isWorstTierCandidate = flaggedCategories.includes('sexual/minors')

    // ── Stage 2: Claude Haiku 4.5 confirms or dismisses the flag ────────
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) {
      console.error('[moderate-content] ANTHROPIC_API_KEY not set — cannot confirm stage 1 flag; screening conservatively')
      await supabaseAdmin.rpc('apply_automated_mod_status', {
        p_target_type: targetType, p_target_id: targetId, p_status: 'screening',
        p_reason: `Automated pre-screening: flagged by stage 1 (${flaggedCategories.join(', ')}), stage 2 unavailable`,
      })
      return new Response(JSON.stringify({ flagged: true, confirmed: null }), { headers: corsHeaders })
    }

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 256,
        output_config: {
          format: {
            type: 'json_schema',
            schema: {
              type: 'object',
              properties: {
                confirmed: { type: 'boolean', description: 'true if this content genuinely violates community guidelines around harassment, hate speech, or sexual content involving minors' },
                explanation: { type: 'string' },
              },
              required: ['confirmed', 'explanation'],
              additionalProperties: false,
            },
          },
        },
        messages: [{
          role: 'user',
          content: `A content-safety classifier flagged the following user-submitted text for these categories: ${flaggedCategories.join(', ')}.\n\nText:\n"""\n${content}\n"""\n\nConfirm whether this genuinely violates community guidelines (harassment, hate speech, or sexual content involving minors), or whether it's a false positive (e.g. horror-genre fiction describing violence, which is expected content on this site and not itself a violation). This is a horror-writing community — dark, violent, and disturbing *fictional* content is normal and should not be confirmed on that basis alone.`,
        }],
      }),
    })
    if (!claudeRes.ok) {
      console.error('[moderate-content] Claude confirmation call failed', await claudeRes.text())
      await supabaseAdmin.rpc('apply_automated_mod_status', {
        p_target_type: targetType, p_target_id: targetId, p_status: 'screening',
        p_reason: `Automated pre-screening: flagged by stage 1 (${flaggedCategories.join(', ')}), stage 2 call failed`,
      })
      return new Response(JSON.stringify({ flagged: true, confirmed: null }), { headers: corsHeaders })
    }
    const claudeJson = await claudeRes.json()
    const parsed = JSON.parse(claudeJson.content?.[0]?.text ?? '{}')

    if (!parsed.confirmed) {
      return new Response(JSON.stringify({ flagged: true, confirmed: false }), { headers: corsHeaders })
    }

    const reasonPrefix = isWorstTierCandidate ? '[URGENT — WORST TIER] ' : ''
    await supabaseAdmin.rpc('apply_automated_mod_status', {
      p_target_type: targetType,
      p_target_id: targetId,
      p_status: 'screening',
      p_reason: `${reasonPrefix}Automated pre-screening confirmed: ${parsed.explanation}`,
    })

    return new Response(JSON.stringify({ flagged: true, confirmed: true, worstTierCandidate: isWorstTierCandidate }), { headers: corsHeaders })
  } catch (err: any) {
    console.error('[moderate-content] error', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 400, headers: corsHeaders })
  }
})
