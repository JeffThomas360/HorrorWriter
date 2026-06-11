import { useQuery } from '@tanstack/react-query'
import { getRoleBadges } from './modActions'

/** Cached emoji↔role map; rarely changes, so long staleTime. */
export function useModBadges() {
  return useQuery({
    queryKey: ['mod_role_badges'],
    queryFn: getRoleBadges,
    staleTime: 1000 * 60 * 30,
  })
}
