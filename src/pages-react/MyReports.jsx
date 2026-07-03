import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../components/AuthContext'
import { withProviders } from '../components/Providers'
import RequireAuth from '../components/RequireAuth'

function MyReports() {
  const { user } = useAuth()
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    const fetchReports = async () => {
      const { data } = await supabase
        .from('reports')
        .select('*')
        .eq('reporter_id', user.id)
        .order('created_at', { ascending: false })
      setReports(data || [])
      setLoading(false)
    }
    fetchReports()
  }, [user])

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] mt-8">
      <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-text-secondary)] animate-pulse">Loading reports...</p>
    </div>
  )

  return (
    <div className="mt-8 max-w-2xl mx-auto">
      <div className="border-b border-[#2d2d2a] pb-6 mb-8">
        <span className="block font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-text-secondary)] mb-2">Transparency</span>
        <h2 className="text-3xl font-serif font-black">My <em className="italic text-[var(--color-accent-crimson)] font-serif">reports</em></h2>
        <p className="text-xs text-[var(--color-text-secondary)] font-serif mt-1">Track the status of content you have flagged for review.</p>
      </div>

      {reports.length === 0 ? (
        <p className="font-serif italic text-xs text-[var(--color-text-secondary)] py-12 border border-dashed border-[#2d2d2a] text-center">
          You have not submitted any reports.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {reports.map(r => (
            <div key={r.id} className="vintage-card flex flex-col gap-3 font-mono text-xs">
              <div className="flex justify-between items-start border-b border-[#2d2d2a] pb-3 text-xs text-[var(--color-text-secondary)]">
                <strong className="text-[var(--color-text-primary)]">{r.target_type.toUpperCase()} - {r.category}</strong>
                <span>{new Date(r.created_at).toLocaleString()}</span>
              </div>
              <p className="text-[var(--color-text-primary)]">
                <span className="text-[var(--color-text-secondary)] mr-1 font-bold">Status:</span> 
                <span className={r.status === 'open' ? 'text-blue-500 font-bold' : (r.status === 'actioned' ? 'text-[var(--color-accent-crimson)] font-bold' : 'text-[var(--color-text-secondary)]')}>{r.status.toUpperCase()}</span>
              </p>
              {r.status !== 'open' && r.resolution && (
                <div className="text-[var(--color-text-secondary)] italic border-l border-[#2d2d2a] pl-3 py-1 mt-2">
                  <span className="block font-bold text-xs uppercase text-[var(--color-text-primary)] mb-1 not-italic">Moderator Note</span>
                  {r.resolution}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function MyReportsWithAuth(props) {
  return (
    <RequireAuth>
      <MyReports {...props} />
    </RequireAuth>
  )
}

export default withProviders(MyReportsWithAuth)
