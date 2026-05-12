# Ship-Readiness Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove every fake/asserted claim, fix accessibility and UX gaps, polish the code, and ship a clean public deploy of the home page + auth + profile flows.

**Architecture:** This is a frontend-only cleanup of an existing Vite + React + React-Router + Supabase app. The pages that depend on absent backend data (Forum, Library, Rituals) are hidden from the nav but kept routable so future backend work can light them up incrementally without restructuring routes. No new dependencies. No test framework added — verification is build-passes + browser smoke check per task.

**Tech Stack:** React 18, Vite 7, React Router v6, Supabase JS v2.90, plain CSS (no preprocessor, no Tailwind).

---

## File Structure

**Modified:**
- `src/pages/Home.jsx` — remove fake live-strip + waitlist, clean up unused state/effects
- `src/pages/Forum.jsx` — replace disabled buttons with SOON chips, remove dead filter pills
- `src/pages/Rituals.jsx` — replace disabled buttons with SOON chips
- `src/pages/Profile.jsx` — use shared ProfileHead, move inline styles to classes, add handle-change guard
- `src/pages/UserProfile.jsx` — use shared ProfileHead, move inline styles to classes
- `src/pages/AuthCallback.jsx` — bump fallback timeout 3s → 5s
- `src/components/Nav.jsx` — remove links to mock pages (Forum, Library, Rituals)
- `src/components/Footer.jsx` — remove dead `<a href="#">` links / consolidate columns
- `src/components/SignInModal.jsx` — replace `alert()` passkey button with a real disabled state
- `src/components/AuthContext.jsx` — in-flight fetch guard, better error logging
- `src/components/Atmospherics.jsx` — adjust HUD positioning for safer wrapping (CSS-only side, but the JSX file is unchanged)
- `src/App.jsx` — wrap routes in an `ErrorBoundary`
- `src/style.css` — add `:focus-visible` ring, `.soon-chip` class, fix mobile hero font, move profile inline-styles to classes

**Created:**
- `src/components/ProfileHead.jsx` — shared avatar + name + handle + meta block for Profile and UserProfile
- `src/components/ErrorBoundary.jsx` — class component, catches and renders fallback
- `src/lib/useDocumentTitle.js` — tiny hook to set `document.title` per route

**Removed:**
- `src/data/threads.js`, `src/data/books.js`, `src/data/prompts.js` — **NOT removed**, the routes still exist and use them. Left in place.

---

## Task 1: Remove fake live-strip from Home

**Files:**
- Modify: `src/pages/Home.jsx`

The home page asserts "47 writers writing now" with fictional handles. This is a factual claim that isn't true. Remove the strip, the `LIVE` constant, the `liveWriters` state, and the interval that drifts the number.

- [ ] **Step 1: Edit `src/pages/Home.jsx`**

  Remove the `LIVE` constant (lines 4-10).

  Remove the `liveWriters` state declaration (line 48):
  ```jsx
  const [liveWriters, setLiveWriters] = useState(47)
  ```

  Remove the `useEffect` that drifts the count (lines 72-82):
  ```jsx
  useEffect(() => {
    const id = setInterval(() => {
      setLiveWriters((n) => {
        let next = n + Math.round((Math.random() - 0.45) * 4)
        if (next < 32) next = 32
        if (next > 71) next = 71
        return next
      })
    }, 3200)
    return () => clearInterval(id)
  }, [])
  ```

  Remove the entire `<div className="live-strip">` block in the JSX (lines 100-108):
  ```jsx
  <div className="live-strip">
    {LIVE.map((w) => (
      <span key={w.handle}>
        <span className="dot" />
        <b>{w.handle}</b>&nbsp;&middot;&nbsp;{w.genre}
      </span>
    ))}
    <span><span className="dot" /><b>{liveWriters}</b>&nbsp;writing now</span>
  </div>
  ```

  Also remove the now-unused `useState` from the import if it's no longer used. (It is still used elsewhere? Check: after removal, `useState` is not used in Home.jsx — strip it from `import { useEffect, useRef, useState } from 'react'`.)

- [ ] **Step 2: Build to verify no syntax errors**

  Run: `npm run build`
  Expected: `✓ built in <2s` with no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add src/pages/Home.jsx
  git commit -m "refactor(home): remove fake 'writers active now' live strip

The hardcoded LIVE handles + drifting liveWriters count asserted live
data that didn't exist. Atmospheric overlays are theater; live-data
claims are facts and have to be true."
  ```

---

## Task 2: Remove waitlist section from Home

**Files:**
- Modify: `src/pages/Home.jsx`

The bottom "Join the Coven" form looks like a waitlist signup but captures nothing server-side. Sign-in is handled by the nav CTA. Remove the section.

- [ ] **Step 1: Edit `src/pages/Home.jsx`**

  Remove the entire `<div className="join-cta">` block (lines 140-150):
  ```jsx
  <div className="join-cta">
    <p className="eyebrow">Invite Only</p>
    <h2 className="join-heading">Join the Coven</h2>
    <p className="join-lede">
      We are currently invite-only. Leave your email and we will summon you when a seat opens.
    </p>
    <form className="join-form" onSubmit={(e)=>{e.preventDefault();const i=e.target.querySelector('input');i.value='';i.placeholder='Your soul has been registered.'}}>
      <input type="email" required placeholder="your@email.com" />
      <button type="submit" className="btn primary">Summon Me</button>
    </form>
  </div>
  ```

- [ ] **Step 2: Edit `src/style.css`**

  Remove the now-unused `.join-cta`, `.join-cta::before`, `.join-cta .eyebrow`, `.join-heading`, `.join-lede`, `.join-form`, and `.join-form input` rule blocks (lines 621-644 of current style.css).

- [ ] **Step 3: Build**

  Run: `npm run build`
  Expected: `✓ built in <2s`

- [ ] **Step 4: Commit**

  ```bash
  git add src/pages/Home.jsx src/style.css
  git commit -m "refactor(home): remove fake waitlist 'Summon Me' form

