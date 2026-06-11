import { useState } from 'react'
import { useAuth } from '../components/AuthContext'
import { isMod, modCan } from '../lib/moderation'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import RegistryTab from '../components/mod/RegistryTab'
import BadgesTab from '../components/mod/BadgesTab'
import ReportsTab from '../components/mod/ReportsTab'
import SupportTab from '../components/mod/SupportTab'

export default function Moderation() {
  useDocumentTitle('Keeper Terminal')
  const { profile, isLoading } = useAuth()
  const [tab, setTab] = useState('registry')

  if (isLoading) {
    return (
      <section className="surface active">
        <div className="status-panel"><p className="eyebrow">▸ Loading…</p></div>
      </section>
    )
  }

  // Disguised 404 for anyone without a moderation role (incl. signed-out).
  if (!isMod(profile)) {
    return (
      <section className="surface active">
        <div className="status-panel">
          <p className="eyebrow error">▸ 404 — page not found</p>
          <p className="status-panel-body">The page you’re looking for doesn’t exist.</p>
        </div>
      </section>
    )
  }

  const tabs = [
    modCan(profile, 'handle_report', 'all') && { id: 'reports', label: 'Reports' },
    modCan(profile, 'handle_report', 'all') && { id: 'support', label: 'Support' },
    modCan(profile, 'assign_role', 'all') && { id: 'registry', label: 'Registry' },
    modCan(profile, 'configure', 'all') && { id: 'badges', label: 'Badges' },
  ].filter(Boolean)

  // If the active tab isn't permitted, fall back to the first permitted one.
  const activeId = tabs.some((t) => t.id === tab) ? tab : tabs[0]?.id

  return (
    <section className="surface active mod-terminal">
      <p className="eyebrow">▸ Keeper Terminal</p>
      <h2 className="title">The <em>Terminal</em></h2>

      <div className="mod-tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={activeId === t.id}
            className={`mod-tab${activeId === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mod-tab-panel">
        {activeId === 'reports' && <ReportsTab />}
        {activeId === 'support' && <SupportTab />}
        {activeId === 'registry' && <RegistryTab profile={profile} />}
        {activeId === 'badges' && <BadgesTab />}
      </div>
    </section>
  )
}
