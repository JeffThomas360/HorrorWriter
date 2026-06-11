import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from './AuthContext'

export default function FollowButton({ targetProfileId }) {
  const { session } = useAuth()
  const [isFollowing, setIsFollowing] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!session || !targetProfileId) {
      setLoading(false)
      return
    }

    let cancelled = false
    const checkFollow = async () => {
      const { data, error } = await supabase
        .from('user_follows')
        .select('*')
        .eq('follower_id', session.user.id)
        .eq('following_id', targetProfileId)
        .single()
      
      if (!cancelled) {
        setIsFollowing(!!data)
        setLoading(false)
      }
    }
    
    checkFollow()
    return () => { cancelled = true }
  }, [session, targetProfileId])

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
      onClick={toggleFollow} 
      disabled={loading}
      className={`btn ${isFollowing ? 'ghost' : 'blood'}`}
      style={{ marginTop: '12px', fontSize: '13px', padding: '6px 12px' }}
    >
      {loading ? '...' : isFollowing ? 'Unfollow' : 'Follow'}
    </button>
  )
}