The form mutated the DOM to fake a confirmation message but stored no
email. The nav-bar Sign In CTA is the real entry point. Removed JSX +
the orphaned .join-cta CSS."
  ```

---

## Task 3: Hide mock pages from primary nav

**Files:**
- Modify: `src/components/Nav.jsx`

Forum, Library, and Rituals are visual mocks with no backend. Hide their links from the nav. Routes remain in `App.jsx` so future work can re-add the links once each page is real.

- [ ] **Step 1: Edit `src/components/Nav.jsx`**

  Remove these three NavLinks (lines 20-22):
  ```jsx
  <NavLink to="/forum"   className={linkClass}>The Crypt</NavLink>
  <NavLink to="/library" className={linkClass}>Library</NavLink>
  <NavLink to="/rituals" className={linkClass}>Rituals</NavLink>
  ```

  After change, the `<nav className="nav-links">` block should contain only Home + the signed-in-only Coven link:
  ```jsx
  <nav className="nav-links" aria-label="Main navigation">
    <NavLink to="/" end className={linkClass}>Home</NavLink>
    {session && <NavLink to="/profile" className={linkClass}>Coven</NavLink>}
  </nav>
  ```

- [ ] **Step 2: Build**

  Run: `npm run build`
  Expected: success.

- [ ] **Step 3: Commit**

  ```bash
  git add src/components/Nav.jsx
  git commit -m "refactor(nav): hide Forum/Library/Rituals links until backend exists

Routes remain in App.jsx so direct URLs still work; primary nav only
surfaces pages that are actually wired to real data."
  ```

---

## Task 4: Add `.soon-chip` CSS class

**Files:**
- Modify: `src/style.css`

A reusable inline pill that signals a feature isn't built yet. Used in the next two tasks.

- [ ] **Step 1: Edit `src/style.css`**

  Append a new section (place near the `.btn` rules, around line 260):

  ```css
  /* Inline "not yet built" pill. Used in place of disabled placeholder buttons. */
  .soon-chip{
    display:inline-flex;align-items:center;gap:6px;
    font-family:var(--mono);font-size:13px;letter-spacing:.2em;text-transform:uppercase;
    color:var(--muted);border:1px dashed rgba(243,236,217,.18);
    padding:8px 14px;border-radius:var(--r);
    background:rgba(0,0,0,.2);
    cursor:default;
  }
  .soon-chip::before{
    content:"▸";color:var(--cyan);opacity:.7;
  }
  ```

- [ ] **Step 2: Build**

  Run: `npm run build`
  Expected: success.

- [ ] **Step 3: Commit**

  ```bash
  git add src/style.css
  git commit -m "feat(style): add .soon-chip class for not-yet-built feature placeholders"
  ```

---

## Task 5: Replace disabled buttons with SOON chips on Forum

**Files:**
- Modify: `src/pages/Forum.jsx`

The Forum has a disabled "+ New Thread" button and a row of non-functional filter pills (Latest/Unanswered/Pinned). Both mislead users. Replace with a clear "▸ SOON" chip and a comment for the future filter implementation.

- [ ] **Step 1: Edit `src/pages/Forum.jsx`**

  Replace line 64:
  ```jsx
  <button className="btn ghost" disabled title="Sign in to post">+ New Thread</button>
  ```
  with:
  ```jsx
  <span className="soon-chip">New Thread · Soon</span>
  ```

  Replace the cat-pill-row block (lines 67-71):
  ```jsx
  <div className="cat-pill-row">
    <span className="cat-pill active">Latest</span>
    <span className="cat-pill">Unanswered</span>
    <span className="cat-pill">Pinned</span>
  </div>
  ```
  with: *remove it entirely*. (The category sidebar already handles filtering. The pill row was a non-functional decorative element.)

- [ ] **Step 2: Build**

  Run: `npm run build`
  Expected: success.

- [ ] **Step 3: Commit**

  ```bash
  git add src/pages/Forum.jsx
  git commit -m "refactor(forum): replace dead affordances with Soon chip

