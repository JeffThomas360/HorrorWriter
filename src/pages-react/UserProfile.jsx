import { useEffect, useState } from 'react'
import { getProfileByHandle } from '../lib/profile'
import ProfileHead from '../components/ProfileHead'
import ReportModal from '../components/ReportModal'
import FollowButton from '../components/FollowButton'
import { withProviders } from '../components/Providers'

function UserProfile({ handle }) {
  const [profile, setProfile] = useState(null)
  const [status, setStatus] = useState('loading')
  const [reportTarget, setReportTarget] = useState(null)

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    getProfileByHandle(handle)
      .then((p) => {
        if (cancelled) return
        if (!p) { setStatus('notfound'); return }
        setProfile(p)
        setStatus('found')
      })
      .catch(() => { if (!cancelled) setStatus('error') })
    return () => { cancelled = true }
  }, [handle])

  if (status === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] mt-8">
        <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-text-secondary)] animate-pulse">Loading…</p>
      </div>
    )
  }

  if (status === 'notfound') {
    return (
      <div className="vintage-card text-center py-16 border-red-950 mt-8 max-w-2xl mx-auto">
        <span className="block font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-text-secondary)] mb-2">▸ No such writer</span>
        <h2 className="text-xl font-serif mb-4">@{handle} is not in the coven.</h2>
        <a href="/" className="border border-[#2d2d2a] hover:border-white font-mono text-xs uppercase px-4 py-2 transition-colors inline-block mt-2">
          Back Home
        </a>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="vintage-card text-center py-16 border-red-950 mt-8 max-w-2xl mx-auto">
        <span className="block font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-text-secondary)] mb-2">▸ Error</span>
        <h2 className="text-xl font-serif mb-2">Something went wrong.</h2>
        <p className="text-xs text-[var(--color-text-secondary)] font-serif">Couldn't load this profile. Try again in a moment.</p>
      </div>
    )
  }

  const joinedFmt = profile.created_at
    ? new Date(profile.created_at).toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
      })
    : null

  return (
    <div className="mt-8 max-w-2xl mx-auto">
      <div className="border-b border-[#2d2d2a] pb-6 mb-8 flex items-end justify-between">
        <div>
          <span className="block font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-text-secondary)] mb-2">Member</span>
          <h2 className="text-3xl font-serif font-black">The <em className="italic text-[var(--color-accent-crimson)] font-serif">Coven</em></h2>
        </div>
      </div>

      <div className="vintage-card p-6">
        <ProfileHead profile={profile} />
        
        <div className="mt-6 border-t border-[#2d2d2a] pt-6 flex flex-col gap-4 font-serif text-sm">
          {profile.pronouns && (
            <div className="font-mono text-xs text-[var(--color-text-secondary)] uppercase">
              Pronouns: {profile.pronouns}
            </div>
          )}
          
          {profile.bio && (
            <p className="italic text-[var(--color-text-primary)] leading-relaxed">{profile.bio}</p>
          )}

          {(joinedFmt || profile.location) && (
            <div className="text-xs text-[var(--color-text-secondary)] flex flex-wrap gap-2 items-center">
              {joinedFmt && <span>Joined {joinedFmt}</span>}
              {joinedFmt && profile.location && <span>·</span>}
              {profile.location && <span>{profile.location}</span>}
              <span>·</span>
              <button 
                onClick={() => setReportTarget({ type: 'user', id: profile.id })} 
                className="font-mono text-xs uppercase text-[var(--color-text-secondary)] hover:text-[var(--color-accent-crimson)] cursor-pointer"
              >
                [Report User]
              </button>
            </div>
          )}

          {profile.website_url && (
            <div className="text-xs font-mono mt-2 pt-2 border-t border-[#2d2d2a]/50">
              {profile.website_url.trim().startsWith('http://') || profile.website_url.trim().startsWith('https://') ? (
                <a 
                  href={profile.website_url.trim()} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="underline hover:text-[var(--color-accent-crimson)]"
                >
                  {profile.website_url}
                </a>
              ) : (
                <span>{profile.website_url}</span>
              )}
            </div>
          )}
          
          <div className="mt-4 pt-4 border-t border-[#2d2d2a] flex justify-end">
            <FollowButton targetProfileId={profile.id} />
          </div>
        </div>
      </div>

      <ReportModal
        isOpen={!!reportTarget}
        onClose={() => setReportTarget(null)}
        targetType={reportTarget?.type}
        targetId={reportTarget?.id}
      />
    </div>
  )
}

export default withProviders(UserProfile)
