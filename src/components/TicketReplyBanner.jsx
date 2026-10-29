import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabaseClient'
import { fetchUnseenAnswered, TICKETS_KEY } from '../lib/tickets'
import { useAuth } from './AuthContext'
import { withProviders } from './Providers'

/**
 * The Keeper's answer, where a member cannot miss it: a full-width strip above the
 * header on every page, until they open the ticket.
 *
 * It is driven by the database alone. Each page load mounts a new island with an
 * empty cache and asks the database whether an answered ticket is still unseen, so
 * nothing needs an event or a prop to survive hydration, and it shows on every page
 * until `mark_ticket_seen` runs on /my-tickets/. Like SiteBanner it renders nothing
 * while it loads, signed out, or when the read fails: a notice, not a gate.
 *
 * On /my-tickets/ itself it shows nothing and asks nothing: that page opens the ticket
 * and marks it seen, and this island's separate cache could not learn that in time.
 * The page is only known after mount, so the server render and the first client render
 * are the same (empty) on every page.
 */

const MY_TICKETS = /^\/my-tickets\/?$/

function TicketReplyBanner() {
  const { user, session } = useAuth()
  const userId = user?.id ?? session?.user?.id
  // null until mounted: the server has no location to read.
  const [onMyTickets, setOnMyTickets] = useState(null)

  useEffect(() => {
    setOnMyTickets(MY_TICKETS.test(window.location.pathname))
  }, [])

  const { data: unseen } = useQuery({
    // The keeper's RLS can read every ticket, so the member's id is part of the question.
    queryKey: [...TICKETS_KEY, 'unseen', userId],
    queryFn: () => fetchUnseenAnswered(userId),
    enabled: Boolean(supabase && userId && onMyTickets === false),
    staleTime: 60_000,
  })

  if (!supabase || !userId || onMyTickets !== false || !unseen) return null

  return (
    <div
      role="status"
      className="border-b border-[var(--color-ember)] bg-[var(--color-surface)] font-mono text-xs tracking-wider text-[var(--color-ember)]"
    >
      <a
        href={`/my-tickets/#${encodeURIComponent(unseen.id)}`}
        className="flex min-h-[44px] items-center justify-center px-6 py-2 text-center underline-offset-4 hover:underline focus-visible:underline"
      >
        ▸ The Keeper answered your ticket: {unseen.subject}
      </a>
    </div>
  )
}

export default withProviders(TicketReplyBanner)
