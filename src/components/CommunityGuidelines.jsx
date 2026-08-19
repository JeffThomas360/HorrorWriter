import { GUIDELINES_TEXT } from '../lib/communityGuidelines'

const GUIDELINES_LINES = GUIDELINES_TEXT.split('\n')

export default function CommunityGuidelines() {
  return (
    <div className="mb-4 border border-[#2d2d2a] bg-[var(--color-bg-primary)] px-4 py-3">
      <p className="font-mono text-xs uppercase tracking-wider text-[var(--color-text-secondary)] mb-2">
        Before you post
      </p>
      <div className="font-serif text-sm text-[var(--color-text-secondary)] leading-relaxed">
        {GUIDELINES_LINES.map((line, i) => (
          <p key={i} className={i < GUIDELINES_LINES.length - 1 ? 'mb-1' : ''}>{line}</p>
        ))}
      </div>
    </div>
  )
}
