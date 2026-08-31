import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { fetchSiteSettings, updateSiteSettings } from '../../lib/siteSettings'

/**
 * Site-level configuration. Every write goes through set_site_setting(), which
 * checks mod_can('configure') server-side and records the change to
 * mod_actions — so the RLS gate and the audit trail are not this component's
 * responsibility, and can't be bypassed by editing the client.
 */

const SEVERITIES = [
  { id: 'info', label: 'Info' },
  { id: 'warning', label: 'Warning' },
  { id: 'critical', label: 'Critical' },
]

function Toggle({ id, label, description, checked, onChange, danger }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-[var(--color-line)] last:border-0">
      <div className="flex flex-col gap-0.5">
        <label htmlFor={id} className="font-mono text-xs uppercase tracking-wider text-[var(--color-bone)] cursor-pointer">
          {label}
        </label>
        <span className="text-xs text-[var(--color-ash)] font-serif">{description}</span>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`shrink-0 w-14 h-7 border relative transition-colors cursor-pointer ${
          checked
            ? danger
              ? 'bg-[var(--color-blood)] border-[var(--color-blood)]'
              : 'bg-[var(--color-upside)] border-[var(--color-upside)]'
            : 'bg-[var(--color-surface)] border-[var(--color-line-hi)]'
        }`}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 bg-[var(--color-bone)] transition-all ${checked ? 'left-8' : 'left-0.5'}`}
          aria-hidden="true"
        />
      </button>
    </div>
  )
}

export default function SiteTab() {
  const queryClient = useQueryClient()
  const { data: settings, isLoading } = useQuery({
    queryKey: ['site-settings'],
    queryFn: fetchSiteSettings,
  })

  // Local draft for the text fields so typing isn't fighting a refetch.
  const [announcement, setAnnouncement] = useState('')
  const [maintenanceMsg, setMaintenanceMsg] = useState('')

  useEffect(() => {
    if (settings) {
      setAnnouncement(settings.announcement_text ?? '')
      setMaintenanceMsg(settings.maintenance_message ?? '')
    }
  }, [settings])

  const mutation = useMutation({
    mutationFn: updateSiteSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['site-settings'] })
      toast.success('Site settings updated.')
    },
    onError: (e) => toast.error(e.message),
  })

  if (isLoading) {
    return <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-ash)] animate-pulse">Reading settings…</p>
  }

  const s = settings ?? {}
  const save = (patch) => mutation.mutate(patch)

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h3 className="font-mono text-xs uppercase tracking-widest text-[var(--color-ash)] mb-1">Access</h3>
        <Toggle
          id="setting-registration"
          label="Registration open"
          description="When off, new accounts cannot be created. Existing users are unaffected."
          checked={s.registration_open ?? true}
          onChange={(v) => save({ registration_open: v })}
        />
        <Toggle
          id="setting-maintenance"
          label="Maintenance mode"
          description="Shows a site-wide holding notice. This is a notice, not a hard gate — see the note below."
          checked={s.maintenance_mode ?? false}
          onChange={(v) => save({ maintenance_mode: v })}
          danger
        />
        {s.maintenance_mode && (
          <div className="flex flex-col gap-2 pt-3">
            <label htmlFor="maintenance-message" className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-ash)]">
              Maintenance message
            </label>
            <textarea
              id="maintenance-message"
              rows={2}
              value={maintenanceMsg}
              onChange={(e) => setMaintenanceMsg(e.target.value)}
              placeholder="Back shortly — doing some work on the crypt."
              className="card-surface p-3 text-sm border border-[var(--color-line-hi)] focus:border-[var(--color-bone)] outline-none"
            />
            <button
              type="button"
              onClick={() => save({ maintenance_message: maintenanceMsg })}
              disabled={mutation.isPending}
              className="btn-vhs self-start text-xs"
            >
              Save message
            </button>
          </div>
        )}
      </section>

      <section>
        <h3 className="font-mono text-xs uppercase tracking-widest text-[var(--color-ash)] mb-1">Announcement banner</h3>
        <Toggle
          id="setting-announcement"
          label="Show announcement"
          description="Displays a banner across the top of every page."
          checked={s.announcement_active ?? false}
          onChange={(v) => save({ announcement_active: v })}
        />
        <div className="flex flex-col gap-2 pt-3">
          <label htmlFor="announcement-text" className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-ash)]">
            Banner text
          </label>
          <textarea
            id="announcement-text"
            rows={2}
            value={announcement}
            onChange={(e) => setAnnouncement(e.target.value)}
            placeholder="New story collection is live in the Library."
            className="card-surface p-3 text-sm border border-[var(--color-line-hi)] focus:border-[var(--color-bone)] outline-none"
          />
          <div className="flex flex-wrap items-center gap-3">
            <select
              aria-label="Announcement severity"
              value={s.announcement_severity ?? 'info'}
              onChange={(e) => save({ announcement_severity: e.target.value })}
              className="card-surface px-3 py-2 text-xs font-mono uppercase border border-[var(--color-line-hi)] cursor-pointer"
            >
              {SEVERITIES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
            <button
              type="button"
              onClick={() => save({ announcement_text: announcement })}
              disabled={mutation.isPending}
              className="btn-vhs text-xs"
            >
              Save banner text
            </button>
          </div>
        </div>
      </section>

      <p className="text-xs text-[var(--color-ash)] font-serif italic border-t border-[var(--color-line)] pt-4">
        Maintenance mode renders client-side, so it is a clear notice to visitors rather than an
        enforcement boundary — someone with JavaScript disabled would still reach the pages beneath
        it. Data stays protected by RLS regardless. If a hard lockout is ever needed, that belongs in
        the Worker, not here.
      </p>
    </div>
  )
}
