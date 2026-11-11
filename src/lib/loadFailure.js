/**
 * Tell "this row does not exist" apart from "we couldn't ask".
 *
 * A page that already holds server-rendered content must not swap it for
 * "not found" because one background re-read failed: a dropped connection
 * would tell a writer their story is gone. Only a definite answer from the
 * database counts as missing.
 *
 * PGRST116  .single() matched no row (deleted, or hidden from this reader by RLS).
 * 22P02     the id isn't a valid uuid, so no row can match.
 */
export function isMissingRow(error) {
  return error?.code === 'PGRST116' || error?.code === '22P02'
}
