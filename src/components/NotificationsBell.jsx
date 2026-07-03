import { useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { withProviders } from './Providers';
import {
  useUnreadCount,
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from '../lib/useNotifications';

function timeAgo(iso) {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function NotificationsBell() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const { data: unreadCount = 0 } = useUnreadCount(user?.id);
  const { data: notifications = [] } = useNotifications(user?.id, { enabled: open });
  const markRead = useMarkNotificationRead(user?.id);
  const markAllRead = useMarkAllNotificationsRead(user?.id);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onEscape = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('click', onClickOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('click', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  if (!user) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        className="relative text-xs font-mono border border-[#2d2d2a] px-2.5 py-1.5 hover:border-[var(--color-accent-crimson)] hover:text-[var(--color-accent-crimson)] cursor-pointer"
        aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        🔔
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-[var(--color-accent-crimson)] text-white text-[10px] leading-4 text-center font-mono">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto bg-[var(--color-bg-surface)] border border-[#2d2d2a] shadow-lg z-50">
          <div className="flex items-center justify-between px-3 py-2 border-b border-[#2d2d2a]">
            <span className="text-xs font-mono uppercase tracking-wider text-text-secondary">Notifications</span>
            {unreadCount > 0 && (
              <button
                className="text-[11px] font-mono text-text-secondary hover:text-[var(--color-accent-crimson)] cursor-pointer"
                onClick={() => markAllRead.mutate()}
              >
                Mark all read
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-text-secondary font-mono">No notifications yet.</p>
          ) : (
            <ul>
              {notifications.map((n) => (
                <li
                  key={n.id}
                  className={`px-3 py-2.5 border-b border-[#2d2d2a] last:border-b-0 text-sm ${
                    n.read_at ? 'opacity-60' : 'cursor-pointer hover:bg-black/20'
                  }`}
                  onClick={() => !n.read_at && markRead.mutate(n.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">{n.title}</p>
                    {!n.read_at && (
                      <span className="mt-1 w-1.5 h-1.5 rounded-full bg-[var(--color-accent-crimson)] shrink-0" />
                    )}
                  </div>
                  {n.body && <p className="text-xs text-text-secondary mt-0.5">{n.body}</p>}
                  <p className="text-[10px] text-text-secondary font-mono mt-1">{timeAgo(n.created_at)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default withProviders(NotificationsBell);