The 'New Thread' button was permanently disabled regardless of auth
state, and the Latest/Unanswered/Pinned pills did nothing. Both
implied broken functionality. Replaced with a single Soon chip and
removed the pill row entirely."
  ```

---

## Task 6: Replace disabled buttons with SOON chips on Rituals

**Files:**
- Modify: `src/pages/Rituals.jsx`

Same fix as Forum: "Submit Entry" and "Read Submissions" are always disabled.

- [ ] **Step 1: Edit `src/pages/Rituals.jsx`**

  Replace lines 41-44:
  ```jsx
  <div style={{ marginTop:28, display:'flex', gap:12, flexWrap:'wrap' }}>
    <button className="btn primary" disabled title="Sign in to submit">Submit Entry</button>
    <button className="btn ghost" disabled title="Sign in to read entries">Read Submissions</button>
  </div>
  ```
  with:
  ```jsx
  <div style={{ marginTop:28, display:'flex', gap:12, flexWrap:'wrap' }}>
    <span className="soon-chip">Submit Entry · Soon</span>
    <span className="soon-chip">Read Submissions · Soon</span>
  </div>
  ```

- [ ] **Step 2: Build**

  Run: `npm run build`
  Expected: success.

- [ ] **Step 3: Commit**

  ```bash
  git add src/pages/Rituals.jsx
  git commit -m "refactor(rituals): replace permanently disabled buttons with Soon chips"
  ```

---

## Task 7: Replace passkey alert in SignInModal with a real disabled state

**Files:**
- Modify: `src/components/SignInModal.jsx`

The current passkey button calls `alert('Passkeys coming soon')`, which is jarring against the site's aesthetic and rude UX.

- [ ] **Step 1: Edit `src/components/SignInModal.jsx`**

  Replace lines 86-88:
  ```jsx
  <button className="btn ghost full-width passkey-btn" onClick={() => alert('Passkeys coming soon')}>
    <span className="icon">⚿</span> Sign in with Passkey
  </button>
  ```
  with:
  ```jsx
  <button className="btn ghost full-width passkey-btn" disabled aria-disabled="true">
    <span className="icon">⚿</span> Sign in with Passkey&nbsp;·&nbsp;<small style={{ opacity: 0.6 }}>soon</small>
  </button>
  ```

- [ ] **Step 2: Edit `src/style.css`** — make sure disabled `.btn.ghost` looks distinct.

  Find the `.btn.ghost` block (around line 246) and add a sibling rule right after:
  ```css
  .btn:disabled,
  .btn[aria-disabled="true"]{
    opacity:.45;cursor:not-allowed;pointer-events:none;
  }
  ```

- [ ] **Step 3: Build**

  Run: `npm run build`
  Expected: success.

- [ ] **Step 4: Commit**

  ```bash
  git add src/components/SignInModal.jsx src/style.css
  git commit -m "refactor(auth): replace passkey alert() with proper disabled state

alert() was jarring against the modal aesthetic. Replaced with a real
disabled button and a 'soon' suffix. Added a generic .btn:disabled
rule so other disabled buttons share the visual treatment."
  ```

---

## Task 8: Clean up Footer dead links

**Files:**
- Modify: `src/components/Footer.jsx`

The "House" and "Quiet" columns are all `<a href="#">` placeholders. Until those pages exist, the columns shouldn't be linked. Keep the section labels as informational text (no anchors) so the visual structure is preserved.

- [ ] **Step 1: Edit `src/components/Footer.jsx`**

  Replace the "House" column (lines 22-30):
  ```jsx
  <div>
    <h5>House</h5>
    <ul>
      <li><a href="#">House Rules</a></li>
      <li><a href="#">Critique Code</a></li>
      <li><a href="#">Content Warnings</a></li>
      <li><a href="#">Moderators</a></li>
    </ul>
  </div>
  ```
  with:
  ```jsx
  <div>
    <h5>House</h5>
    <ul>
      <li><span className="footer-soon">House Rules · soon</span></li>
      <li><span className="footer-soon">Critique Code · soon</span></li>
      <li><span className="footer-soon">Content Warnings · soon</span></li>
      <li><span className="footer-soon">Moderators · soon</span></li>
    </ul>
  </div>
  ```

  Same for "Quiet" (lines 31-39):
  ```jsx
  <div>
    <h5>Quiet</h5>
    <ul>
      <li><span className="footer-soon">Privacy · soon</span></li>
      <li><span className="footer-soon">Passkeys · soon</span></li>
      <li><span className="footer-soon">RSS · soon</span></li>
      <li><span className="footer-soon">Contact the Coven · soon</span></li>
    </ul>
  </div>
  ```

  Also, since The Site links to Forum/Library/Rituals (now hidden from nav), update lines 16-19 to drop them:
  ```jsx
  <ul>
    <li><Link to="/profile">Coven</Link></li>
  </ul>
  ```

- [ ] **Step 2: Edit `src/style.css`** — add a `.footer-soon` style. Place near the `footer li a` rule (around line 658):

  ```css
  .footer-soon{
    color:var(--muted);font-style:italic;font-size:14px;
    letter-spacing:.04em;cursor:default;
  }
  ```

- [ ] **Step 3: Build**

  Run: `npm run build`
  Expected: success.

- [ ] **Step 4: Commit**

  ```bash
  git add src/components/Footer.jsx src/style.css
  git commit -m "refactor(footer): convert dead href='#' links to italic 'soon' labels

