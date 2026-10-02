import { supabase } from '../supabaseClient'

/**
 * Editing your own forum posts. The database functions in
 * 20261001000000_forum_editing.sql check that you wrote the post, refuse
 * banned members and change only the text and edited_at — a hidden post stays
 * hidden. After a save the edited text is re-screened exactly as a new post is
 * (moderate-content skips anything that isn't live).
 */

const MESSAGES = {
  banned: "Your account is suspended, so you can't edit posts right now.",
  not_found: "That post no longer exists, or isn't yours to edit.",
  empty: "A post can't be empty.",
  not_signed_in: 'Please sign in to edit.',
}

export function forumEditErrorMessage(error) {
  if (!error) return 'Something went wrong.'
  return MESSAGES[error.message] ?? error.message ?? 'Something went wrong.'
}

function need() {
  if (!supabase) throw new Error('Supabase not configured')
  return supabase
}

// Fire-and-forget, like CreateThread and ThreadView: a screening failure must
// never fail a save the member has already made.
function rescreen(targetType, targetId) {
  supabase.functions.invoke('moderate-content', { body: { targetType, targetId } }).catch(console.error)
}

export async function editPost(postId, content) {
  const { error } = await need().rpc('edit_forum_post', { p_post_id: postId, p_content: content })
  if (error) throw new Error(forumEditErrorMessage(error))
  rescreen('post', postId)
}

export async function editThread({ threadId, openingPostId, title, content }) {
  const { error } = await need().rpc('edit_forum_thread', { p_thread_id: threadId, p_title: title, p_content: content })
  if (error) throw new Error(forumEditErrorMessage(error))
  rescreen('thread', threadId)
  if (openingPostId) rescreen('post', openingPostId)
}

/**
 * Whether a post on a thread page is the thread's opening post. The first post
 * shown is only the opening post if the thread's author wrote it: after the
 * author erases their account (a tombstone, author_id null) or deletes their
 * opening post, the first remaining post is somebody's reply, and its author
 * must still be able to edit it as one.
 */
export function isOpeningPost(index, post, thread) {
  return index === 0 && !!thread?.author_id && post?.author_id === thread.author_id
}
