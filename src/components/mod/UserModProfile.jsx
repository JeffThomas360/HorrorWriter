import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../AuthContext'

export default function UserModProfile({ userId, onClose }) {
  const { user } = useAuth()
  const [profile, setProfile] = useState(null)
  const [notes, setNotes] = useState([])
  const [newNote, setNewNote] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) return
    const fetchUserContext = async () => {
      setLoading(true)
      const [profRes, notesRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).single(),
        supabase.from('mod_notes').select('*, profiles!author_id(handle)').eq('target_user_id', userId).order('created_at', { ascending: false })
      ])
      if (profRes.data) setProfile(profRes.data)
      if (notesRes.data) setNotes(notesRes.data)
      setLoading(false)
    }
    fetchUserContext()
  }, [userId])

  const handleAddNote = async (e) => {
    e.preventDefault()
    if (!newNote.trim()) return
    const { data, error } = await supabase.from('mod_notes').insert([{
      target_user_id: userId,
      author_id: user.id,
      note: newNote.trim()
    }]).select('*, profiles!author_id(handle)').single()
    
    if (error) alert(error.message)
    else {
      setNotes([data, ...notes])
      setNewNote('')
    }
  }

  const ghostBtn = 'border border-[#2d2d2a] px-3 py-2 font-mono text-xs uppercase tracking-wider text-[var(--color-text-primary)] transition-colors hover:border-white cursor-pointer'

  if (loading) return <div style={{ padding: 24 }}><p className="text-[var(--color-text-secondary)]">Loading context...</p></div>
  if (!profile) return <div style={{ padding: 24 }}><p className="form-err font-mono text-xs text-[var(--color-accent-crimson)]">User not found.</p>{onClose && <button onClick={onClose} className={ghostBtn}>Close</button>}</div>

  return (
    <div style={{ padding: 24, background: 'rgba(0,0,0,0.5)', borderLeft: '1px solid #333', height: '100%', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h3 style={{ margin: 0, fontSize: 18 }}>Mod Context: <span style={{ color: 'var(--color-accent-crimson)' }}>@{profile.handle}</span></h3>
        {onClose && <button onClick={onClose} className={ghostBtn} style={{ padding: '4px 8px' }}>✕</button>}
      </div>

      <div style={{ marginBottom: 24, fontSize: 14 }}>
        <p style={{ margin: '4px 0' }}><strong>Account Age:</strong> {new Date(profile.created_at).toLocaleDateString()}</p>
        <p style={{ margin: '4px 0' }}><strong>Suspended:</strong> {profile.banned_until && new Date(profile.banned_until) > new Date() ? <span style={{ color: 'var(--color-accent-crimson)' }}>Until {new Date(profile.banned_until).toLocaleDateString()}</span> : 'No'}</p>
      </div>

      <div style={{ marginBottom: 24 }}>
        <h4 style={{ borderBottom: '1px solid #333', paddingBottom: 8, marginBottom: 12, fontSize: 14 }}>Mod Notes</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
          {notes.length === 0 ? <p className="text-[var(--color-text-secondary)]" style={{ fontSize: 13, fontStyle: 'italic' }}>No internal notes on this user.</p> : notes.map(n => (
            <div key={n.id} style={{ background: 'rgba(255,255,255,0.05)', padding: 12, borderRadius: 4, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <strong style={{ color: 'var(--color-accent-crimson)' }}>@{n.profiles?.handle || 'unknown'}</strong>
                <span className="text-[var(--color-text-secondary)]" style={{ fontSize: 11 }}>{new Date(n.created_at).toLocaleString()}</span>
              </div>
              <div>{n.note}</div>
            </div>
          ))}
        </div>
        <form onSubmit={handleAddNote} style={{ display: 'flex', gap: 8 }}>
          <input type="text" value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Leave a behavioral note..." className="bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] border border-[#2d2d2a] px-3 py-2 text-sm focus:border-[var(--color-accent-crimson)] focus:outline-none" style={{ flex: 1, fontSize: 13 }} />
          <button type="submit" className={ghostBtn} style={{ fontSize: 13 }}>Add</button>
        </form>
      </div>
    </div>
  )
}