Visual structure preserved, but no clickable targets that go nowhere.
Also dropped Site-column links to mock pages (Forum/Library/Rituals)
matching the nav."
  ```

---

## Task 9: Global `:focus-visible` ring

**Files:**
- Modify: `src/style.css`

Currently no keyboard focus styles exist anywhere. Tab through the live site and the browser's default focus ring is nearly invisible on the dark background. This is a real accessibility issue.

- [ ] **Step 1: Edit `src/style.css`**

  Add the following near the top of the file, right after the `*{box-sizing:...}` reset (around line 30):

  ```css
  /* Keyboard focus ring. Always cyan, always visible, always on top of any
     element-specific shadow. Use :focus-visible so mouse clicks don't show it. */
  :focus{outline:none}
  :focus-visible{
    outline:2px solid var(--cyan);
    outline-offset:2px;
    box-shadow:0 0 14px rgba(76,213,255,.55);
    border-radius:var(--r);
  }
  ```

- [ ] **Step 2: Build**

  Run: `npm run build`
  Expected: success.

- [ ] **Step 3: Browser verify (manual)**

  Run dev server: `npm run dev`
  Open http://localhost:5173 in a browser.
  Press Tab repeatedly. Each interactive element (Sign In button, nav links, form inputs) should show a cyan outline with a glow halo.

- [ ] **Step 4: Commit**

  ```bash
  git add src/style.css
  git commit -m "feat(a11y): add visible keyboard focus ring via :focus-visible

Cyan outline with glow shadow. Visible on any element that takes
keyboard focus, suppressed for mouse clicks (focus-visible)."
  ```

---

## Task 10: Per-route document.title via small hook

**Files:**
- Create: `src/lib/useDocumentTitle.js`
- Modify: `src/pages/Home.jsx`, `src/pages/Forum.jsx`, `src/pages/Library.jsx`, `src/pages/Rituals.jsx`, `src/pages/Profile.jsx`, `src/pages/UserProfile.jsx`, `src/pages/AuthCallback.jsx`

Right now every tab says "HORROR WRITER · A Circle for Those Who Write the Dark" regardless of page. Per-route titles help users with multiple tabs open.

- [ ] **Step 1: Create `src/lib/useDocumentTitle.js`**

  ```js
  import { useEffect } from 'react'

  const BASE = 'HORROR WRITER'

  /**
   * Sets document.title to "<page> · HORROR WRITER" for the duration of the
   * component being mounted. Restores the previous title on unmount.
   */
  export function useDocumentTitle(page) {
    useEffect(() => {
      const prev = document.title
      document.title = page ? `${page} · ${BASE}` : BASE
      return () => { document.title = prev }
    }, [page])
  }
  ```

- [ ] **Step 2: Wire it into each page**

  Add the import and call at the top of each page component's function body:

  `src/pages/Home.jsx`:
  ```js
  import { useDocumentTitle } from '../lib/useDocumentTitle'
  // inside Home():
  useDocumentTitle(null)  // null = use base title only
  ```

  `src/pages/Forum.jsx`:
  ```js
  import { useDocumentTitle } from '../lib/useDocumentTitle'
  // inside Forum():
  useDocumentTitle('The Crypt')
  ```

  `src/pages/Library.jsx`:
  ```js
  import { useDocumentTitle } from '../lib/useDocumentTitle'
  // inside Library():
  useDocumentTitle('Library')
  ```

  `src/pages/Rituals.jsx`:
  ```js
  import { useDocumentTitle } from '../lib/useDocumentTitle'
  // inside Rituals():
  useDocumentTitle('Rituals')
  ```

  `src/pages/Profile.jsx`:
  ```js
  import { useDocumentTitle } from '../lib/useDocumentTitle'
  // inside Profile(), after the useAuth() call:
  useDocumentTitle('Your Profile')
  ```

  `src/pages/UserProfile.jsx`:
  ```js
  import { useDocumentTitle } from '../lib/useDocumentTitle'
  // inside UserProfile(), use the handle as title:
  useDocumentTitle(handle ? `@${handle}` : 'Member')
  ```

  `src/pages/AuthCallback.jsx`:
  ```js
  import { useDocumentTitle } from '../lib/useDocumentTitle'
  // inside AuthCallback():
  useDocumentTitle('Summoning…')
  ```

- [ ] **Step 3: Build**

  Run: `npm run build`
  Expected: success.

- [ ] **Step 4: Browser verify**

  `npm run dev`, click between routes, watch the browser tab title change.

- [ ] **Step 5: Commit**

  ```bash
  git add src/lib/useDocumentTitle.js src/pages/
  git commit -m "feat: per-route document.title via useDocumentTitle hook

