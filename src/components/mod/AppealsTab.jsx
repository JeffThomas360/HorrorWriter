import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '../../supabaseClient'
import { resolveAppeal } from '../../lib/modActions'

export default function AppealsTab() {
  const queryClient = useQueryClient()
  const [reasons, setReasons] = useState({})

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
    } catch (err) {
      toast.error(err.message || 'Action failed')
    }
  }

  if (isLoading) return <p className="font-mono text-xs uppercase text-[var(--color-ash)]">Loading…</p>
  if (appeals.length === 0) return <p className="font-serif italic text-sm text-[var(--color-ash)]">No open appeals.</p>

  return (
    <div className="flex flex-col gap-6">
      {appeals.map((a) => (
        <div key={a.id} className="card-raised p-4">
          <p className="font-mono text-xs uppercase text-[var(--color-ash)] mb-2">
            Filed by @{a.profiles?.handle || 'unknown'} · {new Date(a.created_at).toLocaleString()}
          </p>
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
      ))}
    </div>
  )
}
