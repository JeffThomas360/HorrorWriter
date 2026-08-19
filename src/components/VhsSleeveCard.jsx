function postedAgo(dateString) {
  if (!dateString) return null
  const d = new Date(dateString)
  const now = new Date()
  const diffDays = Math.floor((now - d) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 30) return `${diffDays}d ago`
  const diffMonths = Math.floor(diffDays / 30)
  if (diffMonths < 12) return `${diffMonths}mo ago`
  return `${Math.floor(diffMonths / 12)}y ago`
}

export default function VhsSleeveCard({ story }) {
  if (!story) return null

  const seriesLink = Array.isArray(story.series_books) && story.series_books.length > 0 ? story.series_books[0] : null
  const isSeries = Boolean(seriesLink?.series)
  const seriesInfo = isSeries ? {
    title: seriesLink.series.title,
    sort_order: seriesLink.sort_order || 1
  } : null

  const handle = story.profiles?.handle || 'unknown'
  const critiqueCount = story.comments_count || 0
  const isExample = Boolean(story.badge || story.is_example)

  return (
    <a
      href={`/library/read/${story.id}`}
      className="group relative flex flex-col w-full aspect-[4/5] bg-[var(--color-surface)] border border-[var(--color-line)] hover:border-[var(--color-line-hi)] transition-all duration-200 hover:-translate-y-1 overflow-hidden shadow-md"
    >
      {/* Tape Spine (Left Column) */}
      <div
        data-testid="vhs-spine"
        className={`w-7 sm:w-8 md:w-9 shrink-0 flex items-center justify-center relative overflow-hidden transition-colors ${
          isSeries ? 'bg-[var(--color-upside)]' : 'bg-[var(--color-blood)]'
        }`}
      >
        <span className="[writing-mode:vertical-rl] rotate-180 select-none text-[9px] font-mono uppercase tracking-widest text-[var(--color-void)] font-bold truncate max-h-full px-1">
          {isSeries ? `${seriesInfo.title} • VOL ${seriesInfo.sort_order}` : 'HORROR TAPE • STANDALONE'}
        </span>
      </div>

      {/* Main Sleeve Face (Right Area) */}
      <div className="flex-1 flex flex-col justify-between p-4 bg-[var(--color-raised)] relative overflow-hidden">
        {/* Top Header Row */}
        <div>
          {/* Corner Sticker Group */}
          <div className="absolute top-3 right-3 flex flex-col items-end gap-1 z-10">
            {isExample && (
              <span className="font-mono text-[8px] font-bold uppercase tracking-widest bg-[var(--color-ember)] text-white px-1.5 py-0.5 shadow-sm">
                {story.badge || 'EXAMPLE'}
              </span>
            )}
            <span
              className={`font-mono text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 ${
                isSeries
                  ? 'bg-[var(--color-upside)] text-[var(--color-void)]'
                  : 'bg-[var(--color-blood)] text-white'
              }`}
            >
              {isSeries ? 'SERIES' : `${critiqueCount} CRITIQUES`}
            </span>
          </div>

          {/* Title */}
          <h3 className="font-['Fraunces'] font-black text-base sm:text-lg text-[var(--color-bone)] uppercase tracking-tight line-clamp-3 leading-tight pr-14 group-hover:text-[var(--color-ember)] transition-colors">
            {story.title}
          </h3>

          {/* Series Tagline if in series */}
          {isSeries && (
            <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-upside)] mt-1 truncate">
              {seriesInfo.title} — Part {seriesInfo.sort_order}
            </p>
          )}

          {/* Lede Teaser */}
          {story.lede && (
            <p className="font-serif italic text-xs text-[var(--color-ash)] line-clamp-3 leading-relaxed mt-2">
              {story.lede}
            </p>
          )}
        </div>

        {/* Bottom Footer Details */}
        <div className="border-t border-[var(--color-line)] pt-2 mt-3 flex justify-between items-center text-[10px] font-mono text-[var(--color-ash)]">
          <span className="font-bold text-[var(--color-bone)]">@{handle}</span>
          <span>{postedAgo(story.created_at)}</span>
        </div>
      </div>

      {/* Subtle Scanline Overlay */}
      <div className="vhs-scanlines pointer-events-none opacity-30 group-hover:opacity-10 transition-opacity" />
    </a>
  )
}