Tab title now reflects the current page (e.g. 'The Crypt · HORROR
WRITER'). Restores previous title on unmount."
  ```

---

## Task 11: Avatar onError fallback

**Files:**
- Create: `src/components/ProfileHead.jsx`
- Modify: `src/pages/Profile.jsx`, `src/pages/UserProfile.jsx`
- Modify: `src/style.css`

Currently Profile.jsx and UserProfile.jsx render the avatar with `<img src={profile.avatar_url} />` and no error handler — a broken/404 URL shows the broken-image glyph. Also, the avatar-rendering logic is duplicated. Extract to a shared component with proper fallback.

- [ ] **Step 1: Create `src/components/ProfileHead.jsx`**

  ```jsx
  import { useState } from 'react'

  /**
   * Avatar + name + handle + optional meta block. Shared between the editable
   * Profile page and the public UserProfile page.
   *
   * Falls back to the initial letter when avatar_url is missing OR fails to
   * load (broken image, 404, CORS). The fallback survives even after the URL
   * gets set, as long as the image element keeps erroring.
   */
  export default function ProfileHead({ profile, children }) {
    const [imageBroken, setImageBroken] = useState(false)
    const initial = (profile.display_name?.[0] || profile.handle?.[0] || '?').toUpperCase()
    const showImage = profile.avatar_url && !imageBroken

    return (
      <div className="profile-head">
        {showImage ? (
          <img
            src={profile.avatar_url}
            alt=""
            className="profile-avatar-img"
            onError={() => setImageBroken(true)}
          />
        ) : (
          <div className="profile-avatar">{initial}</div>
        )}
        <div className="profile-info">
          <h3>{profile.display_name || profile.handle}</h3>
          <div className="handle">@{profile.handle}</div>
          {children}
        </div>
      </div>
    )
  }
  ```

- [ ] **Step 2: Use ProfileHead in `src/pages/UserProfile.jsx`**

  Add import at top:
  ```js
  import ProfileHead from '../components/ProfileHead'
  ```

  Replace the existing `<div className="profile-head">...</div>` block (lines 76-111) with:
  ```jsx
  <ProfileHead profile={profile}>
    {profile.pronouns && (
      <div className="profile-pronouns">{profile.pronouns}</div>
    )}
    {profile.bio && <p className="bio">{profile.bio}</p>}
    {(joinedFmt || profile.location) && (
      <p className="joined">
        {joinedFmt && <>Joined {joinedFmt}</>}
        {joinedFmt && profile.location && <> · </>}
        {profile.location}
      </p>
    )}
    {profile.website_url && (
      <p className="profile-website">
        <a href={profile.website_url} target="_blank" rel="noopener noreferrer">
          {profile.website_url}
        </a>
      </p>
    )}
  </ProfileHead>
  ```

- [ ] **Step 3: Use ProfileHead in `src/pages/Profile.jsx`**

  Add import at top:
  ```js
  import ProfileHead from '../components/ProfileHead'
  ```

  Replace the existing `<div className="profile-head">...</div>` block (lines 99-120) with:
  ```jsx
  <ProfileHead profile={profile}>
    {joinedFmt && <p className="joined">Joined {joinedFmt}</p>}
    <label className="btn ghost profile-avatar-change">
      {uploading ? 'Uploading…' : '▸ Change avatar'}
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={onAvatarPick}
        style={{ display: 'none' }}
        disabled={uploading}
      />
    </label>
  </ProfileHead>
  ```

  Remove the now-unused `initial` and `joinedFmt` lines? Keep `joinedFmt` — it's still used. Remove the standalone `initial` calculation (line 87) — ProfileHead computes its own.

- [ ] **Step 4: Add the small supporting styles in `src/style.css`**

  Append near the profile rules (around line 558):

  ```css
  .profile-avatar-change{
    margin-top:14px;cursor:pointer;display:inline-flex;
  }
  .profile-pronouns{
    font-family:var(--mono);color:var(--muted);
    font-size:14px;letter-spacing:.18em;
  }
  .profile-website{margin-top:8px}
  .profile-website a{
    color:var(--cyan);font-family:var(--mono);
  }
  ```

- [ ] **Step 5: Build**

  Run: `npm run build`
  Expected: success.

- [ ] **Step 6: Browser verify**

  `npm run dev`, sign in, set your avatar URL to something invalid (or delete the file from the avatars bucket): the page should show your initial letter, not a broken-image icon.

- [ ] **Step 7: Commit**

  ```bash
  git add src/components/ProfileHead.jsx src/pages/Profile.jsx src/pages/UserProfile.jsx src/style.css
  git commit -m "refactor: extract ProfileHead, add avatar onError fallback

Profile and UserProfile rendered the same avatar+name block with
slightly different children. Extracted to ProfileHead. The shared
component now tracks an imageBroken state so a 404 avatar_url falls
back to the initial-letter placeholder instead of the broken-image
glyph. Also moved several inline styles to .profile-* classes."
  ```

---

## Task 12: Move remaining Profile/UserProfile inline styles to classes

**Files:**
- Modify: `src/pages/Profile.jsx`, `src/pages/UserProfile.jsx`, `src/style.css`

Several inline `style={{...}}` attributes remain (loading/notfound/error states, eyebrows colored with var(--blood), centered panels). Promote them to CSS classes so the design system stays consistent.

- [ ] **Step 1: Add classes to `src/style.css`** — append near the profile rules:

  ```css
  /* Status panel used by loading/notfound/error views on Profile/UserProfile */
  .status-panel{
    padding:60px 0;text-align:center;
  }
  .status-panel .eyebrow{margin-bottom:0}
  .status-panel .eyebrow.error{color:var(--blood)}
  .status-panel-body{
    color:var(--bone-dim);font-style:italic;margin-top:18px;
  }
  .status-panel .btn{margin-top:24px;display:inline-flex}
  ```

- [ ] **Step 2: Edit `src/pages/UserProfile.jsx`** — replace the loading state (lines 25-32):

  ```jsx
  if (status === 'loading') {
    return (
      <section className="surface active">
        <div className="status-panel">
          <p className="eyebrow">▸ Loading…</p>
        </div>
      </section>
    )
  }
  ```

  Replace the notfound state (lines 35-48):
  ```jsx
  if (status === 'notfound') {
    return (
      <section className="surface active">
        <div className="status-panel">
          <p className="eyebrow error">▸ No such writer</p>
          <p className="status-panel-body">@{handle} is not in the coven.</p>
          <Link to="/" className="btn ghost">Back home</Link>
        </div>
      </section>
    )
  }
  ```

  Replace the error state (lines 51-61):
  ```jsx
  if (status === 'error') {
    return (
      <section className="surface active">
        <div className="status-panel">
          <p className="eyebrow error">▸ Something went wrong.</p>
          <p className="status-panel-body">
            Couldn't load this profile. Try again in a moment.
          </p>
        </div>
      </section>
    )
  }
  ```

- [ ] **Step 3: Edit `src/pages/Profile.jsx`** — replace the loading state (lines 35-43):

  ```jsx
  if (!profile) {
    return (
      <section className="surface active">
        <div className="status-panel">
          <p className="eyebrow">▸ Loading profile…</p>
        </div>
      </section>
    )
  }
  ```

- [ ] **Step 4: Edit `src/components/RequireAuth.jsx`** — same pattern, replace the two inline-styled status panels (lines 21-46):

  Find:
  ```jsx
  if (isLoading) {
    return (
      <section className="surface active">
        <div style={{ padding: '60px 0', textAlign: 'center' }}>
          <p className="eyebrow">▸ Loading…</p>
        </div>
      </section>
    )
  }

  if (!user) {
    return (
      <section className="surface active">
        <div style={{ padding: '60px 0', textAlign: 'center' }}>
          <p className="eyebrow">▸ Sign in required</p>
          <p style={{ color: 'var(--bone-dim)', fontStyle: 'italic', marginTop: 18 }}>
            You need to be signed in to view this page.
          </p>
          <button
            className="btn primary"
            style={{ marginTop: 28 }}
            onClick={() => ctx?.openSignin?.()}
          >
            Sign In
          </button>
        </div>
      </section>
    )
  }
  ```

  Replace with:
  ```jsx
  if (isLoading) {
    return (
      <section className="surface active">
        <div className="status-panel">
          <p className="eyebrow">▸ Loading…</p>
        </div>
      </section>
    )
  }

  if (!user) {
    return (
      <section className="surface active">
        <div className="status-panel">
          <p className="eyebrow">▸ Sign in required</p>
          <p className="status-panel-body">
            You need to be signed in to view this page.
          </p>
          <button className="btn primary" onClick={() => ctx?.openSignin?.()}>
            Sign In
          </button>
        </div>
      </section>
    )
  }
  ```

- [ ] **Step 5: Build**

  Run: `npm run build`
  Expected: success.

- [ ] **Step 6: Commit**

  ```bash
  git add src/style.css src/pages/Profile.jsx src/pages/UserProfile.jsx src/components/RequireAuth.jsx
  git commit -m "refactor: replace ad-hoc inline styles with .status-panel class

The three status panels (loading, notfound, error) and the sign-in-
required panel were duplicating the same inline style object. One
class, four call sites."
  ```

---

## Task 13: Handle-change guard on Profile page

**Files:**
- Modify: `src/pages/Profile.jsx`

If a user changes their handle, all inbound `/u/<old-handle>` links break (other users' bookmarks, shared links, etc.). Add a confirm dialog before submitting a handle change.

- [ ] **Step 1: Edit `src/pages/Profile.jsx`** — modify the `onSave` function (lines 47-67):

  Current:
  ```jsx
  const onSave = async (e) => {
    e.preventDefault()
    setStatus(null)
    if (!HANDLE_RE.test(form.handle)) {
      setStatus({ error: 'Handle must be 3-30 chars: a-z, 0-9, hyphens only.' })
      return
    }
    setSaving(true)
    try {
      await updateProfile(user.id, form)
      await refreshProfile()
      setStatus('saved')
    } catch (err) {
      const msg = err?.message?.includes('duplicate')
        ? 'That handle is already taken.'
        : err?.message || 'Save failed.'
      setStatus({ error: msg })
    } finally {
      setSaving(false)
    }
  }
  ```

  Replace with:
  ```jsx
  const onSave = async (e) => {
    e.preventDefault()
    setStatus(null)
    if (!HANDLE_RE.test(form.handle)) {
      setStatus({ error: 'Handle must be 3-30 chars: a-z, 0-9, hyphens only.' })
      return
    }
    // Warn before changing an existing handle — old /u/<handle> links break.
    if (profile.handle && form.handle !== profile.handle) {
      const ok = window.confirm(
        `Change your handle from @${profile.handle} to @${form.handle}?\n\n` +
        `Anyone who has bookmarked or linked to your old profile URL ` +
        `will get a "no such writer" page.`
      )
      if (!ok) return
    }
    setSaving(true)
    try {
      await updateProfile(user.id, form)
      await refreshProfile()
      setStatus('saved')
    } catch (err) {
      const msg = err?.message?.includes('duplicate')
        ? 'That handle is already taken.'
        : err?.message || 'Save failed.'
      setStatus({ error: msg })
    } finally {
      setSaving(false)
    }
  }
  ```

- [ ] **Step 2: Build**

  Run: `npm run build`
  Expected: success.

- [ ] **Step 3: Browser verify**

  Sign in. Change just the bio → save → no confirm. Change the handle → save → confirm dialog appears. Cancel → no save.

- [ ] **Step 4: Commit**

  ```bash
  git add src/pages/Profile.jsx
  git commit -m "feat(profile): confirm before changing an existing handle

Changing the handle breaks /u/<old-handle> for everyone who linked
or bookmarked the profile. A browser confirm() before submit is low
ceremony and adequate for the rate this will happen."
  ```

---

## Task 14: AuthContext race guard + better error logging

**Files:**
- Modify: `src/components/AuthContext.jsx`

On first load, both `getSession()` and `onAuthStateChange` callbacks can fire `fetchProfile` for the same user concurrently. The result is harmless duplicate network requests. Add an in-flight guard. Also surface the error in a more useful way (include the user id so it's findable in logs).

- [ ] **Step 1: Edit `src/components/AuthContext.jsx`** — replace the `fetchProfile` definition (lines 18-35):

  Current:
  ```jsx
  const fetchProfile = useCallback(async (userId) => {
    if (!supabase) return null
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()
      if (error) throw error
      setProfile(data)
      return data
    } catch (err) {
      console.error('Error fetching profile:', err)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [])
  ```

  Replace with:
  ```jsx
  const inFlightRef = useRef(null)
  const fetchProfile = useCallback(async (userId) => {
    if (!supabase) return null
    // Coalesce concurrent calls for the same user.
    if (inFlightRef.current?.userId === userId) {
      return inFlightRef.current.promise
    }
    const promise = (async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single()
        if (error) throw error
        setProfile(data)
        return data
      } catch (err) {
        console.error(`[AuthContext] fetchProfile failed for user ${userId}:`, err)
        return null
      } finally {
        setIsLoading(false)
        inFlightRef.current = null
      }
    })()
    inFlightRef.current = { userId, promise }
    return promise
  }, [])
  ```

  At the top of the file, add `useRef` to the React import:
  ```js
  import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
  ```

- [ ] **Step 2: Build**

  Run: `npm run build`
  Expected: success.

- [ ] **Step 3: Commit**

  ```bash
  git add src/components/AuthContext.jsx
  git commit -m "fix(auth): coalesce concurrent fetchProfile calls + improve logging

