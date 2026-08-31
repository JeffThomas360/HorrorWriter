import { useQuery } from '@tanstack/react-query'
import { fetchSiteSettings } from '../lib/siteSettings'
import { withProviders } from './Providers'

/**
 * Renders the maintenance notice and/or announcement banner set in
 * /admin → Site. Reads client-side, so there is a brief moment before it
 * appears — acceptable for a notice. Deliberately not an enforcement gate:
 * data access is governed by RLS, not by this component.
 */

const SEVERITY_CLASS = {
  info: 'border-[var(--color-line-hi)] text-[var(--color-bone)]',
  warning: 'border-[var(--color-ember)] text-[var(--color-ember)]',
  critical: 'border-[var(--color-blood)] text-[var(--color-blood)]',
}

function SiteBanner() {
  const { data: settings } = useQuery({
    queryKey: ['site-settings'],
    queryFn: fetchSiteSettings,
    staleTime: 60_000,
  })

  if (!settings) return null

  const showMaintenance = settings.maintenance_mode
  const showAnnouncement = settings.announcement_active && settings.announcement_text

  if (!showMaintenance && !showAnnouncement) return null

  return (
    <div className="flex flex-col">
      {showMaintenance && (
        <div
          role="status"
          className="border-b bg-[var(--color-surface)] border-[var(--color-blood)] text-[var(--color-blood)] px-6 py-2 text-center font-mono text-xs uppercase tracking-wider"
        >
          ▸ {settings.maintenance_message || 'The site is undergoing maintenance.'}
        </div>
      )}
      {showAnnouncement && (
        <div
          role="status"
          className={`border-b bg-[var(--color-surface)] px-6 py-2 text-center font-mono text-xs tracking-wider ${SEVERITY_CLASS[settings.announcement_severity] || SEVERITY_CLASS.info}`}
        >
          {settings.announcement_text}
        </div>
      )}
    </div>
  )
}

export default withProviders(SiteBanner)
