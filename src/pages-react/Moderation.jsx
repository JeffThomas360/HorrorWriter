import { useRef, useState } from 'react'
import { useAuth } from '../components/AuthContext'
import { isMod, modCan } from '../lib/moderation'
import OverviewTab from '../components/mod/OverviewTab'
import RegistryTab from '../components/mod/RegistryTab'
import BadgesTab from '../components/mod/BadgesTab'
import ReportsTab from '../components/mod/ReportsTab'
import SupportTab from '../components/mod/SupportTab'
import FilterRulesTab from '../components/mod/FilterRulesTab'
import SanctionsTab from '../components/mod/SanctionsTab'
import StormAlertsTab from '../components/mod/StormAlertsTab'
import AppealsTab from '../components/mod/AppealsTab'
import { withProviders } from '../components/Providers'
import RequireAuth from '../components/RequireAuth'

function Moderation() {
  const { profile, isLoading } = useAuth()
  const [tab, setTab] = useState('overview')
  const tabRefs = useRef({})

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] mt-8">
        <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-ash)] animate-pulse">Loading terminal…</p>
      </div>
    )
  }

  // Disguised 404 for anyone without a moderation role
  if (!isMod(profile)) {
    return (
      <div className="vintage-card text-center py-16 border-red-950 mt-8 max-w-2xl mx-auto">
        <span className="block font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-text-secondary)] mb-2">▸ 404 — page not found</span>
        <h2 className="text-xl font-serif mb-2">The page you’re looking for doesn’t exist.</h2>
        <p className="text-xs text-[var(--color-text-secondary)] font-serif">Ensure you are logged in to the correct credentials.</p>
      </div>
    )
  }

  const tabs = [
    { id: 'overview', label: 'Overview' },
    modCan(profile, 'handle_report', 'all') && { id: 'reports', label: 'Reports' },
    modCan(profile, 'handle_report', 'all') && { id: 'appeals', label: 'Appeals' },
    modCan(profile, 'handle_report', 'all') && { id: 'storms', label: 'Storms' },
    modCan(profile, 'handle_report', 'all') && { id: 'support', label: 'Support' },
    modCan(profile, 'configure', 'all') && { id: 'filters', label: 'AutoMod' },
    modCan(profile, 'assign_role', 'all') && { id: 'sanctions', label: 'Sanctions' },
    modCan(profile, 'assign_role', 'all') && { id: 'registry', label: 'Registry' },
    modCan(profile, 'configure', 'all') && { id: 'badges', label: 'Badges' },
  ].filter(Boolean)

  const activeId = tabs.some((t) => t.id === tab) ? tab : tabs[0]?.id

  const focusTab = (index) => {
    const t = tabs[(index + tabs.length) % tabs.length]
    if (!t) return
    setTab(t.id)
    tabRefs.current[t.id]?.focus()
  }

  const onTabKeyDown = (e, index) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); focusTab(index + 1) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); focusTab(index - 1) }
    else if (e.key === 'Home') { e.preventDefault(); focusTab(0) }
    else if (e.key === 'End') { e.preventDefault(); focusTab(tabs.length - 1) }
  }

  return (
    <div className="mt-8 max-w-5xl mx-auto">
      <div className="border-b border-[var(--color-line)] pb-6 mb-8">
        <span className="block font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-ash)] mb-2">Keeper Terminal</span>
        <h2 className="text-3xl font-serif font-black">The <em className="italic text-[var(--color-blood)] font-serif">Terminal</em></h2>
        <p className="text-xs text-[var(--color-ash)] font-serif mt-1 font-mono">▸ System status: online · Access Level: {profile?.mod_role?.toUpperCase()}</p>
      </div>

      {/* Navigation tabs */}
      <div className="flex flex-wrap gap-2 mb-8 border-b border-[var(--color-line)] pb-4" role="tablist" aria-label="Moderation sections">
        {tabs.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => { tabRefs.current[t.id] = el }}
            role="tab"
            id={`mod-tab-${t.id}`}
            aria-selected={activeId === t.id}
            aria-controls={`mod-panel-${t.id}`}
            tabIndex={activeId === t.id ? 0 : -1}
            onKeyDown={(e) => onTabKeyDown(e, i)}
            className={`font-mono text-xs uppercase px-4 py-2 border cursor-pointer transition-all ${activeId === t.id ? 'bg-[var(--color-blood)] text-[var(--color-bone)] border-[var(--color-blood)]' : 'border-[var(--color-line-hi)] text-[var(--color-ash)] hover:text-[var(--color-bone)] hover:border-[var(--color-bone)]'}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab panel */}
      <div
        className="vintage-card min-h-[300px]"
        role="tabpanel"
        id={`mod-panel-${activeId}`}
        aria-labelledby={`mod-tab-${activeId}`}
        tabIndex={0}
      >
        {activeId === 'overview' && <OverviewTab profile={profile} onNavigate={setTab} />}
        {activeId === 'reports' && <ReportsTab />}
        {activeId === 'appeals' && <AppealsTab />}
        {activeId === 'storms' && <StormAlertsTab />}
        {activeId === 'support' && <SupportTab />}
        {activeId === 'filters' && <FilterRulesTab />}
        {activeId === 'sanctions' && <SanctionsTab />}
        {activeId === 'registry' && <RegistryTab profile={profile} />}
        {activeId === 'badges' && <BadgesTab />}
      </div>
    </div>
  )
}

function ModerationWithAuth(props) {
  return (
    <RequireAuth>
      <Moderation {...props} />
    </RequireAuth>
  )
}

export default withProviders(ModerationWithAuth)