On first load, getSession() and onAuthStateChange's SIGNED_IN event
both fire fetchProfile for the same user. The duplicate requests
were harmless but wasted. An in-flight ref returns the existing
promise. Also added the user id to the error log so failures are
findable when multi-user."
  ```

---

## Task 15: Add ErrorBoundary at App level

**Files:**
- Create: `src/components/ErrorBoundary.jsx`
- Modify: `src/App.jsx`

Currently any thrown error inside a page (e.g. a Supabase query that returns malformed data) crashes the whole shell — atmospherics and all. Wrap routes in an ErrorBoundary that renders a horror-themed fallback panel and logs the error.

- [ ] **Step 1: Create `src/components/ErrorBoundary.jsx`**

  ```jsx
  import { Component } from 'react'

  /**
   * Catches render-time errors in descendant components. React doesn't
   * support error boundaries via hooks; this must be a class.
   *
   * Errors are logged to console with a tag. If you wire a real error
   * reporter (Sentry, etc.) later, do it in componentDidCatch.
   */
  export default class ErrorBoundary extends Component {
    constructor(props) {
      super(props)
      this.state = { error: null }
    }

    static getDerivedStateFromError(error) {
      return { error }
    }

    componentDidCatch(error, info) {
      console.error('[ErrorBoundary]', error, info.componentStack)
    }

    reset = () => this.setState({ error: null })

    render() {
      if (!this.state.error) return this.props.children
      return (
        <section className="surface active">
          <div className="status-panel">
            <p className="eyebrow error">▸ The Tape Caught</p>
            <p className="status-panel-body">
              Something tore on this page. The tape jammed.
            </p>
            <button className="btn primary" onClick={this.reset}>
              Try again
            </button>
          </div>
        </section>
      )
    }
  }
  ```

- [ ] **Step 2: Wrap routes in `src/App.jsx`** — current:

  ```jsx
  <AuthProvider>
    <BrowserRouter>
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        ...
      </Route>
    </Routes>
  </BrowserRouter>
  </AuthProvider>
  ```

  Replace with:
  ```jsx
  import ErrorBoundary from './components/ErrorBoundary'
  // (add this import alongside the others at the top)

  // …

  <AuthProvider>
    <BrowserRouter>
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="forum" element={<Forum />} />
            <Route path="library" element={<Library />} />
            <Route path="rituals" element={<Rituals />} />
            <Route path="u/:handle" element={<UserProfile />} />
            <Route path="profile" element={<RequireAuth><Profile /></RequireAuth>} />
            <Route path="auth/callback" element={<AuthCallback />} />
          </Route>
        </Routes>
      </ErrorBoundary>
    </BrowserRouter>
  </AuthProvider>
  ```

- [ ] **Step 3: Build**

  Run: `npm run build`
  Expected: success.

- [ ] **Step 4: Commit**

  ```bash
  git add src/components/ErrorBoundary.jsx src/App.jsx
  git commit -m "feat: ErrorBoundary at the route level

