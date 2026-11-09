import VhsSleeveCard from './VhsSleeveCard'

// The four covers VhsSleeveCard draws; `cover` is the only look the writer picks
// that is saved. Stickers (New / Vol N / Archive) are set by the card itself.
export const COVER_CHOICES = [
  { id: 'blood', label: 'Blood Cut' },
  { id: 'cyan', label: 'Channel 13' },
  { id: 'bone', label: 'Grimoire Bone' },
  { id: 'void', label: 'Midnight Void' },
]

/**
 * The publish form's live preview: the real Library card, fed from the form,
 * so what the writer sees is what readers will see on the shelf.
 *
 * series: { id, title, position } with a 0-based position, or null.
 */
export default function StoryCardPreview({
  storyId, createdAt, critiqueCount = 0,
  title = '', lede = '', content = '', cover = 'blood', handle, series = null,
  onCoverChange,
}) {
  const story = {
    id: storyId || 'preview',
    title: title.trim() || 'Your title',
    lede: lede.trim() || null,
    cover,
    content,
    created_at: createdAt || new Date().toISOString(),
    comments_count: critiqueCount,
    profiles: { handle: handle || 'you' },
    series_books: series ? [{ sort_order: series.position, series: { id: series.id, title: series.title } }] : [],
  }

  return (
    <div className="flex flex-col gap-5 p-5 bg-[var(--color-surface)] border border-[var(--color-line)]">
      <div className="border-b border-[var(--color-line)] pb-3">
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-upside)]">Live preview</span>
        <p className="font-serif italic text-xs text-[var(--color-text-secondary)] mt-1">
          Your story&rsquo;s card, as it will sit on the Library shelf.
        </p>
      </div>

      <div className="w-[220px] max-w-full mx-auto">
        <VhsSleeveCard story={story} preview />
      </div>

      <fieldset className="border-t border-[var(--color-line)] pt-4">
        <legend className="block font-mono text-[11px] uppercase tracking-wider text-[var(--color-text-secondary)] mb-2">
          Cover colour
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {COVER_CHOICES.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={cover === c.id}
              onClick={() => onCoverChange?.(c.id)}
              className={`px-2.5 py-1 font-mono text-xs uppercase border transition-colors cursor-pointer ${
                cover === c.id
                  ? 'bg-[var(--color-blood)] text-white border-[var(--color-blood)]'
                  : 'bg-[var(--color-void)] text-[var(--color-text-secondary)] border-[var(--color-line)] hover:border-white'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </fieldset>
    </div>
  )
}
