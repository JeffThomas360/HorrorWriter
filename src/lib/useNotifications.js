import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
} from './notifications'

const POLL_MS = 60_000

/** Unread count for the bell badge; polled since notifications aren't on Realtime. */
export function useUnreadCount(userId) {
  return useQuery({
    queryKey: ['notifications', 'unread-count', userId],
    queryFn: () => getUnreadCount(userId),
    enabled: !!userId,
    refetchInterval: POLL_MS,
  })
}

export function useNotifications(userId, { enabled = true } = {}) {
  return useQuery({
    queryKey: ['notifications', 'list', userId],
    queryFn: () => getNotifications(userId),
    enabled: !!userId && enabled,
    refetchInterval: POLL_MS,
  })
}

export function useMarkNotificationRead(userId) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', 'list', userId] })
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count', userId] })
    },
  })
}

export function useMarkAllNotificationsRead(userId) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => markAllNotificationsRead(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', 'list', userId] })
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count', userId] })
    },
  })
}