Any thrown error inside a page now renders a 'tape caught' fallback
with a retry button, instead of unmounting the whole shell. Reuses
the .status-panel class introduced earlier."
  ```

---

## Task 16: Fix mobile hero font size + AuthCallback timeout

**Files:**
- Modify: `src/style.css`, `src/pages/AuthCallback.jsx`

Two small bugs:
1. Mobile media query at line 800 sets `.hero h1 { font-size: 64px }`. The clamp on the desktop rule is `clamp(60px, 12vw, 160px)`. On a 760px viewport, clamp yields ~91px; on a 480px viewport, ~58px. The 64px override actually *increases* size on small phones while *decreasing* it on tablets. The intent was probably "cap on small screens" — but the clamp already handles that. Just remove the override; the clamp is already correct.
2. AuthCallback fallback timer is 3s. Some networks need more.

- [ ] **Step 1: Edit `src/style.css`** — in the `@media (max-width: 768px)` block (lines 796-805), remove this line:

  ```css
  .hero h1 { font-size: 64px; }
  ```

  Leave the rest of the block intact.

- [ ] **Step 2: Edit `src/pages/AuthCallback.jsx`** — change line 31:

  ```jsx
  }, 3000)
  ```
  to:
  ```jsx
  }, 5000)
  ```

- [ ] **Step 3: Build**

  Run: `npm run build`
  Expected: success.

- [ ] **Step 4: Commit**

  ```bash
  git add src/style.css src/pages/AuthCallback.jsx
  git commit -m "fix: respect hero h1 clamp on mobile; bump auth-callback fallback to 5s

