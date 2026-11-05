import { supabase } from '../supabaseClient'
import { bytesToBase64, byteaToBytes } from './ritualKeep'

/**
 * Delete forever / Keep it for Library stories: the browser side of
 * 20261106000000_story_vault.sql. Keep it encrypts the story (with its critiques and
 * series place) here, with the writer's recovery code (seal.js, passed in as `sealApi`
 * so the wordlist chunk stays lazy). The database only ever stores ciphertext.
 */

export function keepStoryErrorMessage(error) {
  switch (error?.code) {
    case 'P0002': return 'This story could not be found.'
    case 'HW031': return 'Your vault is full (50 stories). Delete one from your profile to keep another.'
    case 'HW032': return 'This story is too large to keep.'
    case 'HW033': return 'Something new arrived on this story while it was being kept. Nothing was changed. Please try again.'
    default: return 'Nothing was kept or deleted. Please try again.'
  }
}

export function restoreStoryErrorMessage(error) {
  switch (error?.code) {
    case 'P0002': return 'This kept story could not be found.'
    case 'HW034': return 'You can restore this once your suspension ends. It stays safe in your vault until then.'
    case 'HW035':
    case 'HW036': return "This kept story doesn't match what was locked away, so it can't be restored."
    case 'HW037': return 'This story is already back in the Library.'
    default: return 'Nothing was restored. Your kept story is safe; please try again.'
  }
}

async function prepareAndCommit(bookId, code, sealApi) {
  const { data: prep, error: prepError } = await supabase.rpc('story_vault_prepare', { p_book_id: bookId })
  if (prepError) throw prepError
  // The seal travels inside the encrypted bundle; restore checks it before anything goes back.
  const bundle = await sealApi.sealWriting({ ...prep.payload, seal: prep.seal }, code)
  const { data: vaultId, error } = await supabase.rpc('story_vault_commit', {
    p_book_id: bookId,
    p_nonce: prep.nonce,
    p_key_version: prep.key_version,
    p_seal: prep.seal,
    p_bundle: bytesToBase64(bundle),
  })
  if (error) throw error
  return vaultId
}

/**
 * Locks the story away and removes it from the Library. A critique landing between prepare
 * and commit makes commit refuse (HW033); that is retried once, since nothing was changed.
 */
export async function keepStory({ bookId, code, sealApi }) {
  if (!supabase) throw new Error(keepStoryErrorMessage(null))
  try {
    try {
      return await prepareAndCommit(bookId, code, sealApi)
    } catch (err) {
      if (err?.code !== 'HW033') throw err
      return await prepareAndCommit(bookId, code, sealApi)
    }
  } catch (err) {
    throw new Error(keepStoryErrorMessage(err))
  }
}

/** Deletes the story for good, with its critiques and series place. */
export async function deleteStoryForever(bookId) {
  if (!supabase) throw new Error('Could not delete this story. Please try again.')
  const { data, error } = await supabase.from('books').delete().eq('id', bookId).select('id')
  if (error || !data?.length) throw new Error('Could not delete this story. Please try again.')
}

/** The signed-in writer's kept stories, newest first. Titles are inside the bundle, so: dates only. */
export async function listKeptStories() {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('story_vault')
    .select('id, created_at')
    .order('created_at', { ascending: false })
  if (error) throw new Error('Could not load your kept stories.')
  return data ?? []
}

/**
 * Opens the bundle with the code and puts everything back. Throws Error('wrong-code') /
 * Error('corrupt-bundle') before anything is sent, or a user-facing message after.
 * Resolves to { title, result } where result is the restore RPC's answer.
 */
export async function restoreKeptStory({ vaultId, code, sealApi }) {
  if (!supabase) throw new Error(restoreStoryErrorMessage(null))
  const { data: row, error } = await supabase.from('story_vault').select('bundle').eq('id', vaultId).maybeSingle()
  if (error) throw new Error(restoreStoryErrorMessage(null))
  if (!row) throw new Error(restoreStoryErrorMessage({ code: 'P0002' }))
  const payload = await sealApi.unsealWriting(byteaToBytes(row.bundle), code)
  const { data, error: rpcError } = await supabase.rpc('story_vault_restore', { p_vault_id: vaultId, p_payload: payload })
  if (rpcError) throw new Error(restoreStoryErrorMessage(rpcError))
  return { title: payload?.story?.title ?? null, result: data }
}

/** Permanently removes a kept story. No code needed: it is the owner's own row. */
export async function deleteKeptStory(vaultId) {
  if (!supabase) throw new Error('Could not delete this kept story.')
  const { data, error } = await supabase.from('story_vault').delete().eq('id', vaultId).select('id')
  if (error || !data?.length) throw new Error('Could not delete this kept story.')
}
