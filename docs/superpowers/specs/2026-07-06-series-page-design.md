# Series Page Design — HorrorWriter

**Date:** 2026-07-06  
**Feature:** Story Series Hub & In-Story Navigation  
**Scope:** Public series index page + in-story series context sidebar  
**Status:** Design spec (ready for implementation)

---

## Overview

Writers can create multi-story series to let readers follow an author's ongoing horror narrative. This design provides two interconnected experiences:

1. **Series Hub** — A public series index page where readers discover all stories in reading order
2. **In-Story Navigation** — A sidebar + context header visible while reading any part of the series

The experience prioritizes **narrative momentum** (hooking readers with series premise + atmospheric excerpts) and **reading clarity** (showing reading order and what parts readers haven't yet seen), with clean navigation and no social fluff.

---

## Series Hub Page (`/library/series/[series-id]`)

### Visual Structure

**Header Section (Hero)**
- Full-width dark background (#121212)
- Series title: Large Georgia heading, 48px+, bone text (#E5E1D8)
- Author byline: "by [Author Name]", secondary gray (#A3A39C), 16px
- Series premise: ~200 character summary, Merriweather/system font, 18px, bone text
- Optional meta stat: "5 Stories | 15,000+ words | Complete", small secondary text
- Padding: 3rem top/bottom, 1.5rem left/right (responsive)

**Reading Order Section (Main Content)**
- Single-column layout, max-width 700px, centered
- Vertical card stack, one card per story in reading order
- 3rem vertical spacing between cards
- Each card:
  - Part number: Crimson (#991B1B), bold Georgia, 36px, left-aligned
  - Story title: Georgia, 24px, bone text
  - Summary: 2–3 sentences, system font, 16px, bone text
  - Atmospheric teaser: Italic, 14px, secondary gray, ~40 characters (excerpt from story opening)
  - Status badge: "Published" or "Coming [date]", 12px secondary gray
  - CTA button: "START READING →", outlined style, crimson text, crimson border (1px), hover fills with crimson background
  - Padding: 1.5rem
  - Border: 1px #2d2d2a (thin, desaturated)

### Interactive Behavior

- Clicking any "START READING" button navigates to `/library/read/[story-id]` with series context active
- Clicking the story title also navigates to read the story
- Series title is clickable and returns to the series hub

---

## In-Story Navigation (while reading a series story)

### Series Context Bar (Fixed/Sticky)
- Positioned at top of page, height 48px
- Background: #1a1a1a (surface color)
- Border-bottom: 1px #2d2d2a
- Content: "[Series Title]  |  Part X of Y: [Story Title]  |  [⊕ expand series]"
- Font: System font, 14px
- Padding: 1rem horizontal
- Sticky behavior: Always visible while scrolling through story content
- Clicking the expand button toggles the series sidebar

### Series Sidebar (Desktop)

**Layout:**
- Right sidebar, 280px width, scrollable independently
- Background: #1a1a1a (surface color)
- Border-left: 1px #2d2d2a
- Header: Series title (Georgia, 16px bold) + author name (secondary gray, 12px)
- Divider line (1px #2d2d2a) below header

**Story List:**
- Vertical list of all series parts
- Each part shows:
  - Part number indicator (emoji or visual marker: ✓, ●, or □)
  - Story title (Georgia, 14px)
  - Status text (inline, secondary gray, 12px)
- Spacing: 1rem between items

**Visual States:**

| State | Appearance | Meaning |
|-------|-----------|---------|
| **Before current** (Parts 1–2 if reading Part 3) | ✓ indicator, text at 50% opacity, left border crimson (2px) | Reader hasn't read these yet; they come earlier in the series |
| **Current** (Part 3) | ● indicator, bold text, normal opacity, background #2d2d2a highlight, crimson accent | Reader is on this part right now |
| **After current** (Parts 4–5) | □ indicator, normal text, normal opacity | Reader hasn't reached these yet; they come later |

**Navigation Buttons:**
- Two buttons at bottom of sidebar: "← Previous Part" and "Next Part →"
- Only show if previous/next exists (no button if on Part 1/5)
- Style: Outlined, crimson text, 1px crimson border, hover fills background
- Full-width buttons, centered
- 0.5rem gap between them

**Interactivity:**
- Clicking any story part navigates to `/library/read/[story-id]`
- Part before/after links update the sidebar state
- Sidebar closes on mobile when a story is selected

### Series Sidebar (Mobile)

**Layout:**
- Triggered by tapping the context bar's expand button
- Full-width modal/drawer, 80% of screen height
- Slides in from bottom
- Header with series title + close button (X)
- Same content as desktop, stacked vertically

**Dismiss behavior:**
- Tap the X button in the modal header → closes sidebar, returns focus to story content
- Tap outside the modal (on the dimmed story content below) → closes sidebar
- Swipe-down gesture from top of modal → closes sidebar (optional, nice-to-have)
- Clicking a story part in the sidebar → navigates to that story AND closes the modal
- After navigation, the new story page renders with the series context active (sidebar closed by default, ready to be reopened)

---

## Navigation Flows

### Flow 1: Reader starts at Part 3 (open entry point)

1. User visits series hub at `/library/series/[id]`
2. Sees all 5 parts listed in order with summaries and teasers
3. Clicks "START READING" on Part 3 (can start anywhere)
4. Navigates to `/library/read/[story-3-id]` with series context active
5. Series context bar shows: "THE WHISPER IN THE WALLS | Part 3 of 5: The Secret Beneath | [⊕]"
6. While reading, sidebar shows:
   - ✓ Parts 1–2 (grayed, crimson left border, "(You haven't read this)")
   - ● Part 3 (highlighted, current)
   - □ Parts 4–5 (normal, clickable)
7. Reader can:
   - Continue to Part 4 via "Next Part →" button
   - Jump back to Part 1 by clicking it in the sidebar
   - Return to series hub by clicking the series title in the context bar
   - Close sidebar and read normally

### Flow 2: Reader reading in sequence

1. Finishes Part 1
2. Either clicks "Next Part →" button or clicks Part 2 in sidebar
3. Navigates to Part 2, sidebar updates
4. Part 1 now shows as ✓ (before current), Part 2 is ●, Part 3+ are □
5. Reading experience is consistent; can jump around at any time

### Flow 3: Reader navigates backward

1. Reading Part 4
2. Clicks Part 2 in sidebar (realizes they missed something)
3. Navigates to Part 2
4. Sidebar now shows Part 2 as ●, Parts 1 and 3+ adjust accordingly
5. Can continue forward from Part 2 or jump elsewhere

---

## Data Requirements

**From `series` table:**
- `id` (series UUID)
- `author_id` (FK to profiles)
- `title` (series name)
- `description` (series premise/pitch, ~200 chars)

**From `series_books` table:**
- `series_id` (FK to series)
- `book_id` (FK to books)
- `sort_order` (integer, defines reading sequence)

**From `books` table (for each story in the series):**
- `id` (story UUID)
- `title` (story title)
- `content` (full story text; extract opening ~50 words for teaser)
- `created_at` (publication date; use to show "Published" vs "Coming [date]")
- `author_id` (to verify series owner wrote the story)

---

## Typography & Styling

**Fonts:**
- **Headings (h1, h2, h3):** Georgia, serif
- **Body & UI text:** System font stack: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`

**Colors (from design system):**
- Background primary: #121212
- Background surface: #1a1a1a
- Text primary: #E5E1D8 (bone)
- Text secondary: #A3A39C (gray)
- Accent crimson: #991B1B

**Spacing Scale:**
- 0.5rem, 1rem, 1.5rem, 2rem, 3rem (multiples of 4px base)

**Borders:**
- 1px solid #2d2d2a (thin, desaturated, no shadows)

---

## Responsive Design

**Desktop (1024px+):**
- Hub: Full-width header + centered 700px card column
- In-story: 280px right sidebar always visible
- Context bar at top, fixed

**Tablet (600–1023px):**
- Hub: Same, but narrower margins
- In-story: Sidebar collapses to modal/drawer, triggered by context bar button
- Context bar always visible

**Mobile (< 600px):**
- Hub: Full-width, card padding reduces to 1rem
- In-story: No permanent sidebar; modal on tap
- Context bar has larger tap target (48px min height)

---

## Accessibility & Performance

**Accessibility:**
- All buttons have clear labels and sufficient color contrast
- Series sidebar list uses semantic `<nav>` or `<ul>` for screen readers
- Part number indicators have text labels (not just visual)
- Link focus states visible (outline or underline)

**Performance:**
- Lazy-load story content (don't render all 5 stories' previews simultaneously)
- Sidebar navigation is client-side (instant, no server round-trip)
- No web fonts required (Georgia + system fonts); instant page load

---

## Prerequisites & Blockers

**BLOCKING:** Before implementation begins, the `series_books` RLS policy must be fixed to prevent authors from adding stories they don't own to their series.

**Current gap:** The RLS policy checks `auth.uid() = series.author_id` (series ownership) but never validates that `auth.uid() = books.author_id` (story ownership). An author could add anyone's story to their series.

**Fix required:** Add a book-ownership check to the `series_books` INSERT/UPDATE policy:
```sql
-- series_books write policy should also check:
AND EXISTS (
  SELECT 1 FROM books 
  WHERE id = series_books.book_id 
  AND author_id = auth.uid()
)
```

This must be deployed to the remote Supabase project before the series UI goes live.

---

## Implementation Decisions

### Island State Coordination

The series sidebar and story content are separate React islands. When a reader navigates between parts:

1. **Pattern:** Use `window.__seriesContext` global (similar to `window.__signinPending` for the sign-in modal) to persist series state across island hydration.
2. **State to sync:**
   - Current series ID
   - Current story/part ID
   - Sidebar open/closed toggle
3. **On story navigate:**
   - Update `window.__seriesContext`
   - SeriesContext island reads it on hydration
   - Sidebar renders with correct "before/current/after" visual states
4. **Rationale:** Avoids race conditions during initial page load when sidebar hydrates before story island is ready.

### Teaser Extraction

**Concrete approach:** Pre-extract and store the teaser in the database.

- **When:** At story creation/publish time (in `PublishStory.jsx`), extract the first 40–60 words from the story's content (stripping markdown/HTML)
- **Storage:** Add a `series_teaser` column to `books` table (optional, nullable; only used when story is added to a series)
- **Truncation:** If the extracted text ends mid-word, truncate to the last complete word and append "…"
- **Rendering:** On the series hub, display `books.series_teaser` as-is (no further processing)
- **Fallback:** If no teaser exists, show "A story in this series. Start reading to discover more."

**Alternative considered:** Generate teaser on-read. Rejected because:
- Slower (generates for every series hub view)
- Inconsistent (different readers might see different teasers if story content is edited)
- Complex (need to handle markdown → plain text conversion every time)

---

## Edge Cases & Constraints

1. **Series with 1 story:** No "Previous" or "Next" buttons; series hub still shows (allows for future expansion)
2. **Series with 50+ stories:** Sidebar becomes scrollable; consider pagination on hub page if needed
3. **Unfinished series (parts publishing over time):** Status badge shows "Coming [date]"; readers can still navigate to published parts
4. **Reader not signed in:** Can read series, see full hub, but cannot mark as read (future feature, not in scope)
5. **Mobile with long story titles:** Part names may wrap; sidebar still works, no overflow
6. **Stale sidebar links (deleted/unpublished parts):** If a story is deleted after being added to a series, the sidebar still links to it. **Handling:** On sidebar click, navigate to the story route. If the story returns 404 (deleted), the read page shows "Story not found" gracefully. Update sidebar to remove the link on error (client-side, don't re-query the DB).
7. **Series with mixed publish dates:** Parts may be added out of chronological order. Sidebar always follows `sort_order`, not `created_at`.

---

## Out of Scope (Future)

- "Mark as read" tracking per user
- Series follower count or social engagement
- Comment/discussion threads on series
- Email notifications for new parts
- Series recommendations or search
- Advanced series discovery features

These are explicitly deferred per requirements (C was irrelevant).

---

## Testing Strategy

**Unit/Component Tests:**
- Series sidebar correctly marks "before", "current", "after" parts
- Navigation buttons only show when applicable
- Context bar truncates long titles gracefully

**E2E Tests:**
- Reader can navigate series hub and start reading any part
- Sidebar updates correctly when switching between parts
- "Previous"/"Next" buttons navigate correctly
- Mobile modal opens/closes on tap
- Clicking part in sidebar navigates to story with correct context

**Manual Verification:**
- Series with 1, 5, and 15+ stories (edge cases)
- Desktop, tablet, mobile (all responsive breakpoints)
- Long series titles, long story summaries (text overflow)
- Author can create, edit, delete series (admin flow — separate)

---

## Implementation Notes

- **Component structure:** Series hub is a page component (`pages/library/series/[id].astro`), in-story context is a reusable React island (`SeriesContext.jsx`)
- **Database queries:** Join `series` → `series_books` → `books` with sort_order, avoid N+1 queries
- **RLS:** Series reads are public; only series owner can edit
- **State management:** Series context (current part, sidebar open/closed) lives in local React state per story page