The 64px mobile override was fighting the existing clamp(60px,12vw,
160px) — on tablets the clamp yielded ~91px and the override
shrank it; on phones it inflated. Removed the override.

Auth-callback fallback timer was 3s, tight on slow networks. 5s."
  ```

---

## Task 17: Final build verification

**Files:** none

Before deploy, confirm: build is clean, no console warnings, all routes resolve.

- [ ] **Step 1: Clean build**

  Run: `rm -rf dist && npm run build`
  Expected: `✓ built in <2s`, no errors, no warnings about missing imports.

- [ ] **Step 2: Preview build locally**

  Run: `npm run preview`
  Expected: dev server starts on http://localhost:4173

- [ ] **Step 3: Manual smoke test against the local preview**

  In a browser, visit each route and check:
  - http://localhost:4173/ — home renders, no live-strip, no waitlist. Tab title says "HORROR WRITER".
  - http://localhost:4173/forum — page renders, no New Thread button, no filter pills. Tab says "The Crypt · HORROR WRITER".
  - http://localhost:4173/library — page renders. Tab says "Library · HORROR WRITER".
  - http://localhost:4173/rituals — page renders, Submit/Read buttons are Soon chips. Tab says "Rituals · HORROR WRITER".
  - http://localhost:4173/u/nobody — shows "No such writer" panel.
  - http://localhost:4173/profile — redirects to sign-in if not authed.
  - Tab through interactive elements — every focusable element shows the cyan focus ring.
  - Open the sign-in modal → click passkey button → button is visibly disabled, no alert popup.

- [ ] **Step 4: No code change. Skip to next task.**

---

## Task 18: Deploy

**Files:** none

Push the cleaned-up code to GitHub, then deploy the built `dist/` to Cloudflare Pages.

- [ ] **Step 1: Push commits to origin**

  Run: `git push origin main`
  Expected: `<old-sha>..<new-sha>  main -> main`

- [ ] **Step 2: Build production bundle**

  Run: `rm -rf dist && npm run build`
  Expected: `dist/` populated, build OK.

- [ ] **Step 3: Deploy to Cloudflare Pages**

  Run:
  ```
  npx wrangler pages deploy dist --project-name=horrorwriter --branch=main --commit-dirty=true
  ```
  Expected: `✨ Deployment complete! Take a peek over at https://<hash>.horrorwriter.pages.dev`

- [ ] **Step 4: Verify live**

  Open https://horrorwriter.pages.dev/ — confirm home page renders, no live-strip, no waitlist. Click through to other routes via direct URLs (e.g. /forum, /u/test). Open sign-in modal — passkey button disabled, no alert.

- [ ] **Step 5: Done**

  No commit needed for the deploy itself.

---

## Out of scope (separate plans)

The following items from the design review are intentionally NOT in this plan because each is a substantial standalone initiative:

- **Wire Forum to Supabase** — full data model (threads, posts, categories, RLS, real-time subscriptions, moderation). Multi-day plan of its own.
- **Wire Library to Supabase** — works/excerpts data model, file storage for chapters, comments thread, badges.
- **Wire Rituals to Supabase** — prompts, submissions, voting, contest deadlines, leaderboard.
- **Passkey support** — already specified at `docs/superpowers/plans/2026-04-24-horrorwriter-react-migration.md` tasks 35-44.
- **Custom domain (`horrorwriter.org`)** — Cloudflare Pages custom domain + Supabase auth redirect URL update + WebAuthn `rp_id`/`origin` config.
- **Email/SMTP setup** — magic-link emails currently use Supabase's shared sender. Production should use a configured SMTP (SendGrid/Resend) with a real `From` address.
- **Onboarding banner dismissal memory** — banner currently nags forever. Worth saving a `localStorage` flag or `profiles.dismissed_onboarding_at` column.
- **HUD repositioning** — current `left:340px` magic number works but is brittle. Refactor with the eventual nav redesign.
- **VcrClock 1986/now date inconsistency** — minor: clock is current time, date is hardcoded "OCT 1986". Pick one canonical fiction-time.
- **Avatar cache-busting via DB version field** — current `?t=Date.now()` defeats CDN caching on every page load. Add a `profiles.avatar_version` integer that increments on upload and use it as the query param.
- **Home glitch effects consolidation** — two `useEffect` hooks (initial glitch + interval glitch) do one job. Combining is cosmetic.
- **Home setTimeout leak on unmount** — the inner `setTimeout` that removes the `.glitch` class can fire on a detached element. Currently null-checked and harmless.
- **Onboarding banner stickiness** — banner sits below sticky nav and scrolls away. Whether it should stick is a design decision, not a fix.
