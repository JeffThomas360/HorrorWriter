import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from './AuthContext'

export default function FollowButton({ targetProfileId }) {
  const { session } = useAuth()
  const userId = session?.user?.id
  const [isFollowing, setIsFollowing] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId || !targetProfileId) {
      setLoading(false)
      return
    }

    let cancelled = false
    const checkFollow = async () => {
      try {
        const q = supabase
          .from('user_follows')
          .select('follower_id')
          .eq('follower_id', userId)
          .eq('following_id', targetProfileId)
        // Use maybeSingle() when available so 0 rows does not trigger an HTTP 406 (PGRST116).
        const { data } = typeof q.maybeSingle === 'function' ? await q.maybeSingle() : await q.single()
        if (!cancelled) {
          setIsFollowing(Boolean(data))
          setLoading(false)
        }
      } catch {
        if (!cancelled) setLoading(false)
      }
    }

    checkFollow()
    return () => { cancelled = true }
  }, [userId, targetProfileId])

  const toggleFollow = async () => {
    if (!session) return
    setLoading(true)

    if (isFollowing) {
      await supabase
        .from('user_follows')
        .delete()
        .eq('follower_id', session.user.id)
        .eq('following_id', targetProfileId)
      setIsFollowing(false)
    } else {
      await supabase
        .from('user_follows')
        .insert({
          follower_id: session.user.id,
          following_id: targetProfileId
        })
      setIsFollowing(true)
    }
    setLoading(false)
  }

  if (!session || session.user.id === targetProfileId) return null

  return (
    <button
      type="button"
      onClick={toggleFollow}
      disabled={loading}
      className={`font-mono text-xs uppercase px-3 py-1 border transition-colors cursor-pointer disabled:opacity-50 ${
        isFollowing
          ? 'border-[var(--color-line-hi)] text-[var(--color-ash)] hover:border-[var(--color-bone)] hover:text-[var(--color-bone)]'
          : 'border-[var(--color-blood)] bg-[var(--color-blood)] text-[var(--color-bone)] hover:bg-[var(--color-ember)] hover:border-[var(--color-ember)]'
      }`}
    >
      {loading ? '...' : isFollowing ? 'Unfollow' : 'Follow'}
    </button>
  )
}
