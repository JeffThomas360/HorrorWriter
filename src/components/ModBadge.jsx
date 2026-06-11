import { useModBadges } from '../lib/useModBadges'

/** Read-only role badge shown on public profiles. Renders nothing for
 *  normal users or before the badge map loads. */
export default function ModBadge({ role }) {
  const { data: badges } = useModBadges()
  if (!role) return null
  const badge = badges?.find((b) => b.role === role)
  if (!badge) return null
  return (
    <span className="mod-badge" title={`${badge.label} · site moderator`}>
      <span aria-hidden="true">{badge.emoji}</span> {badge.label}
    </span>
  )
}
