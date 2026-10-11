import { storyAuthorLabel, storyUrlKey, isArchive } from '../lib/storyHelpers'
import { tapeLook, readMinutes } from '../lib/tapeWear'

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

const COVERS = ['blood', 'cyan', 'bone', 'void']
const NEW_DAYS = 14

/**
 * A Library story as a worn VHS rental box. The wear is seeded per story and
 * scaled by real data only (see src/lib/tapeWear.js); every number shown is real.
 */
export default function VhsSleeveCard({ story }) {
  if (!story) return null

  const seriesLink = Array.isArray(story.series_books) && story.series_books.length > 0 ? story.series_books[0] : null
  const isSeries = Boolean(seriesLink?.series)
  const vol = seriesLink?.sort_order || 1
  const archive = isArchive(story)
  const cover = COVERS.includes(story.cover) ? story.cover : 'blood'
  const critiqueCount = story.comments_count || 0
  const minutes = readMinutes(story.content)
  const look = tapeLook(story)
  const ageDays = story.created_at ? (Date.now() - new Date(story.created_at)) / 86400000 : Infinity

  const sticker = archive
    ? { cls: 'tape-sticker-archive', text: 'Archive' }
    : isSeries
      ? { cls: 'tape-sticker-series', text: `Vol ${vol}` }
      : ageDays < NEW_DAYS
        ? { cls: 'tape-sticker-new', text: 'New' }
        : null

  const kind = archive ? 'Public domain' : isSeries ? `${seriesLink.series.title} · Vol ${vol}` : 'Standalone'
  const age = archive && story.created_at ? String(new Date(story.created_at).getUTCFullYear()) : postedAgo(story.created_at)

  return (
    <a
      href={`/library/read/${storyUrlKey(story)}/`}
      className="tape group"
      style={{
        '--tape-tilt': `${look.tilt}deg`,
        '--tape-wear': look.wear,
        '--tape-fade-dir': look.fadeFromLeft ? '90deg' : '270deg'
      }}
      data-wear={look.wear}
    >
      <div className="tape-case">
        <div className={`tape-sleeve tape-cover-${cover}`}>
          <div className="tape-texture" aria-hidden="true" />
          {look.scuffs.map((s, i) => (
            <span
              key={i}
              className="tape-scuff"
              aria-hidden="true"
              style={{ left: `${s.x}%`, top: `${s.y}%`, width: `${s.size}px`, height: `${s.size}px` }}
            />
          ))}
          {look.cracked && <span className="tape-crack" aria-hidden="true" />}

          <div
            data-testid="tape-band"
            className="relative bg-[var(--color-void)] text-[var(--color-bone)] font-mono text-[8px] uppercase tracking-[0.22em] px-2.5 py-1.5 flex justify-between gap-2"
          >
            <span className="shrink-0">Horror Writer</span>
            <span className={`truncate ${isSeries ? 'text-[var(--color-upside)]' : ''}`}>{kind}</span>
          </div>

          <div className="relative flex-1 flex flex-col gap-2.5 px-3.5 pt-4 pb-2.5">
            {sticker && (
              <span className={`tape-sticker ${sticker.cls}`} style={{ transform: `rotate(${look.stickerTilt}deg)` }}>
                {sticker.text}
              </span>
            )}
            {look.residue.show && (
              <span
                className="tape-residue"
                aria-hidden="true"
                style={{
                  top: `${look.residue.top}%`,
                  [look.residue.left ? 'left' : 'right']: '-6px',
                  transform: `rotate(${look.residue.rotate}deg)`
                }}
              />
            )}
            <h3 className="tape-title font-['Fraunces'] font-black text-2xl uppercase leading-[0.98] tracking-tight pr-10 line-clamp-4">
              {story.title}
            </h3>
            <div className="h-[3px] w-11 bg-current opacity-60" aria-hidden="true" />
            {story.lede && (
              <p className="font-serif italic font-light text-[11px] leading-relaxed opacity-85 line-clamp-4">
                {story.lede}
              </p>
            )}
          </div>

          <div className="relative bg-[#0B0C0F] text-[var(--color-bone)] border-t border-dashed border-[var(--color-line-hi)] px-2.5 pt-2 pb-1.5 flex flex-col gap-1.5 font-mono">
            <div className="flex gap-1 items-stretch text-center">
              <div className="flex-1 border border-[var(--color-line-hi)] py-0.5 flex flex-col">
                <span className="text-[13px] font-medium">{critiqueCount}</span>
                <span className="text-[7px] tracking-[0.14em] text-[var(--color-ash)]">{critiqueCount === 1 ? 'CRITIQUE' : 'CRITIQUES'}</span>
              </div>
              {minutes != null && (
                <div className="flex-1 border border-[var(--color-line-hi)] py-0.5 flex flex-col">
                  <span className="text-[13px] font-medium">{minutes}</span>
                  <span className="text-[7px] tracking-[0.14em] text-[var(--color-ash)]">MIN READ</span>
                </div>
              )}
              <div className="flex flex-col justify-center items-center gap-0.5 px-1" aria-hidden="true">
                <span className="tape-barcode" />
                <span className="text-[6px] tracking-[0.12em] text-[var(--color-ash)]">BE KIND · REWIND</span>
              </div>
            </div>
            <div className="flex justify-between items-center text-[10px]">
              <span className="font-medium truncate">{storyAuthorLabel(story)}</span>
              <span className="shrink-0 text-[8px] tracking-[0.16em] uppercase text-[var(--color-ash)]">{age}</span>
            </div>
          </div>

          <div className="tape-roll" aria-hidden="true" />
        </div>
      </div>
    </a>
  )
}
