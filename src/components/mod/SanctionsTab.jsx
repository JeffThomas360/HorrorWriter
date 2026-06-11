import { useState } from 'react'
import { supabase } from '../../supabaseClient'
import { toast } from 'sonner'

export default function SanctionsTab() {
  const [handle, setHandle] = useState('')
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleSearch = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setUser(null)
    
    // Auto-strip @ if entered
    const cleanHandle = handle.replace(/^@/, '').trim()
    const { data, error } = await supabase.from('profiles').select('id, handle, banned_until, created_at').eq('handle', cleanHandle).single()
    
    if (error) setError("User not found.")
    else setUser(data)
    setLoading(false)
  }

  const handleSuspend = async (days) => {
    if (!user) return
    const until = days === -1 ? '2099-12-31T23:59:59Z' : new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
    const { error } = await supabase.from('profiles').update({ banned_until: until }).eq('id', user.id)
    if (error) toast.error(error.message)
    else {
      setUser({ ...user, banned_until: until })
      toast.success(days === -1 ? 'User permanently shadowbanned' : `User suspended for ${days} days`)
    }
  }

  const handleRevoke = async () => {
    if (!user) return
    const { error } = await supabase.from('profiles').update({ banned_until: null }).eq('id', user.id)
    if (error) toast.error(error.message)
    else {
      setUser({ ...user, banned_until: null })
      toast.success('Suspension revoked')
    }
  }

  return (
    <div className="mod-sanctions-tab" style={{ maxWidth: 800 }}>
      <h3 style={{ fontSize: 18, marginBottom: 16 }}>Sanctions & Suspensions</h3>
      <p className="dim" style={{ marginBottom: 24, fontSize: 14 }}>
        Apply read-only suspensions or permanent shadowbans to disruptive users.
      </p>

      <form onSubmit={handleSearch} style={{ display: 'flex', gap: 12, marginBottom: 32 }}>
        <input 
          type="text" 
          value={handle} 
          onChange={e => setHandle(e.target.value)} 
          placeholder="Enter exact handle (e.g., spooky_writer)" 
          style={{ flex: 1, padding: 8 }} 
        />
        <button type="submit" className="btn" disabled={loading}>{loading ? 'Searching...' : 'Search'}</button>
      </form>

      {error && <p className="form-err">{error}</p>}

      {user && (
        <div style={{ border: '1px solid #333', padding: 24, borderRadius: 4 }}>
          <h4 style={{ margin: '0 0 16px 0', fontSize: 18 }}>@{user.handle}</h4>
          <p style={{ margin: '4px 0', fontSize: 14 }}><strong>Joined:</strong> {new Date(user.created_at).toLocaleDateString()}</p>
          <p style={{ margin: '4px 0', fontSize: 14 }}>
            <strong>Status:</strong> {user.banned_until && new Date(user.banned_until) > new Date() ? (
              <span style={{ color: 'var(--blood)' }}>Suspended until {new Date(user.banned_until).toLocaleString()}</span>
            ) : <span style={{ color: 'var(--cyan)' }}>Active</span>}
          </p>

          <div style={{ marginTop: 24, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button className="btn" onClick={() => handleSuspend(1)}>1 Day Suspension</button>
            <button className="btn" onClick={() => handleSuspend(7)}>7 Day Suspension</button>
            <button className="btn blood" onClick={() => handleSuspend(-1)}>Permanent Shadowban</button>
            {user.banned_until && new Date(user.banned_until) > new Date() && (
              <button className="btn ghost" onClick={handleRevoke}>Revoke Suspension</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
