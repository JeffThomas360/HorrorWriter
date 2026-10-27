import { supabase } from '../supabaseClient'
import { buildVaultPayload } from './ritualVault'

/**
 * "Keep it" for Midnight Ritual entries: the browser side of the vault RPCs in
 * 20261024000000_ritual_vault.sql. The payload is encrypted here with the writer's
 * recovery code (seal.js, passed in as `sealApi` so the wordlist chunk stays lazy);
 * the database only ever stores the ciphertext.
 */

const BASE64_CHUNK = 32 * 1024

export function bytesToBase64(bytes) {
  let binary = ''
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + BASE64_CHUNK))
  }
  return btoa(binary)
}

/** PostgREST returns bytea as "\x0a1b…". Throws on anything else (treated as a damaged bundle). */
export function byteaToBytes(value) {
  const hex = typeof value === 'string' && value.startsWith('\\x') ? value.slice(2) : null
  if (hex === null || hex.length % 2 !== 0 || /[^0-9a-f]/i.test(hex)) throw new Error('corrupt-bundle')
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return bytes
}

export function keepErrorMessage(error) {
  switch (error?.code) {
    case 'P0002': return 'This entry could not be found.'
    case 'HW031': return 'Your vault is full (50 entries). Delete one from your profile to keep another.'
    case 'HW032': return 'This entry is too large to keep.'
    case 'HW033': return 'Something new arrived on this entry while it was being kept. Nothing was changed. Please try again.'
    default: return 'Nothing was kept or deleted. Please try again.'
  }
}

export function restoreErrorMessage(error) {
  switch (error?.code) {
    case 'P0002': return 'This kept entry could not be found.'
    case 'HW034': return 'You can restore this once your suspension ends. It stays safe in your vault until then.'
    case 'HW035':
    case 'HW036': return "This kept entry doesn't match what was locked away, so it can't be restored."
    case 'HW037': return 'This entry is already back in its thread.'
    case 'HW038': return 'The prompt this entry answered no longer exists.'
    default: return 'Nothing was restored. Your kept entry is safe; please try again.'
  }
}

async function prepareAndCommit(postId, code, sealApi) {
  const { data: prep, error: prepError } = await supabase.rpc('ritual_vault_prepare', { p_post_id: postId })
  if (prepError) throw prepError
  const payload = buildVaultPayload({
    thread: prep.thread,
    entry: prep.entry,
    posts: prep.posts,
    feedback: prep.feedback,
    revision: prep.revision,
    seals: prep.seals,
  })
  const bundle = await sealApi.sealWriting(payload, code)
  const { data: vaultId, error } = await supabase.rpc('ritual_vault_commit', {
    p_post_id: postId,
    p_nonce: prep.nonce,
    p_key_version: prep.key_version,
    p_snapshot: prep.snapshot,
    p_bundle: bytesToBase64(bundle),
  })
  if (error) throw error
  return vaultId
}

/**
 * Locks the entry away and removes it from its thread. Resolves to { vaultId, threadGone }.
 * A critique landing between prepare and commit makes commit refuse (HW033); that is retried
 * once with the same code, since nothing was changed.
 */
export async function keepRitualEntry({ postId, threadId, code, sealApi }) {
  if (!supabase) throw new Error(keepErrorMessage(null))
  let vaultId
  try {
    try {
      vaultId = await prepareAndCommit(postId, code, sealApi)
    } catch (err) {
      if (err?.code !== 'HW033') throw err
      vaultId = await prepareAndCommit(postId, code, sealApi)
    }
  } catch (err) {
    throw new Error(keepErrorMessage(err))
  }
  const { data: thread } = await supabase.from('threads').select('id').eq('id', threadId).maybeSingle()
  return { vaultId, threadGone: !thread }
}

/** The signed-in writer's kept entries, newest first, with the prompt each answered. */
export async function listKeptEntries() {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('ritual_vault')
    .select('id, prompt_id, created_at')
    .order('created_at', { ascending: false })
  if (error) throw new Error('Could not load your kept entries.')
  const promptIds = [...new Set((data ?? []).map((row) => row.prompt_id))]
  let prompts = {}
  if (promptIds.length) {
    const { data: rows } = await supabase.from('ritual_prompts').select('id, body').in('id', promptIds)
    prompts = Object.fromEntries((rows ?? []).map((p) => [p.id, p.body]))
  }
  return (data ?? []).map((row) => ({ ...row, prompt_body: prompts[row.prompt_id] ?? null }))
}

/**
 * Opens the bundle with the code and puts everything back. Throws Error('wrong-code') /
 * Error('corrupt-bundle') before anything is sent, or a user-facing message after.
 * Resolves to the restore RPC's result ({ thread_id, entry_id, critiques_restored, … }).
 */
export async function restoreKeptEntry({ vaultId, code, sealApi }) {
  if (!supabase) throw new Error(restoreErrorMessage(null))
  const { data: row, error } = await supabase.from('ritual_vault').select('bundle').eq('id', vaultId).maybeSingle()
  if (error) throw new Error(restoreErrorMessage(null))
  if (!row) throw new Error(restoreErrorMessage({ code: 'P0002' }))
  const payload = await sealApi.unsealWriting(byteaToBytes(row.bundle), code)
  const { data, error: rpcError } = await supabase.rpc('ritual_vault_restore', { p_vault_id: vaultId, p_payload: payload })
  if (rpcError) throw new Error(restoreErrorMessage(rpcError))
  return data
}

/** Permanently removes a kept entry. No code needed: it is the owner's own row. */
export async function deleteKeptEntry(vaultId) {
  if (!supabase) throw new Error('Could not delete this kept entry.')
  const { data, error } = await supabase.from('ritual_vault').delete().eq('id', vaultId).select('id')
  if (error || !data?.length) throw new Error('Could not delete this kept entry.')
}
