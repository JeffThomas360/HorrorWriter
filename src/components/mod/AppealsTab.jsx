import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from '../../lib/notify'
import { supabase } from '../../supabaseClient'
import { resolveAppeal, contentHref } from '../../lib/modActions'
import UserModProfile from './UserModProfile'

export default function AppealsTab() {
  const queryClient = useQueryClient()
  const [reasons, setReasons] = useState({})
  const [activeContextUserId, setActiveContextUserId] = useState(null)

  const { data: appeals = [], isLoading } = useQuery({
    queryKey: ['reports', 'appeals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reports')
        .select('*, profiles!reports_reporter_id_fkey(handle)')
        .eq('target_type', 'appeal')
        .eq('status', 'open')
        .order('created_at', { ascending: true })
      if (error) throw error
      return data ?? []
    },
  })

  const handleResolve = async (id, upheld) => {
    const reason = reasons[id]
    if (!reason || !reason.trim()) {
      toast.error('A written reason is required to resolve an appeal.')
      return
    }
    try {
      await resolveAppeal(id, upheld, reason.trim())
      toast.success(upheld ? 'Appeal resolved — decision upheld' : 'Appeal resolved — decision overturned')
      queryClient.invalidateQueries({ queryKey: ['reports', 'appeals'] })
      queryClient.invalidateQueries({ queryKey: ['mod', 'overview-counts'] })
      queryClient.invalidateQueries({ queryKey: ['mod', 'recent-actions'] })
    } catch (err) {
      toast.error(err.message || 'Action failed')
    }
  }

  if (isLoading) return <p className="font-mono text-xs uppercase text-[var(--color-ash)]">Loading…</p>
  if (appeals.length === 0) return <p className="font-serif italic text-sm text-[var(--color-ash)]">No open appeals.</p>

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start">
      <div className="flex flex-col gap-6 flex-[2] w-full min-w-0">
        {appeals.map((a) => {
          const storyLink = a.target_id ? contentHref('story', a.target_id) : null
          return (
            <div key={a.id} className="card-raised p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <p className="font-mono text-xs uppercase text-[var(--color-ash)]">
                  Filed by @{a.profiles?.handle || 'unknown'} · {new Date(a.created_at).toLocaleString()}
                </p>
                <div className="flex items-center gap-2 font-mono text-xs">
                  {storyLink && (
                    <a href={storyLink} className="underline text-[var(--color-upside)] hover:text-[var(--color-ember)]">
                      View Target
                    </a>
                  )}
                  {a.reporter_id && (
                    <button
                      type="button"
                      onClick={() => setActiveContextUserId(a.reporter_id)}
                      className="border border-[var(--color-line-hi)] px-2 py-0.5 text-[var(--color-bone)] hover:border-[var(--color-bone)] cursor-pointer"
                    >
                      User Case File
                    </button>
                  )}
                </div>
              </div>
              {a.target_id && (
                <p className="font-mono text-[11px] text-[var(--color-ash)] mb-2">
                  Target ID: {a.target_id}
                </p>
              )}
              <p className="text-sm text-[var(--color-bone)] mb-3 whitespace-pre-line">{a.details}</p>
              <textarea
                value={reasons[a.id] || ''}
                onChange={(e) => setReasons({ ...reasons, [a.id]: e.target.value })}
                placeholder="Resolution reasoning (required, published to /transparency)…"
                rows={2}
                className="w-full mb-3 bg-[var(--color-void)] text-[var(--color-bone)] border border-[var(--color-line)] px-3 py-2 text-sm focus:border-[var(--color-ember)] outline-none font-mono"
              />
              <div className="flex gap-3 justify-end">
                <button onClick={() => handleResolve(a.id, false)} className="btn-vhs">
                  Overturn
                </button>
                <button onClick={() => handleResolve(a.id, true)} className="btn-vhs opacity-75 hover:opacity-100">
                  Uphold
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {activeContextUserId && (
        <div className="flex-1 w-full lg:sticky lg:top-6 lg:max-w-sm">
          <UserModProfile userId={activeContextUserId} onClose={() => setActiveContextUserId(null)} />
        </div>
      )}
    </div>
  )
}
