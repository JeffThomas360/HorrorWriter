import { useState } from 'react'
import { toast } from 'sonner'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import InlineModControls from '../mod/InlineModControls'
import MarkdownEditor from '../MarkdownEditor'
import { authorLabel, isTombstone } from '../../lib/storyHelpers'
import { editPost, editThread } from '../../lib/forumEditing'

/**
 * One post on a thread page, with in-place editing for its author. The
 * opening post edits the thread title too (one transaction server-side).
 * The server is the real gate — it checks authorship and bans — so hiding
 * the Edit button from others is courtesy, not security.
 */

function initials(handle) {
  if (!handle) return '??'
  return handle.split('-').map(w => w[0].toUpperCase()).slice(0, 2).join('')
}

function timeAgo(dateString) {
  if (!dateString) return ''
  const d = new Date(dateString)
  const now = new Date()
  const diff = (now - d) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}

const actionBtn = 'text-[var(--color-text-secondary)] hover:text-[var(--color-accent-crimson)] cursor-pointer'

export default function PostCard({ post, label, isOpening, thread, currentUserId, onReport, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(thread?.title ?? '')
  const [content, setContent] = useState(post.content)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const handle = post.profiles?.handle || 'unknown'
  const isAuthor = !!currentUserId && post.author_id === currentUserId
  const canEdit = isAuthor && (!isOpening || (thread?.author_id === currentUserId && !isTombstone(thread)))
  const editedAt = post.edited_at || (isOpening ? thread?.edited_at : null)
  const blank = !content.trim() || (isOpening && !title.trim())

  const startEditing = () => {
    setTitle(thread?.title ?? '')
    setContent(post.content)
    setError(null)
    setEditing(true)
  }

  const save = async () => {
    if (saving || blank) return
    setSaving(true)
    setError(null)
    try {
      if (isOpening) {
        await editThread({ threadId: thread.id, openingPostId: post.id, title: title.trim(), content: content.trim() })
      } else {
        await editPost(post.id, content.trim())
      }
      setEditing(false)
      toast.success('Saved.')
      onSaved?.()
    } catch (e) {
      // Stay in edit mode so nothing typed is lost.
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <article className="vintage-card flex flex-col gap-4">
      <div className="flex justify-between items-start border-b border-[var(--color-line)] pb-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[var(--color-bg-primary)] border border-[var(--color-line)] flex items-center justify-center font-mono text-xs text-[var(--color-text-secondary)]">
            {initials(handle)}
          </div>
          <div className="flex flex-col">
            <span className="font-mono text-xs font-bold text-[var(--color-text-primary)]">{authorLabel(post.profiles)}</span>
            <span className="font-mono text-xs text-[var(--color-text-secondary)]">
              {label ? `${label} · ` : ''}{timeAgo(post.created_at)}
              {editedAt && (
                <span title={`Edited ${new Date(editedAt).toLocaleString()}`}> · edited</span>
              )}
            </span>
          </div>
        </div>
        <div className="flex gap-3 items-center text-xs font-mono">
          {canEdit && !editing && (
            <button type="button" onClick={startEditing} className={actionBtn}>Edit</button>
          )}
          <button type="button" onClick={onReport} className={actionBtn}>Report</button>
          <InlineModControls targetType="post" targetId={post.id} currentStatus={post.mod_status} authorId={post.author_id} />
        </div>
      </div>

      {editing ? (
        <div className="flex flex-col gap-3">
          {isOpening && (
            <input
              type="text"
              aria-label="Thread title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={saving}
              className="card-surface p-2 font-serif text-lg border border-[var(--color-line-hi)] focus:border-[var(--color-bone)] outline-none"
            />
          )}
          <MarkdownEditor value={content} onChange={(e) => setContent(e.target.value)} rows={6} disabled={saving} />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={saving || blank}
              className="bg-[var(--color-accent-crimson)] text-white font-mono text-xs uppercase px-4 py-2 hover:bg-red-700 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => { setEditing(false); setError(null) }}
              disabled={saving}
              className="border border-[var(--color-line)] hover:border-white font-mono text-xs uppercase px-4 py-2 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            {error && <span role="alert" className="font-mono text-xs text-[var(--color-ember)]">{error}</span>}
          </div>
        </div>
      ) : (
        <div className="prose prose-invert font-serif text-lg leading-relaxed text-[var(--color-text-primary)]">
          <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{post.content}</ReactMarkdown>
        </div>
      )}
    </article>
  )
}
