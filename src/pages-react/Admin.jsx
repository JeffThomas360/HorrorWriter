import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../components/AuthContext'
import { modCan } from '../lib/moderation'
import { withProviders } from '../components/Providers'
import IslandErrorBoundary from '../components/IslandErrorBoundary'
import RequireAuth from '../components/RequireAuth'
import AdminOverviewTab from '../components/admin/AdminOverviewTab'
import UsersTab from '../components/admin/UsersTab'
import SiteTab from '../components/admin/SiteTab'
import AuditTab from '../components/admin/AuditTab'

/**
 * Site administration. Distinct from /moderation by design: the Terminal
 * handles *incoming* work (reports, appeals, storms, tickets), this handles
 * *configuration and oversight*. Where both need the same view — a user's
 * case file — this links into the moderation component rather than
 * duplicating it.
 *
 * Tab state lives in the URL rather than useState so a tab can be linked,
 * refreshed, and reached with the back button — the user directory deep-links
 * into a specific user, which needs it.
 */

const TAB_PARAM = 'tab'

function useUrlTab(validIds, fallback) {
  const read = () => {
    if (typeof window === 'undefined') return fallback
    const t = new URLSearchParams(window.location.search).get(TAB_PARAM)
    return validIds.includes(t) ? t : fallback
  }

  const [tab, setTabState] = useState(read)

  // Keep in step with back/forward navigation.
  useEffect(() => {
    const onPop = () => setTabState(read())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setTab = useCallback((next) => {
    setTabState(next)
    const url = new URL(window.location.href)
    url.searchParams.set(TAB_PARAM, next)
    window.history.pushState({}, '', url)
  }, [])

  return [tab, setTab]
}

function Admin() {
  const { profile, isLoading } = useAuth()
  const tabRefs = useRef({})

  const isKeeper = profile?.mod_role === 'keeper'
  const canReadAudit = modCan(profile, 'read_audit', 'all')

  const tabs = [
    { id: 'overview', label: 'Overview', show: isKeeper },
    { id: 'users',    label: 'Users',    show: isKeeper },
    { id: 'site',     label: 'Site',     show: isKeeper },
    { id: 'audit',    label: 'Audit',    show: canReadAudit },
  ].filter((t) => t.show)

  const [tab, setTab] = useUrlTab(tabs.map((t) => t.id), 'overview')

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] mt-8">
        <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-ash)] animate-pulse">Loading…</p>
      </div>
    )
  }

  // Disguised 404 — same treatment as /moderation for anyone without access.
  if (!isKeeper && !canReadAudit) {
    return (
      <div className="vintage-card text-center py-16 border-red-950 mt-8 max-w-2xl mx-auto">
        <span className="block font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-ash)] mb-2">▸ 404 — page not found</span>
        <h2 className="text-xl font-serif mb-2">The page you're looking for doesn't exist.</h2>
        <p className="text-xs text-[var(--color-ash)] font-serif">Ensure you are logged in to the correct credentials.</p>
      </div>
    )
  }

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
        <span className="block font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-ash)] mb-2">Keeper Only</span>
        <h2 className="text-3xl font-serif font-black">Site <em className="italic text-[var(--color-blood)] font-serif">Admin</em></h2>
        <p className="text-xs text-[var(--color-ash)] font-serif mt-1 font-mono">
          ▸ Configuration and oversight. Day-to-day moderation lives at{' '}
          <a href="/moderation" className="underline hover:text-[var(--color-blood)]">/moderation</a>.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-8 border-b border-[var(--color-line)] pb-4" role="tablist" aria-label="Admin sections">
        {tabs.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => { tabRefs.current[t.id] = el }}
            role="tab"
            id={`admin-tab-${t.id}`}
            aria-selected={activeId === t.id}
            aria-controls={`admin-panel-${t.id}`}
            tabIndex={activeId === t.id ? 0 : -1}
            onKeyDown={(e) => onTabKeyDown(e, i)}
            className={`font-mono text-xs uppercase px-4 py-2 border cursor-pointer transition-all ${activeId === t.id ? 'bg-[var(--color-blood)] text-[var(--color-bone)] border-[var(--color-blood)]' : 'border-[var(--color-line-hi)] text-[var(--color-ash)] hover:text-[var(--color-bone)] hover:border-[var(--color-bone)]'}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/*
        Each panel gets its own boundary: a tab that throws must not take down
        the panel you would use to fix it.
      */}
      <div
        className="vintage-card min-h-[300px]"
        role="tabpanel"
        id={`admin-panel-${activeId}`}
        aria-labelledby={`admin-tab-${activeId}`}
        tabIndex={0}
      >
        <IslandErrorBoundary key={activeId}>
          {activeId === 'overview' && <AdminOverviewTab profile={profile} onNavigate={setTab} />}
          {activeId === 'users' && <UsersTab />}
          {activeId === 'site' && <SiteTab />}
          {activeId === 'audit' && <AuditTab />}
        </IslandErrorBoundary>
      </div>
    </div>
  )
}

function AdminWithAuth(props) {
  return (
    <RequireAuth>
      <Admin {...props} />
    </RequireAuth>
  )
}

export default withProviders(AdminWithAuth)
