import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from './AuthContext'

export default function NotificationsBell() {
  const { profile } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef(null)

  useEffect(() => {
    if (!profile) return

    const fetchNotifications = async () => {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .is('read_at', null)
        .order('created_at', { ascending: false })
      if (data) setNotifications(data)
    }

    fetchNotifications()

    // Optionally subscribe to realtime notifications
    const channel = supabase.channel('public:notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}` }, payload => {
        setNotifications(prev => [payload.new, ...prev])
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [profile])

  // Close on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    if (isOpen) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isOpen])

  const markRead = async (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id)
  }

  const markAllRead = async () => {
    const ids = notifications.map(n => n.id)
    setNotifications([])
    if (ids.length > 0) {
      await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids)
    }
  }

  if (!profile) return null

  return (
    <div className="notifications-bell" ref={dropdownRef} style={{ position: 'relative' }}>
      <button 
        className="nav-link" 
        onClick={() => setIsOpen(!isOpen)} 
        style={{ background: 'none', border: 'none', cursor: 'pointer', position: 'relative', display: 'flex', alignItems: 'center' }}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
        </svg>
        {notifications.length > 0 && (
          <span style={{
            position: 'absolute', top: -5, right: -5, background: 'var(--blood)', color: 'white',
            fontSize: '10px', borderRadius: '50%', padding: '2px 5px', fontWeight: 'bold'
          }}>
            {notifications.length}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="surface" style={{
          position: 'absolute', top: '100%', right: 0, width: '300px', zIndex: 100, 
          marginTop: '10px', padding: '10px', maxHeight: '400px', overflowY: 'auto',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)', border: '1px solid var(--blood)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', borderBottom: '1px solid #333', paddingBottom: '5px' }}>
            <h3 style={{ margin: 0, fontSize: '14px', fontFamily: 'var(--mono)' }}>Notifications</h3>
            {notifications.length > 0 && (
              <button onClick={markAllRead} style={{ background: 'none', border: 'none', color: 'var(--cyan)', fontSize: '12px', cursor: 'pointer' }}>Mark all read</button>
            )}
          </div>
          
          {notifications.length === 0 ? (
            <p style={{ fontSize: '13px', color: '#888', textAlign: 'center', margin: '20px 0' }}>No new notifications.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {notifications.map(n => (
                <div key={n.id} style={{ background: '#111', padding: '10px', borderRadius: '4px', position: 'relative' }}>
                  <button 
                    onClick={() => markRead(n.id)}
                    style={{ position: 'absolute', top: '5px', right: '5px', background: 'none', border: 'none', color: '#888', cursor: 'pointer' }}
                  >×</button>
                  <strong style={{ display: 'block', fontSize: '13px', color: 'var(--gold)', marginBottom: '4px' }}>{n.title}</strong>
                  <p style={{ margin: 0, fontSize: '12px', lineHeight: '1.4' }}>{n.body}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
