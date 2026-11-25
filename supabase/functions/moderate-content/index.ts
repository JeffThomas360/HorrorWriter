// supabase/functions/moderate-content/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { judge } from '../_shared/typesafe.ts'
import { questionsFor, buildState, parseAnswers, decide, parseMachineWritten, machineWrittenNote } from '../_shared/screening.ts'

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

    // The client calls this right after inserting its own content. Only that
    // author may trigger a screen: the anon key passes verify_jwt, so without
    // this anyone could replay any targetId, spending a model call and writing
    // a mod_actions row each time.
    // TODO: trigger screening from the database on insert instead, so an
    // author can't skip it by never calling this.
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } }
    )
    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }

    // Service-role client: needed to read content regardless of RLS and to call
    // apply_automated_mod_status(), which is service-role-only by design.
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: row, error: fetchError } = await supabaseAdmin
      .from(mapping.table)
      .select(`${mapping.column}, author_id, mod_status`)
      .eq('id', targetId)
      .single()
    // Same response for "missing" and "not yours", so it can't be used to probe ids.
    if (fetchError || !row || row.author_id !== user.id) throw new Error('Target content not found')

    // Screen only content that is still live. Anything already in screening or
    // hidden has had a decision, possibly a moderator's, which a replay must
    // not overwrite.
    if (row.mod_status !== 'live') {
      return new Response(JSON.stringify({ flagged: false, reason: 'already reviewed' }), { headers: corsHeaders })
    }

    const content = row[mapping.column]
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return new Response(JSON.stringify({ flagged: false, reason: 'empty content' }), { headers: corsHeaders })
    }

    // ── One TypeSafe call: four safety judgments, each with its own threshold ──
    // See _shared/screening.ts. Fails closed: if we can't get a judgment, a person looks.
    // A story is also asked whether it reads as raw chatbot output. That answer is
    // handled apart from the four: it can only file a quiet note for staff.
    const screen = (reason: string) =>
      supabaseAdmin.rpc('apply_automated_mod_status', {
        p_target_type: targetType, p_target_id: targetId, p_status: 'screening', p_reason: reason,
      })

    let decision
    let raw: unknown
    try {
      raw = await judge({
        apiKey: Deno.env.get('TYPESAFE_API_KEY') ?? '',
        state: buildState(targetType, content),
        questions: questionsFor(targetType),
      })
      decision = decide(parseAnswers(raw))
    } catch (err: any) {
      console.error('[moderate-content] TypeSafe judgment failed — screening for human review', err)
      const { error } = await screen('Automated screening unavailable; held for human review')
      if (error) throw error
      return new Response(JSON.stringify({ flagged: true, confirmed: null }), { headers: corsHeaders })
    }

    // Apply the safety decision first, so nothing below can delay a screen.
    const { error: screenError } = decision.action === 'pass'
      ? { error: null }
      : await screen(decision.reason)

    // Stories only: what the machine thought, kept for staff. The score is saved for
    // every story; the quiet note is filed only over the threshold. Neither changes
    // the story: no mod_status change, no word to the writer. Nothing here may fail
    // the request or change its answer, so every way this can go wrong (an RPC not
    // deployed yet, the database refusing) is only logged.
    if (targetType === 'story') {
      const score = parseMachineWritten(raw)
      if (score !== null) {
        try {
          const { error } = await supabaseAdmin.rpc('record_machine_score', {
            p_story_id: targetId, p_score: score,
          })
          if (error) console.error('[moderate-content] could not save machine score', error)
        } catch (err) {
          console.error('[moderate-content] could not save machine score', err)
        }
      }
      const note = machineWrittenNote(score)
      if (note) {
        try {
          const { error } = await supabaseAdmin.rpc('file_automated_report', {
            p_target_type: 'story', p_target_id: targetId, p_category: 'ai_written', p_details: note,
          })
          if (error) console.error('[moderate-content] could not file ai_written note', error)
        } catch (err) {
          console.error('[moderate-content] could not file ai_written note', err)
        }
      }
    }

    if (screenError) throw screenError
    if (decision.action === 'pass') {
      return new Response(JSON.stringify({ flagged: false }), { headers: corsHeaders })
    }
    return new Response(
      JSON.stringify({ flagged: true, confirmed: true, worstTierCandidate: decision.worstTier }),
      { headers: corsHeaders }
    )
  } catch (err: any) {
    console.error('[moderate-content] error', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 400, headers: corsHeaders })
  }
})
