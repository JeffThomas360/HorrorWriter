import { useAuth } from './AuthContext';
import { supabase } from '../supabaseClient';
import { withProviders } from './Providers';

function UserMenu() {
  const { session, profile, isLoading } = useAuth();
  
  if (isLoading) {
    return <span className="text-xs text-[var(--color-text-secondary)] font-mono">▸ Reading coven...</span>;
  }

  return (
    <div className="flex items-center gap-4">
      {session ? (
        <div className="flex items-center gap-4">
          <a href="/profile" className="flex items-center gap-2 hover:text-[var(--color-accent-crimson)]">
            {profile?.avatar_url ? (
              <img 
                src={profile.avatar_url} 
                alt={profile.handle || 'User'} 
                className="w-7 h-7 rounded-full object-cover border border-[var(--color-line)]" 
                width="28" 
                height="28" 
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-[var(--color-bg-surface)] border border-[var(--color-line)] flex items-center justify-center text-xs font-mono text-[var(--color-text-secondary)]">
                {profile?.handle ? profile.handle.slice(0, 2).toUpperCase() : '??'}
              </div>
            )}
            <span className="text-sm font-mono">@{profile?.handle}</span>
          </a>
          <button 
            className="text-xs font-mono border border-[var(--color-line)] px-3 py-1.5 hover:border-[var(--color-accent-crimson)] hover:text-[var(--color-accent-crimson)] cursor-pointer"
            onClick={() => supabase?.auth.signOut()}
          >
            Sign Out
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <button 
            className="text-xs font-mono border border-[var(--color-line)] px-3 py-1.5 hover:border-[var(--color-accent-crimson)] hover:text-[var(--color-accent-crimson)] cursor-pointer"
            onClick={() => {
              window.dispatchEvent(new CustomEvent('open-signin'));
            }}
          >
            Sign In
          </button>
        </div>
      )}
    </div>
  );
}

export default withProviders(UserMenu);
