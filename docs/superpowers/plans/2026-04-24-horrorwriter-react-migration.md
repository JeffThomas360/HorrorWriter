# HorrorWriter React Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the existing single-file VHS prototype (`index.html`) into the React + Vite skeleton in `src/`, ship real magic-link auth + optional passkey upgrade, and full profile editing with Supabase Storage avatars.

**Architecture:** Vite + React 19 SPA on Cloudflare Pages. Supabase for auth, Postgres, Storage, and Edge Functions (WebAuthn ceremonies). All routes client-side via `react-router-dom` v7 with `_redirects` SPA fallback.

**Tech Stack:** React 19, react-router-dom 7, Vite 7, @supabase/supabase-js 2, @simplewebauthn/server (Deno Edge Functions), @simplewebauthn/browser (client), Cloudflare Pages.

**Spec:** `docs/superpowers/specs/2026-04-24-horrorwriter-react-migration-design.md`

**Note on tests:** The spec explicitly excludes automated tests from V1. Verification in this plan is manual (run dev server, click through, check Supabase dashboard). Add tests in V2 once the surface stabilizes.

---

## Pre-flight

Before starting, confirm:
- [ ] You have a Supabase project created. Note its URL and anon key from Project Settings → API.
- [ ] You have the Supabase CLI installed (`npm install -g supabase` or via Scoop on Windows).
- [ ] You have logged in: `supabase login`.
- [ ] You have linked the project locally: `supabase link --project-ref <ref>` (run from repo root once).
- [ ] You have Node 20+ installed (`node --version`).

If any of these aren't done, do them now.

---

## Phase 0 — Setup & cleanup

### Task 1: Install dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install browser-side WebAuthn library**

```bash
npm install @simplewebauthn/browser@^11
```

- [ ] **Step 2: Verify install**

```bash
npm list @simplewebauthn/browser
```
Expected: shows `@simplewebauthn/browser@11.x.x`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @simplewebauthn/browser for passkey client"
```

---

### Task 2: Create `.env.example` and verify Supabase client

**Files:**
- Create: `.env.example`
- Verify: `src/supabaseClient.js` (already exists, no changes needed)

- [ ] **Step 1: Create `.env.example`**

```
# Copy this file to .env.local and fill in your Supabase project values.
# .env.local is gitignored.
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

- [ ] **Step 2: Confirm `.env.local` exists locally with real values**

If it doesn't exist:
```bash
cp .env.example .env.local
# then edit .env.local and paste your real Supabase URL + anon key
```

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "chore: add .env.example template for Supabase config"
```

---

### Task 3: Create SPA fallback for Cloudflare Pages

**Files:**
- Create: `public/_redirects`

- [ ] **Step 1: Create `public/_redirects`**

```
/*    /index.html   200
```

(That's it — one line. Trailing newline is fine.)

- [ ] **Step 2: Commit**

```bash
git add public/_redirects
git commit -m "chore: add SPA fallback for Cloudflare Pages"
```

---

### Task 4: Replace `index.html` with Vite shell

**Files:**
- Modify (replace contents): `index.html`

- [ ] **Step 1: Replace the entire file with the standard Vite React shell**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#0a0a12" />
    <meta name="description" content="A circle for those who write the dark. Forums, excerpts, prompts, and a coven of amateur horror writers." />
    <title>HORROR WRITER · A Circle for Those Who Write the Dark</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700;900&family=EB+Garamond:ital,wght@0,400;0,500;0,700;1,400&family=VT323&display=swap" rel="stylesheet" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "chore: replace prototype index.html with Vite shell"
```

(The `<style>` block and the prototype `<body>` content move to `src/style.css` and the React tree in subsequent tasks.)

---

### Task 5: Port CSS from prototype to `src/style.css`

**Files:**
- Modify (replace contents): `src/style.css`

- [ ] **Step 1: Replace `src/style.css` with the prototype's CSS**

The CSS lives in the original `index.html` between lines 13–652 (everything inside the `<style>` block, but NOT the `<style>` tags themselves). The prototype was deleted in Task 4, so retrieve it via git:

```bash
git show bbd118f:index.html > /tmp/proto.html
```

Then open `/tmp/proto.html` and copy lines 13–652 (the CSS body) into `src/style.css`.

After pasting, append this block at the end (ensures the React root stretches full height and adds textarea styling we'll need in Task 31):

```css
/* React root */
#root { min-height: 100vh; }

/* Textarea support inside .field wrapper */
.field textarea {
  background: none; border: none; outline: none;
  color: var(--bone); font-family: var(--mono); font-size: 17px;
  flex: 1; resize: vertical; min-height: 90px; width: 100%;
}
.field input[type="url"] { font-family: var(--mono); }
```

- [ ] **Step 2: Verify the file is roughly 650+ lines**

```bash
wc -l src/style.css
```
Expected: ~650 lines

- [ ] **Step 3: Commit**

```bash
git add src/style.css
git commit -m "feat(style): port VHS prototype CSS to src/style.css"
```

---

## Phase 1 — Layout, atmospherics, router

### Task 6: Create `Atmospherics` component

**Files:**
- Create: `src/components/Atmospherics.jsx`

- [ ] **Step 1: Create the file**

```jsx
import { useEffect, useState } from 'react'

export default function Atmospherics() {
  const [clock, setClock] = useState('00:00:00')

  useEffect(() => {
    const tick = () => {
      const d = new Date()
      const pad = (n) => String(n).padStart(2, '0')
      setClock(`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <>
      <div className="noise" />
      <div className="scanlines" />
      <div className="tracking" />
      <div className="vignette" />
      <div className="hud">
        <span><span className="rec" />REC · CH 03 · SP</span>
        <span>{clock}</span>
        <span>HORROR-WRITER · OCT 1986</span>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Atmospherics.jsx
git commit -m "feat(layout): add Atmospherics component (scanlines, HUD, clock)"
```

---

### Task 7: Create `Footer` component

**Files:**
- Create: `src/components/Footer.jsx`

- [ ] **Step 1: Create the file**

```jsx
import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer>
      <div>
        <div className="brand" style={{ marginBottom: 14 }}>
          <div className="brand-mark" />
          <div className="brand-name">HORROR WRITER<small>EST. THE WITCHING HOUR</small></div>
        </div>
        <p className="colophon">A circle for those who write the dark.<br />Hand-built, no algorithm, no ads.</p>
      </div>
      <div>
        <h5>The Site</h5>
        <ul>
          <li><Link to="/forum">Forums</Link></li>
          <li><Link to="/library">Library</Link></li>
          <li><Link to="/rituals">Rituals</Link></li>
          <li><Link to="/profile">Coven</Link></li>
        </ul>
      </div>
      <div>
        <h5>House</h5>
        <ul>
          <li><a href="#">House Rules</a></li>
          <li><a href="#">Critique Code</a></li>
          <li><a href="#">Content Warnings</a></li>
          <li><a href="#">Moderators</a></li>
        </ul>
      </div>
      <div>
        <h5>Quiet</h5>
        <ul>
          <li><a href="#">Privacy</a></li>
          <li><a href="#">Passkeys</a></li>
          <li><a href="#">RSS</a></li>
          <li><a href="#">Contact the Coven</a></li>
        </ul>
      </div>
    </footer>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Footer.jsx
git commit -m "feat(layout): add Footer component"
```

---

### Task 8: Create `Nav` component (no auth state yet)

**Files:**
- Create: `src/components/Nav.jsx`

This first version shows a static "Sign In" button. The full auth-aware version replaces it in Task 26.

- [ ] **Step 1: Create the file**

```jsx
import { NavLink, Link } from 'react-router-dom'

export default function Nav({ onSignInClick }) {
  return (
    <header className="nav">
      <Link to="/" className="brand">
        <div className="brand-mark" />
        <div>
          <div className="brand-name">HORROR WRITER<small>EST. THE WITCHING HOUR</small></div>
        </div>
      </Link>
      <nav className="nav-links">
        <NavLink to="/" end>Home</NavLink>
        <NavLink to="/forum">The Crypt</NavLink>
        <NavLink to="/library">Library</NavLink>
        <NavLink to="/rituals">Rituals</NavLink>
        <NavLink to="/profile">Coven</NavLink>
      </nav>
      <button className="nav-cta" onClick={onSignInClick}>Sign In</button>
    </header>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Nav.jsx
git commit -m "feat(layout): add Nav with router links"
```

---

### Task 9: Create `Layout` component (replaces existing)

**Files:**
- Modify (replace contents): `src/components/Layout.jsx`

- [ ] **Step 1: Replace the file**

```jsx
import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Atmospherics from './Atmospherics'
import Nav from './Nav'
import Footer from './Footer'

export default function Layout() {
  const [signinOpen, setSigninOpen] = useState(false)

  return (
    <>
      <Atmospherics />
      <Nav onSignInClick={() => setSigninOpen(true)} />
      <main className="shell">
        <Outlet context={{ openSignin: () => setSigninOpen(true) }} />
      </main>
      <Footer />
      {/* SignInModal is wired in Task 26 */}
    </>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Layout.jsx
git commit -m "feat(layout): replace Layout with VHS shell + atmospherics"
```

---

### Task 10: Update router and `App.jsx`

**Files:**
- Modify (replace contents): `src/App.jsx`
- Modify (verify): `src/main.jsx`

- [ ] **Step 1: Replace `src/App.jsx`**

```jsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import Forum from './pages/Forum'
import Library from './pages/Library'
import Rituals from './pages/Rituals'
import Profile from './pages/Profile'
import UserProfile from './pages/UserProfile'
import AuthCallback from './pages/AuthCallback'
import RequireAuth from './components/RequireAuth'

export default function App() {
  return (
    <BrowserRouter>
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
    </BrowserRouter>
  )
}
```

- [ ] **Step 2: Verify `src/main.jsx` mounts to `#root`**

Open `src/main.jsx`. The `createRoot` call should target `document.getElementById('root')` (NOT `'app'`). If it says `'app'`, change it. The file should look like:

```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './style.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

- [ ] **Step 3: Create stub pages so the build doesn't error**

Each of these files is overwritten in later phases. Create them now as placeholders:

`src/pages/Home.jsx`:
```jsx
export default function Home() { return <section className="surface active"><p>Home stub</p></section> }
```

`src/pages/Forum.jsx`:
```jsx
export default function Forum() { return <section className="surface active"><p>Forum stub</p></section> }
```

`src/pages/Library.jsx`:
```jsx
export default function Library() { return <section className="surface active"><p>Library stub</p></section> }
```

`src/pages/Rituals.jsx`:
```jsx
export default function Rituals() { return <section className="surface active"><p>Rituals stub</p></section> }
```

`src/pages/Profile.jsx`:
```jsx
export default function Profile() { return <section className="surface active"><p>Profile stub</p></section> }
```

`src/pages/UserProfile.jsx`:
```jsx
export default function UserProfile() { return <section className="surface active"><p>UserProfile stub</p></section> }
```

`src/pages/AuthCallback.jsx`:
```jsx
export default function AuthCallback() { return <section className="surface active"><p>AuthCallback stub</p></section> }
```

`src/components/RequireAuth.jsx`:
```jsx
export default function RequireAuth({ children }) { return children }
```

- [ ] **Step 4: Run the dev server and verify it boots**

```bash
npm run dev
```
Expected: Vite says "Local: http://localhost:5173/". Open that URL — you should see the atmospherics overlay, the nav, the footer, and "Home stub" in the middle.

- [ ] **Step 5: Click each nav link and verify the URL changes and the stub for that page renders**

Stop the dev server (`Ctrl+C`).

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx src/main.jsx src/pages/ src/components/RequireAuth.jsx
git commit -m "feat(router): wire BrowserRouter with stubs for all pages"
```

---

## Phase 2 — Static visual ports (mocked data, no auth needed)

### Task 11: Create mocked data files

**Files:**
- Create: `src/data/threads.js`
- Create: `src/data/books.js`
- Create: `src/data/prompts.js`

These are lifted directly from the prototype's `THREADS`, `BOOKS`, `PROMPTS` arrays.

- [ ] **Step 1: Create `src/data/threads.js`**

```js
export const THREADS = [
  { cat: 'crypt',    pin: true,  title: "My MC won't bleed. — first-person POV problem", by: 'lin-carver', av: 1, replies: 22, when: '14m', whenSmall: 'by roses-among-wires' },
  { cat: 'seance',   pin: false, title: 'How do you write quiet horror without it going limp?', by: 'marigold-rotten', av: 2, replies: 48, when: '1h', whenSmall: 'by theodora-bell' },
  { cat: 'crypt',    pin: false, title: 'Is it cheating if the monster is the narrator?', by: 'r-vespertine', av: 3, replies: 31, when: '2h', whenSmall: 'by lin-carver' },
  { cat: 'dispatch', pin: true,  title: 'Open submissions: Pseudopod, Nightmare, The Dark — April list', by: 'the-coven', av: 6, replies: 9, when: '4h', whenSmall: 'pinned' },
  { cat: 'seance',   pin: false, title: "Show me the worst opening line you've ever written.", by: 'theodora-bell', av: 4, replies: 204, when: '6h', whenSmall: 'by marigold-rotten' },
  { cat: 'hours',    pin: false, title: "What's playing on your turntable while you write?", by: 'roses-among-wires', av: 5, replies: 67, when: 'yesterday', whenSmall: 'by r-vespertine' },
  { cat: 'crypt',    pin: false, title: 'Critique wanted: 800-word vignette about a power outage', by: 'jasper-knell', av: 6, replies: 14, when: 'yesterday', whenSmall: 'by lin-carver' },
  { cat: 'seance',   pin: false, title: 'Pacing: when does dread tip into tedium?', by: 'el-prudhomme', av: 2, replies: 38, when: '2d', whenSmall: 'by marigold-rotten' },
  { cat: 'dispatch', pin: false, title: 'My agent is asking for comp titles. I write weird horror. Help.', by: 'darkfern', av: 3, replies: 26, when: '2d', whenSmall: 'by jasper-knell' },
  { cat: 'coven',    pin: true,  title: 'Read me first: the Critique Code', by: 'the-coven', av: 6, replies: 0, when: 'forever', whenSmall: 'locked' },
  { cat: 'hours',    pin: false, title: 'What did you read last that actually scared you?', by: 'corvid', av: 4, replies: 91, when: '3d', whenSmall: 'by marigold-rotten' },
  { cat: 'seance',   pin: false, title: 'Writing children without writing victims — a thread', by: 'marigold-rotten', av: 2, replies: 55, when: '3d', whenSmall: 'by darkfern' },
]

export const CATEGORIES = [
  { id: 'all',      name: 'All Threads',                count: 1284 },
  { id: 'crypt',    name: 'The Crypt · Critique',       count: 412 },
  { id: 'seance',   name: 'The Séance · Craft',         count: 298 },
  { id: 'dispatch', name: 'Dispatches · Market',        count: 186 },
  { id: 'hours',    name: 'After Hours',                count: 241 },
  { id: 'coven',    name: 'The Coven · Announcements',  count: 147 },
]

export const CAT_LABELS = {
  crypt: 'the crypt',
  seance: 'the séance',
  dispatch: 'dispatches',
  hours: 'after hours',
  coven: 'the coven',
}
```

- [ ] **Step 2: Create `src/data/books.js`**

```js
export const BOOKS = [
  { title: 'The Skin Below', by: '@marigold-rotten', lede: 'It started with the bath water turning the wrong color, and ended on the day my mother stopped speaking.', cover: 'red',  badge: 'NEW',      chapters: 'Ch. 1 of 12',          comments: 18 },
  { title: 'Static Mother', by: '@lin-carver', lede: 'The baby monitor began picking up something that had not yet been born.', cover: 'bone', badge: 'CRITIQUE', chapters: 'Short — 4,200 words', comments: 31 },
  { title: 'He Rents the Same Room Twice', by: '@r-vespertine', lede: 'By the third stay, the manager had stopped asking which version of him had checked in.', cover: 'cyan', badge: null, chapters: 'Novelette', comments: 12 },
  { title: 'Thirteen Crows for One Funeral', by: '@roses-among-wires', lede: 'They counted the crows the way the bell tolled — wrong, and again, and again.', cover: 'red', badge: null, chapters: 'Flash fiction', comments: 7 },
  { title: 'The Drowning Lessons', by: '@marigold-rotten', lede: 'My grandmother taught me to swim by holding me under until I forgot what air was for.', cover: 'bone', badge: 'CRITIQUE', chapters: 'Ch. 1 of ?', comments: 22 },
  { title: 'Static Lullaby', by: '@theodora-bell', lede: "The hum from the wall was a lullaby my husband recognized but couldn't have heard before.", cover: 'cyan', badge: null, chapters: 'Short', comments: 9 },
  { title: 'The House at the Bottom of the Phone Call', by: '@darkfern', lede: "My sister's voice on the line was familiar. The house behind it, less so.", cover: 'red', badge: 'NEW', chapters: 'Ch. 1 of 8', comments: 5 },
  { title: 'What Returns', by: '@el-prudhomme', lede: 'Whatever I had buried that summer kept arriving in the mail, postmarked from town names that did not exist.', cover: 'bone', badge: 'COMPLETE', chapters: 'Novella · 28k', comments: 44 },
]
```

- [ ] **Step 3: Create `src/data/prompts.js`**

```js
export const PROMPTS = [
  { week: 'Week 16', title: 'A House That Re-arranges Itself', lede: 'Write a horror story set in a house that subtly re-arranges itself between scenes. Never name the change.', entries: 54 },
  { week: 'Week 15', title: 'The Wrong Kind of Quiet', lede: "500–1,000 words. The horror is what should be making noise but isn't.", entries: 89 },
  { week: 'Week 14', title: 'A Stranger Who Knows You', lede: 'A character meets someone who recognises them from a life they have not lived.', entries: 73 },
  { week: 'Week 13', title: 'The Photograph', lede: 'Begin with a photograph of someone the narrator does not recognise. End with the narrator in it.', entries: 62 },
  { week: 'Week 12', title: 'At the Edge of the Lawn', lede: "All horror happens at the property line. Don't break it.", entries: 48 },
  { week: 'Week 11', title: 'What the Dog Sees', lede: 'Tell a horror story exclusively from the perspective of a household pet.', entries: 96 },
]

export const LEADERBOARD = [
  { rank: '01', name: 'Marigold Rotten',    work: '"The Skin Below" — 218 votes',                      pts: 218 },
  { rank: '02', name: 'Lin Carver',          work: '"Static Mother" — 194 votes',                       pts: 194 },
  { rank: '03', name: 'R. Vespertine',       work: '"He Rents the Same Room Twice" — 173 votes',        pts: 173 },
  { rank: '04', name: 'Roses Among Wires',   work: '"Thirteen Crows for One Funeral" — 162 votes',      pts: 162 },
  { rank: '05', name: 'Theodora Bell',       work: '"The Drowning Lessons" — 141 votes',                pts: 141 },
]
```

- [ ] **Step 4: Commit**

```bash
git add src/data/
git commit -m "feat(data): add mocked threads/books/prompts from prototype"
```

---

### Task 12: Build the Home page

**Files:**
- Modify (replace stub): `src/pages/Home.jsx`

- [ ] **Step 1: Replace the file**

```jsx
import { useEffect, useRef, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'

const NBSP = ' '
const HERO_TITLE = `HORROR${NBSP}WRITER`

export default function Home() {
  const { openSignin } = useOutletContext()
  const titleRef = useRef(null)
  const [liveWriters, setLiveWriters] = useState(47)

  // Glitch the hero title every 6.5s
  useEffect(() => {
    const id = setInterval(() => {
      const el = titleRef.current
      if (!el) return
      el.classList.add('glitch')
      setTimeout(() => el.classList.remove('glitch'), 800)
    }, 6500)
    return () => clearInterval(id)
  }, [])

  // Live writers drift
  useEffect(() => {
    const id = setInterval(() => {
      setLiveWriters((n) => {
        let next = n + Math.round((Math.random() - 0.5) * 4)
        if (next < 32) next = 32
        if (next > 71) next = 71
        return next
      })
    }, 3500)
    return () => clearInterval(id)
  }, [])

  return (
    <section className="surface active">
      <div className="hero">
        <div className="kicker">— CH 03 · 1986 PLAY ▶︎ —</div>
        <h1 ref={titleRef} data-text={HERO_TITLE}>{HERO_TITLE}</h1>
        <p className="sub">A circle for those who write the dark. Critique by candlelight, share what scares you, learn the craft from the coven.</p>
        <p className="sub2">Forums · Excerpts · Prompts · Pacts</p>
        <div className="hero-ctas">
          <button className="btn primary" onClick={openSignin}>Join the Circle</button>
          <Link className="btn ghost" to="/library">Browse the Library</Link>
        </div>
        <div className="live-strip">
          <span><span className="dot" /><b>{liveWriters}</b> writing now</span>
          <span><b>1,284</b> threads alive</span>
          <span><b>312</b> excerpts in the library</span>
          <span><b>9 days</b> until full moon contest</span>
        </div>
      </div>

      <div className="feature-grid">
        <Link className="tile hot" to="/rituals">
          <span className="tag">▸ Ritual of the Week</span>
          <h3>Write a story whose horror only resolves on the second read.</h3>
          <p>The deadline is Friday at midnight. 71 entries so far — judged by Cassidy V. (<i>The Hollow Year</i>).</p>
          <div className="meta">Closes in 4d 11h · Prize: hand-bound chapbook</div>
        </Link>
        <Link className="tile" to="/forum">
          <span className="tag">▸ Hot in The Crypt</span>
          <h3>"My MC won't bleed." — first-person POV problem</h3>
          <p>22 replies. Roses, Lin, and the usual suspects show up swinging.</p>
          <div className="meta">last reply 14m ago</div>
        </Link>
        <Link className="tile" to="/library">
          <span className="tag">▸ Newly Shared</span>
          <h3>The Skin Below — Ch. 1</h3>
          <p>"It started with the bath water turning the wrong color, and ended on the day my mother stopped speaking."</p>
          <div className="meta">by @marigold-rotten · seeking critique</div>
        </Link>
      </div>

      <div className="divider" />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'center' }} id="why-grid">
        <div>
          <p className="eyebrow">▸ What this is</p>
          <h2 className="title">A coven, <em>not</em> a feed.</h2>
          <p style={{ color: 'var(--bone-dim)', fontSize: 18, maxWidth: 520 }}>
            Horror Writer is a small, slow community for amateurs and apprentices.
            Threads don't disappear under algorithms. Critique is offered the way
            a candle is passed: carefully, in a circle, never thrown.
          </p>
          <p style={{ color: 'var(--bone-dim)', fontSize: 18, marginTop: 14, maxWidth: 520 }}>
            We ask only that you sign your name, leave the lights off, and read
            what others bleed onto the page before asking them to read yours.
          </p>
        </div>
        <ul style={{ listStyle: 'none', display: 'grid', gap: 14 }}>
          <li className="tile"><span className="tag">No algorithm</span><h3 style={{ fontSize: 22 }}>Chronological forums.</h3><p>Old wounds stay open. The good thread from 2003 is still on page 1 if it's still alive.</p></li>
          <li className="tile"><span className="tag">No tracking</span><h3 style={{ fontSize: 22 }}>Passkeys, not passwords.</h3><p>Sign in with your face or your fingerprint. We never see, never store, a password.</p></li>
          <li className="tile"><span className="tag">No bots</span><h3 style={{ fontSize: 22 }}>Hand-vetted entry.</h3><p>The first post you write is read by a human before you join. It's not gatekeeping. It's hospitality.</p></li>
        </ul>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Verify in dev server**

```bash
npm run dev
```
Visit `http://localhost:5173/`. You should see the full hero, live strip drifting, three feature tiles, and the "What this is" section. The hero title should occasionally glitch.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Home.jsx
git commit -m "feat(pages): port Home page from prototype"
```

---

### Task 13: Build the Forum page (The Crypt)

**Files:**
- Modify (replace stub): `src/pages/Forum.jsx`

- [ ] **Step 1: Replace the file**

```jsx
import { useState, useMemo } from 'react'
import { THREADS, CATEGORIES, CAT_LABELS } from '../data/threads'

export default function Forum() {
  const [activeCat, setActiveCat] = useState('all')
  const [query, setQuery] = useState('')

  const visible = useMemo(() => {
    const filtered = activeCat === 'all' ? THREADS : THREADS.filter(t => t.cat === activeCat)
    if (!query.trim()) return filtered
    const q = query.toLowerCase()
    return filtered.filter(t =>
      t.title.toLowerCase().includes(q) ||
      t.by.toLowerCase().includes(q) ||
      (CAT_LABELS[t.cat] || '').includes(q)
    )
  }, [activeCat, query])

  return (
    <section className="surface active">
      <p className="eyebrow">▸ The Forums</p>
      <h2 className="title">The <em>Crypt</em></h2>
      <p className="lede">Where the conversations live. Pick a category, or search the dark.</p>

      <div className="forum-grid">
        <aside>
          <ul className="cat-list">
            {CATEGORIES.map(c => (
              <li
                key={c.id}
                className={c.id === activeCat ? 'active' : ''}
                onClick={() => setActiveCat(c.id)}
              >
                <span className="name">{c.name}</span>
                <span className="count">{c.count.toLocaleString()}</span>
              </li>
            ))}
          </ul>

          <div style={{ marginTop: 24, padding: 18, border: '1px dashed rgba(243,236,217,.18)', borderRadius: 'var(--r)' }}>
            <div className="eyebrow" style={{ marginBottom: 6, fontSize: 14 }}>▸ House Rules</div>
            <p style={{ color: 'var(--bone-dim)', fontSize: 15, fontStyle: 'italic' }}>
              Read before posting. Critique is a gift; cruelty is not.
              Spoilers warned. No promo without a story attached.
            </p>
          </div>
        </aside>

        <div>
          <div className="forum-tools">
            <div className="search">
              <input
                placeholder="search threads, authors, tags…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <button className="btn cyan" disabled title="V2: real thread creation">+ New Thread</button>
          </div>

          <div className="cat-pill-row">
            <span className="cat-pill active">Latest</span>
            <span className="cat-pill">Unread</span>
            <span className="cat-pill">Stickied</span>
            <span className="cat-pill">Pinned by Coven</span>
          </div>

          <div>
            {visible.map((t, i) => (
              <div key={i} className="thread">
                <div className={`avatar av-${t.av}`}>{t.by[0].toUpperCase()}</div>
                <div className="body">
                  <h4>
                    {t.pin && <span className="pin">▣ PINNED</span>}
                    {t.title}
                  </h4>
                  <div className="by">▸ <b>@{t.by}</b> · in <i>{CAT_LABELS[t.cat] || t.cat}</i></div>
                </div>
                <div className="replies"><b>{t.replies}</b><small>replies</small></div>
                <div className="when">{t.when}<small>{t.whenSmall}</small></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Verify in dev server**

Visit `http://localhost:5173/forum`. Verify:
- Category sidebar filters threads when clicked
- Search filters threads (try typing "static")
- "+ New Thread" button is disabled (V2)
- Pinned threads show the ▣ PINNED label

- [ ] **Step 3: Commit**

```bash
git add src/pages/Forum.jsx
git commit -m "feat(pages): port Forum (The Crypt) with category and search filters"
```

---

### Task 14: Build the Library page

**Files:**
- Modify (replace stub): `src/pages/Library.jsx`

- [ ] **Step 1: Replace the file**

```jsx
import { BOOKS } from '../data/books'

const FILTERS = ['All', 'Newly shared', 'Seeking critique', 'Completed', 'Short fiction', 'Novel-in-progress']

export default function Library() {
  return (
    <section className="surface active">
      <p className="eyebrow">▸ The Library</p>
      <h2 className="title">Book <em>Shares</em></h2>
      <p className="lede">Excerpts, opening chapters, in-progress tomes. Read with care, comment with care.</p>

      <div className="cat-pill-row">
        {FILTERS.map((f, i) => (
          <span key={f} className={`cat-pill ${i === 0 ? 'active' : ''}`}>{f}</span>
        ))}
      </div>

      <div className="lib-grid">
        {BOOKS.map((b, i) => (
          <article key={i} className="book">
            <div className={`cover ${b.cover}`}>
              {b.badge && (
                <span className={`badge ${b.badge === 'NEW' ? 'cyan' : b.badge === 'COMPLETE' ? 'gold' : ''}`}>
                  {b.badge}
                </span>
              )}
              <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <filter id={`b${b.cover}-${i}`}>
                    <feTurbulence baseFrequency=".7" numOctaves="2" />
                    <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .9 0" />
                  </filter>
                </defs>
                <rect width="200" height="200" filter={`url(#b${b.cover}-${i})`} />
              </svg>
              <div className="title">{b.title}</div>
            </div>
            <div className="meta">
              <div className="by">{b.by}</div>
              <h3>{b.title}</h3>
              <p>"{b.lede}"</p>
              <div className="row"><span>▸ {b.chapters}</span><span>{b.comments} comments</span></div>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Verify in dev server**

Visit `http://localhost:5173/library`. Verify all 8 books render with their covers, badges (NEW/CRITIQUE/COMPLETE), and metadata.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Library.jsx
git commit -m "feat(pages): port Library (book shares grid)"
```

---

### Task 15: Build the Rituals page

**Files:**
- Modify (replace stub): `src/pages/Rituals.jsx`

- [ ] **Step 1: Replace the file**

```jsx
import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { PROMPTS, LEADERBOARD } from '../data/prompts'

const pad = (n) => String(n).padStart(2, '0')

export default function Rituals() {
  const { openSignin } = useOutletContext()
  const [cd, setCd] = useState({ d: 4, h: 11, m: 23, s: 7 })

  useEffect(() => {
    const id = setInterval(() => {
      setCd((prev) => {
        let { d, h, m, s } = prev
        s -= 1
        if (s < 0) { s = 59; m -= 1 }
        if (m < 0) { m = 59; h -= 1 }
        if (h < 0) { h = 23; d -= 1 }
        if (d < 0) { d = 4; h = 11; m = 23; s = 7 }
        return { d, h, m, s }
      })
    }, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <section className="surface active">
      <p className="eyebrow">▸ The Rituals</p>
      <h2 className="title">Prompts &amp; <em>Pacts</em></h2>
      <p className="lede">Weekly prompts. Monthly contests. Old prompts never die — they wait for new writers.</p>

      <div className="ritual-hero">
        <div className="num">▸ Week 17 · Ritual of the Week</div>
        <h3>The Second Reading</h3>
        <blockquote>
          Write a horror story (under 1,500 words) whose true horror is invisible on the first read,
          but unmistakable on the second. Plant the seed. Pretend you didn't.
        </blockquote>
        <div className="row-flex">
          <div className="countdown">
            <div className="unit"><b>{pad(cd.d)}</b><small>days</small></div>
            <div className="unit"><b>{pad(cd.h)}</b><small>hrs</small></div>
            <div className="unit"><b>{pad(cd.m)}</b><small>min</small></div>
            <div className="unit"><b>{pad(cd.s)}</b><small>sec</small></div>
          </div>
          <button className="btn primary" onClick={openSignin}>Submit Entry</button>
          <span style={{ fontFamily: 'var(--mono)', color: 'var(--cyan)', letterSpacing: '.18em' }}>
            71 entries · judged by Cassidy V.
          </span>
        </div>
      </div>

      <h3 style={{ fontFamily: 'var(--serif)', fontSize: 24, letterSpacing: '.1em', color: 'var(--bone)', marginBottom: 18 }}>PAST PROMPTS</h3>
      <div className="ritual-list">
        {PROMPTS.map((p) => (
          <div key={p.week} className="ritual">
            <div className="week">▸ {p.week}</div>
            <h4>{p.title}</h4>
            <p>"{p.lede}"</p>
            <div className="stat">{p.entries} entries · winners archived</div>
          </div>
        ))}
      </div>

      <div className="leaderboard">
        <div className="head">▸ The Black Quill · April Standings</div>
        {LEADERBOARD.map((row) => (
          <div key={row.rank} className="row">
            <div className="rank">{row.rank}</div>
            <div className="name">{row.name}<small>{row.work}</small></div>
            <div className="pts">{row.pts} PTS</div>
          </div>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Verify in dev server**

Visit `http://localhost:5173/rituals`. Verify:
- Featured ritual shows with a live countdown
- Past prompts grid shows all 6 entries
- Leaderboard renders 5 ranks

- [ ] **Step 3: Commit**

```bash
git add src/pages/Rituals.jsx
git commit -m "feat(pages): port Rituals page with countdown and leaderboard"
```

---

### Task 16: Verify all static routes

- [ ] **Step 1: Run dev server**

```bash
npm run dev
```

- [ ] **Step 2: Click through every nav item**

Verify Home, The Crypt, Library, Rituals each render their full content. The "Coven" link goes to `/profile` which still shows a stub — that's expected, we wire it in Phase 5.

- [ ] **Step 3: Verify visual parity with the prototype**

You can compare side-by-side by viewing the original prototype:
```bash
git show bbd118f:index.html > /tmp/proto.html
# open /tmp/proto.html in a separate browser tab
```
The atmospherics, fonts, colors, and layout should match.

- [ ] **Step 4: Stop dev server (`Ctrl+C`)**

No commit — this task is verification only.

---

## Phase 3 — Database setup

### Task 17: Initialize Supabase locally and create migration `0001_profiles.sql`

**Files:**
- Create: `supabase/migrations/0001_profiles.sql`

- [ ] **Step 1: Initialize Supabase locally if not done**

```bash
supabase init
```
Expected: creates `supabase/config.toml`. If already initialized, you'll see "supabase project is already initialized".

- [ ] **Step 2: Create the migration file**

```sql
-- profiles: 1:1 with auth.users, auto-created on signup
create table public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  handle          text unique not null,
  display_name    text,
  bio             text,
  location        text,
  pronouns        text,
  website_url     text,
  avatar_url      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index profiles_handle_idx on public.profiles (handle);

-- Auto-update updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create profile row on user signup with random handle 'user-xxxxxx'
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  new_handle text;
begin
  loop
    new_handle := 'user-' || substr(md5(random()::text || clock_timestamp()::text), 1, 6);
    exit when not exists (select 1 from public.profiles where handle = new_handle);
  end loop;
  insert into public.profiles (id, handle) values (new.id, new_handle);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS
alter table public.profiles enable row level security;

create policy "Profiles are publicly readable"
  on public.profiles for select using (true);

create policy "Users can update their own profile"
  on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- No insert policy — only the trigger inserts (security definer)
```

- [ ] **Step 3: Commit**

```bash
git add supabase/config.toml supabase/migrations/0001_profiles.sql
git commit -m "feat(db): add profiles table with auto-handle trigger and RLS"
```

---

### Task 18: Create migration `0002_passkeys.sql`

**Files:**
- Create: `supabase/migrations/0002_passkeys.sql`

- [ ] **Step 1: Create the file**

```sql
create table public.passkeys (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  credential_id   text unique not null,
  public_key      text not null,
  counter         bigint not null default 0,
  device_name     text,
  created_at      timestamptz not null default now(),
  last_used_at    timestamptz
);

create index passkeys_user_id_idx on public.passkeys (user_id);
create index passkeys_credential_id_idx on public.passkeys (credential_id);

alter table public.passkeys enable row level security;

create policy "Users can view their own passkeys"
  on public.passkeys for select using (auth.uid() = user_id);

-- No insert/update/delete policies — only Edge Functions (service role) write to this table.
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0002_passkeys.sql
git commit -m "feat(db): add passkeys table with user-scoped read RLS"
```

---

### Task 19: Create migration `0003_webauthn_challenges.sql`

**Files:**
- Create: `supabase/migrations/0003_webauthn_challenges.sql`

- [ ] **Step 1: Create the file**

```sql
create table public.webauthn_challenges (
  id              uuid primary key default gen_random_uuid(),
  challenge       text not null,
  user_id         uuid references auth.users(id) on delete cascade,
  purpose         text not null check (purpose in ('register', 'authenticate')),
  created_at      timestamptz not null default now()
);

create index webauthn_challenges_challenge_idx on public.webauthn_challenges (challenge);

alter table public.webauthn_challenges enable row level security;

-- No policies — clients have zero access. Only Edge Functions (service role) read/write.
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0003_webauthn_challenges.sql
git commit -m "feat(db): add webauthn_challenges table for ceremony state"
```

---

### Task 20: Create migration `0004_storage_avatars.sql`

**Files:**
- Create: `supabase/migrations/0004_storage_avatars.sql`

- [ ] **Step 1: Create the file**

```sql
-- Create the avatars bucket if it doesn't exist
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Public read for avatars
create policy "Avatars are publicly readable"
  on storage.objects for select
  using (bucket_id = 'avatars');

-- Users can write only to their own folder: <user_id>/...
create policy "Users can upload their own avatar"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can update their own avatar"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can delete their own avatar"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0004_storage_avatars.sql
git commit -m "feat(db): add avatars storage bucket with per-user folder RLS"
```

---

### Task 21: Apply migrations to Supabase

- [ ] **Step 1: Push migrations**

```bash
supabase db push
```
Expected: ends with `Finished supabase db push.` and lists all 4 migrations.

If you get "no project linked", run:
```bash
supabase link --project-ref <your-project-ref>
```
Then retry the push.

- [ ] **Step 2: Verify in Supabase dashboard**

Open your project's Table Editor. You should see `profiles`, `passkeys`, `webauthn_challenges` tables. Open Storage. You should see the `avatars` bucket.

- [ ] **Step 3: Test the auto-profile trigger**

In the Supabase dashboard SQL Editor:
```sql
select id, handle, created_at from public.profiles order by created_at desc limit 5;
```
Should return any existing users' profiles. If the table is empty (no users yet), that's fine — the trigger will fire when you sign up in Phase 4.

No commit — migrations are already committed.

---

## Phase 4 — Auth foundation (magic link)

### Task 22: Create `lib/auth.js`

**Files:**
- Create: `src/lib/auth.js`

- [ ] **Step 1: Create the file**

```js
import { supabase } from '../supabaseClient'

export async function signInWithMagicLink(email) {
  if (!supabase) throw new Error('Supabase client not configured')
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${window.location.origin}/auth/callback`,
    },
  })
  if (error) throw error
}

export async function signOut() {
  if (!supabase) throw new Error('Supabase client not configured')
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/auth.js
git commit -m "feat(auth): add magic-link sign-in and sign-out helpers"
```

---

### Task 23: Create `AuthContext`

**Files:**
- Create: `src/contexts/AuthContext.jsx`

- [ ] **Step 1: Create the file**

```jsx
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  // Initial session + subscribe to changes
  useEffect(() => {
    if (!supabase) { setLoading(false); return }
    let mounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess)
    })

    return () => {
      mounted = false
      sub?.subscription?.unsubscribe()
    }
  }, [])

  // Fetch profile whenever session changes
  useEffect(() => {
    if (!supabase || !session?.user) { setProfile(null); return }
    let mounted = true

    supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single()
      .then(({ data, error }) => {
        if (!mounted) return
        if (error) {
          console.error('Failed to load profile:', error)
          setProfile(null)
        } else {
          setProfile(data)
        }
      })

    return () => { mounted = false }
  }, [session])

  const refreshProfile = async () => {
    if (!supabase || !session?.user) return
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single()
    if (!error) setProfile(data)
  }

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, profile, loading, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
```

- [ ] **Step 2: Commit**

```bash
git add src/contexts/AuthContext.jsx
git commit -m "feat(auth): add AuthContext with session and profile state"
```

---

### Task 24: Wire `AuthProvider` into the app

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Wrap the router in `AuthProvider`**

Replace `src/App.jsx` with:

```jsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import Layout from './components/Layout'
import Home from './pages/Home'
import Forum from './pages/Forum'
import Library from './pages/Library'
import Rituals from './pages/Rituals'
import Profile from './pages/Profile'
import UserProfile from './pages/UserProfile'
import AuthCallback from './pages/AuthCallback'
import RequireAuth from './components/RequireAuth'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
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
      </BrowserRouter>
    </AuthProvider>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/App.jsx
git commit -m "feat(auth): wrap router with AuthProvider"
```

---

### Task 25: Create `SignInModal` (magic-link only — passkey button added in Task 43)

**Files:**
- Create: `src/components/SignInModal.jsx`

- [ ] **Step 1: Create the file**

```jsx
import { useState } from 'react'
import { signInWithMagicLink } from '../lib/auth'

export default function SignInModal({ open, onClose }) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('idle') // idle | sending | sent | error
  const [errorMsg, setErrorMsg] = useState('')

  if (!open) return null

  const onSubmit = async (e) => {
    e.preventDefault()
    setStatus('sending')
    setErrorMsg('')
    try {
      await signInWithMagicLink(email.trim())
      setStatus('sent')
    } catch (err) {
      console.error(err)
      setErrorMsg(err.message || 'Something went wrong.')
      setStatus('error')
    }
  }

  const reset = () => {
    setEmail('')
    setStatus('idle')
    setErrorMsg('')
    onClose()
  }

  return (
    <div className="modal-back open" onClick={(e) => { if (e.target === e.currentTarget) reset() }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="signin-title">
        <button className="close" onClick={reset} aria-label="Close">✕</button>
        <h3 id="signin-title">Sign In to the Circle</h3>
        <p className="lede">No passwords. Enter your email and we'll send you a one-time link.</p>

        {status === 'sent' ? (
          <div style={{ padding: '20px 0', textAlign: 'center' }}>
            <p style={{ color: 'var(--cyan)', fontFamily: 'var(--mono)', letterSpacing: '.2em', textTransform: 'uppercase', marginBottom: 8 }}>
              ✓ Link sent
            </p>
            <p style={{ color: 'var(--bone-dim)', fontStyle: 'italic' }}>
              Check {email}. The link expires in 1 hour.
            </p>
          </div>
        ) : (
          <form onSubmit={onSubmit}>
            <div className="field">
              <input
                type="email"
                placeholder="your@email.address"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={status === 'sending'}
              />
            </div>
            <button
              type="submit"
              className="btn primary"
              style={{ width: '100%', justifyContent: 'center' }}
              disabled={status === 'sending' || !email.trim()}
            >
              {status === 'sending' ? 'Sending…' : '▸ Email me a magic link'}
            </button>
            {errorMsg && (
              <p style={{ marginTop: 14, color: 'var(--blood)', fontFamily: 'var(--mono)', fontSize: 14, textAlign: 'center' }}>
                {errorMsg}
              </p>
            )}
            <p className="small">By signing in you agree to read others before asking them to read you.</p>
          </form>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/SignInModal.jsx
git commit -m "feat(auth): add SignInModal with magic-link form"
```

---

### Task 26: Wire `SignInModal` into `Layout` and add user menu to `Nav`

**Files:**
- Modify: `src/components/Layout.jsx`
- Modify: `src/components/Nav.jsx`

- [ ] **Step 1: Update `Layout.jsx` to render the modal**

```jsx
import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Atmospherics from './Atmospherics'
import Nav from './Nav'
import Footer from './Footer'
import SignInModal from './SignInModal'

export default function Layout() {
  const [signinOpen, setSigninOpen] = useState(false)

  return (
    <>
      <Atmospherics />
      <Nav onSignInClick={() => setSigninOpen(true)} />
      <main className="shell">
        <Outlet context={{ openSignin: () => setSigninOpen(true) }} />
      </main>
      <Footer />
      <SignInModal open={signinOpen} onClose={() => setSigninOpen(false)} />
    </>
  )
}
```

- [ ] **Step 2: Replace `Nav.jsx` with the auth-aware version**

```jsx
import { useState } from 'react'
import { NavLink, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { signOut } from '../lib/auth'

export default function Nav({ onSignInClick }) {
  const { user, profile, loading } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header className="nav">
      <Link to="/" className="brand">
        <div className="brand-mark" />
        <div>
          <div className="brand-name">HORROR WRITER<small>EST. THE WITCHING HOUR</small></div>
        </div>
      </Link>
      <nav className="nav-links">
        <NavLink to="/" end>Home</NavLink>
        <NavLink to="/forum">The Crypt</NavLink>
        <NavLink to="/library">Library</NavLink>
        <NavLink to="/rituals">Rituals</NavLink>
        <NavLink to="/profile">Coven</NavLink>
      </nav>
      {loading ? null : user ? (
        <div style={{ position: 'relative' }}>
          <button className="nav-cta" onClick={() => setMenuOpen((o) => !o)}>
            {profile?.handle ? `@${profile.handle}` : 'Account'} ▾
          </button>
          {menuOpen && (
            <div
              style={{
                position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                background: 'var(--ink-2)', border: '1px solid var(--blood)',
                padding: '10px 0', minWidth: 180, zIndex: 70,
                fontFamily: 'var(--mono)', letterSpacing: '.1em',
              }}
              onMouseLeave={() => setMenuOpen(false)}
            >
              <Link
                to="/profile"
                style={{ display: 'block', padding: '8px 16px', color: 'var(--bone)' }}
                onClick={() => setMenuOpen(false)}
              >
                Edit profile
              </Link>
              <button
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 16px', color: 'var(--blood)' }}
                onClick={async () => { setMenuOpen(false); await signOut() }}
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      ) : (
        <button className="nav-cta" onClick={onSignInClick}>Sign In</button>
      )}
    </header>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/Layout.jsx src/components/Nav.jsx
git commit -m "feat(auth): wire SignInModal and user menu into nav"
```

---

### Task 27: Create `AuthCallback` page

**Files:**
- Modify (replace stub): `src/pages/AuthCallback.jsx`

- [ ] **Step 1: Replace the file**

```jsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

export default function AuthCallback() {
  const navigate = useNavigate()
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!supabase) { setError('Supabase not configured.'); return }
    let cancelled = false

    const check = async () => {
      const { data, error } = await supabase.auth.getSession()
      if (cancelled) return
      if (error) { setError(error.message); return }
      if (data.session) {
        navigate('/', { replace: true })
        return
      }
      // Session not yet established — listen and wait
      const { data: sub } = supabase.auth.onAuthStateChange((_e, sess) => {
        if (sess && !cancelled) {
          sub.subscription.unsubscribe()
          navigate('/', { replace: true })
        }
      })
      // 10-second safety net
      setTimeout(() => {
        if (cancelled) return
        sub.subscription.unsubscribe()
        setError("Couldn't establish a session. The link may have expired.")
      }, 10000)
    }
    check()
    return () => { cancelled = true }
  }, [navigate])

  return (
    <section className="surface active">
      <div style={{ padding: '80px 0', textAlign: 'center' }}>
        {error ? (
          <>
            <p className="eyebrow" style={{ color: 'var(--blood)' }}>▸ Sign-in failed</p>
            <p style={{ color: 'var(--bone-dim)', fontStyle: 'italic', marginTop: 18 }}>{error}</p>
          </>
        ) : (
          <>
            <p className="eyebrow">▸ Confirming the sigil…</p>
            <p style={{ color: 'var(--bone-dim)', fontStyle: 'italic', marginTop: 18 }}>One moment.</p>
          </>
        )}
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Add the redirect URL to your Supabase project**

Go to Supabase dashboard → Authentication → URL Configuration → Redirect URLs.

Add:
- `http://localhost:5173/auth/callback`
- `https://horrorwriter.org/auth/callback` (or your eventual production domain)

Save.

- [ ] **Step 3: Commit**

```bash
git add src/pages/AuthCallback.jsx
git commit -m "feat(auth): handle magic-link callback and redirect home"
```

---

### Task 28: End-to-end magic-link test

- [ ] **Step 1: Run dev server**

```bash
npm run dev
```

- [ ] **Step 2: Sign up**

Click "Sign In" → enter your real email → click "Email me a magic link" → see "Link sent" confirmation. Check your inbox.

- [ ] **Step 3: Click the link**

You should land on `/auth/callback` for a moment, then redirect to `/`. The nav should now show `@user-xxxxxx ▾` instead of "Sign In".

- [ ] **Step 4: Verify the profile row was created**

In Supabase dashboard → Table Editor → `profiles`. You should see one row with your `auth.users.id`, an auto-generated `handle` like `user-a8f2c1`, and `created_at` of just now.

- [ ] **Step 5: Sign out**

Click `@user-...` → "Sign out". The nav should return to "Sign In".

- [ ] **Step 6: Stop dev server**

No commit — verification only. If anything broke, debug before moving on.

---

## Phase 5 — Profile read/edit

### Task 29: Create `lib/profile.js`

**Files:**
- Create: `src/lib/profile.js`

- [ ] **Step 1: Create the file**

```js
import { supabase } from '../supabaseClient'

export async function getProfileByHandle(handle) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('handle', handle)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function updateProfile(userId, fields) {
  if (!supabase) throw new Error('Supabase not configured')
  // fields: { handle, display_name, bio, location, pronouns, website_url, avatar_url }
  const { data, error } = await supabase
    .from('profiles')
    .update(fields)
    .eq('id', userId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function uploadAvatar(userId, file) {
  if (!supabase) throw new Error('Supabase not configured')
  const ext = file.name.split('.').pop().toLowerCase()
  const path = `${userId}/avatar.${ext}`
  const { error: uploadErr } = await supabase
    .storage.from('avatars')
    .upload(path, file, { upsert: true, contentType: file.type })
  if (uploadErr) throw uploadErr

  // Public URL with cache-busting param so the new image shows immediately
  const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
  return `${pub.publicUrl}?t=${Date.now()}`
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/profile.js
git commit -m "feat(profile): add getProfileByHandle, updateProfile, uploadAvatar"
```

---

### Task 30: Create `RequireAuth` component

**Files:**
- Modify (replace stub): `src/components/RequireAuth.jsx`

- [ ] **Step 1: Replace the file**

```jsx
import { useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  const { openSignin } = useOutletContext()

  useEffect(() => {
    if (!loading && !user) openSignin()
  }, [loading, user, openSignin])

  if (loading) {
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
        </div>
      </section>
    )
  }

  return children
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/RequireAuth.jsx
git commit -m "feat(auth): RequireAuth gate that prompts sign-in"
```

---

### Task 31: Create `Profile` page (own editor)

**Files:**
- Modify (replace stub): `src/pages/Profile.jsx`

- [ ] **Step 1: Replace the file**

```jsx
import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { updateProfile, uploadAvatar } from '../lib/profile'

const HANDLE_RE = /^[a-z0-9-]{3,30}$/

export default function Profile() {
  const { user, profile, refreshProfile } = useAuth()
  const [form, setForm] = useState({
    handle: '', display_name: '', bio: '', location: '', pronouns: '', website_url: '',
  })
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState(null) // null | 'saved' | { error: string }
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (profile) {
      setForm({
        handle: profile.handle || '',
        display_name: profile.display_name || '',
        bio: profile.bio || '',
        location: profile.location || '',
        pronouns: profile.pronouns || '',
        website_url: profile.website_url || '',
      })
    }
  }, [profile])

  if (!profile) {
    return (
      <section className="surface active">
        <div style={{ padding: '60px 0', textAlign: 'center' }}>
          <p className="eyebrow">▸ Loading profile…</p>
        </div>
      </section>
    )
  }

  const onChange = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const onSave = async (e) => {
    e.preventDefault()
    setStatus(null)
    if (!HANDLE_RE.test(form.handle)) {
      setStatus({ error: 'Handle must be 3–30 chars: a–z, 0–9, hyphens only.' })
      return
    }
    setSaving(true)
    try {
      await updateProfile(user.id, form)
      await refreshProfile()
      setStatus('saved')
    } catch (err) {
      setStatus({ error: err.message || 'Save failed.' })
    } finally {
      setSaving(false)
    }
  }

  const onAvatarPick = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setStatus(null)
    try {
      const url = await uploadAvatar(user.id, file)
      await updateProfile(user.id, { avatar_url: url })
      await refreshProfile()
      setStatus('saved')
    } catch (err) {
      setStatus({ error: err.message || 'Avatar upload failed.' })
    } finally {
      setUploading(false)
      e.target.value = '' // allow re-picking the same file
    }
  }

  const initial = (profile.display_name?.[0] || profile.handle?.[0] || '?').toUpperCase()

  return (
    <section className="surface active">
      <p className="eyebrow">▸ Your account</p>
      <h2 className="title">Edit <em>profile</em></h2>

      <div className="profile-head">
        {profile.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt=""
            style={{ width: 160, height: 160, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--blood)' }}
          />
        ) : (
          <div className="profile-avatar">{initial}</div>
        )}
        <div className="profile-info">
          <h3>{profile.display_name || profile.handle}</h3>
          <div className="handle">@{profile.handle}</div>
          <p className="joined">
            Joined {new Date(profile.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
          </p>
          <label className="btn ghost" style={{ marginTop: 14, cursor: 'pointer', display: 'inline-flex' }}>
            {uploading ? 'Uploading…' : '▸ Change avatar'}
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={onAvatarPick} style={{ display: 'none' }} disabled={uploading} />
          </label>
        </div>
      </div>

      <form onSubmit={onSave} style={{ display: 'grid', gap: 18, maxWidth: 640 }}>
        <Field label="Handle" hint="Lowercase, numbers and hyphens only. Used in your profile URL.">
          <input value={form.handle} onChange={onChange('handle')} required />
        </Field>
        <Field label="Display name">
          <input value={form.display_name} onChange={onChange('display_name')} placeholder="What you'd like to be called" />
        </Field>
        <Field label="Bio">
          <textarea value={form.bio} onChange={onChange('bio')} rows={4} placeholder="What you write. What you read. What gets stuck in the bath drain." />
        </Field>
        <Field label="Location">
          <input value={form.location} onChange={onChange('location')} placeholder="Ohio" />
        </Field>
        <Field label="Pronouns">
          <input value={form.pronouns} onChange={onChange('pronouns')} placeholder="she/her, they/them, …" />
        </Field>
        <Field label="Website">
          <input value={form.website_url} onChange={onChange('website_url')} placeholder="https://…" type="url" />
        </Field>

        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? 'Saving…' : '▸ Save changes'}
          </button>
          {status === 'saved' && <span style={{ color: 'var(--cyan)', fontFamily: 'var(--mono)' }}>✓ Saved</span>}
          {status?.error && <span style={{ color: 'var(--blood)', fontFamily: 'var(--mono)' }}>{status.error}</span>}
        </div>
      </form>
    </section>
  )
}

function Field({ label, hint, children }) {
  return (
    <label style={{ display: 'block' }}>
      <div className="eyebrow" style={{ marginBottom: 6, fontSize: 13, color: 'var(--cyan)' }}>{label}</div>
      <div className="field" style={{ background: 'rgba(0,0,0,.3)' }}>
        {children}
      </div>
      {hint && <small style={{ display: 'block', marginTop: 6, color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: 13 }}>{hint}</small>}
    </label>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/Profile.jsx
git commit -m "feat(profile): build editable profile page with avatar upload"
```

(The textarea/url-input CSS was added to `style.css` in Task 5.)

---

### Task 32: Create `UserProfile` page (public)

**Files:**
- Modify (replace stub): `src/pages/UserProfile.jsx`

- [ ] **Step 1: Replace the file**

```jsx
import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getProfileByHandle } from '../lib/profile'

export default function UserProfile() {
  const { handle } = useParams()
  const [profile, setProfile] = useState(null)
  const [status, setStatus] = useState('loading') // loading | found | notfound | error

  useEffect(() => {
    let cancelled = false
    getProfileByHandle(handle)
      .then((p) => {
        if (cancelled) return
        if (!p) { setStatus('notfound'); return }
        setProfile(p)
        setStatus('found')
      })
      .catch(() => { if (!cancelled) setStatus('error') })
    return () => { cancelled = true }
  }, [handle])

  if (status === 'loading') {
    return <section className="surface active"><div style={{ padding: '60px 0', textAlign: 'center' }}><p className="eyebrow">▸ Loading…</p></div></section>
  }
  if (status === 'notfound') {
    return (
      <section className="surface active">
        <div style={{ padding: '60px 0', textAlign: 'center' }}>
          <p className="eyebrow" style={{ color: 'var(--blood)' }}>▸ No such writer</p>
          <p style={{ color: 'var(--bone-dim)', fontStyle: 'italic', marginTop: 18 }}>
            @{handle} is not in the coven.
          </p>
          <Link to="/" className="btn ghost" style={{ marginTop: 24 }}>Back home</Link>
        </div>
      </section>
    )
  }
  if (status === 'error') {
    return <section className="surface active"><div style={{ padding: '60px 0', textAlign: 'center' }}><p className="eyebrow" style={{ color: 'var(--blood)' }}>▸ Something went wrong.</p></div></section>
  }

  const initial = (profile.display_name?.[0] || profile.handle?.[0] || '?').toUpperCase()

  return (
    <section className="surface active">
      <p className="eyebrow">▸ Member</p>
      <h2 className="title">The <em>Coven</em></h2>

      <div className="profile-head">
        {profile.avatar_url ? (
          <img src={profile.avatar_url} alt="" style={{ width: 160, height: 160, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--blood)' }} />
        ) : (
          <div className="profile-avatar">{initial}</div>
        )}
        <div className="profile-info">
          <h3>{profile.display_name || profile.handle}</h3>
          <div className="handle">@{profile.handle}</div>
          {profile.pronouns && <div className="handle" style={{ fontSize: 14, color: 'var(--muted)' }}>{profile.pronouns}</div>}
          {profile.bio && <p className="bio">{profile.bio}</p>}
          <p className="joined">
            Joined {new Date(profile.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
            {profile.location && <> · {profile.location}</>}
          </p>
          {profile.website_url && (
            <p style={{ marginTop: 8 }}>
              <a href={profile.website_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--cyan)', fontFamily: 'var(--mono)' }}>
                {profile.website_url}
              </a>
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/UserProfile.jsx
git commit -m "feat(profile): add public UserProfile page at /u/:handle"
```

---

### Task 33: Create `OnboardingBanner` and wire it into `Layout`

**Files:**
- Create: `src/components/OnboardingBanner.jsx`
- Modify: `src/components/Layout.jsx`

- [ ] **Step 1: Create `OnboardingBanner.jsx`**

```jsx
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function OnboardingBanner() {
  const { profile } = useAuth()
  if (!profile) return null

  // Show banner while the user is still on auto-handle and hasn't set a display name
  const isStillDefault = profile.handle?.startsWith('user-') && !profile.display_name
  if (!isStillDefault) return null

  return (
    <div style={{
      borderBottom: '1px solid rgba(76,213,255,.3)',
      background: 'rgba(76,213,255,.06)',
      padding: '12px 28px',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18, flexWrap: 'wrap',
      fontFamily: 'var(--mono)', fontSize: 14, color: 'var(--cyan)', letterSpacing: '.18em', textTransform: 'uppercase',
    }}>
      <span>▸ Welcome. Pick a handle and write a few lines about yourself.</span>
      <Link to="/profile" className="btn cyan" style={{ padding: '6px 14px', fontSize: 12 }}>
        Complete profile
      </Link>
    </div>
  )
}
```

- [ ] **Step 2: Update `Layout.jsx` to render the banner**

```jsx
import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Atmospherics from './Atmospherics'
import Nav from './Nav'
import Footer from './Footer'
import SignInModal from './SignInModal'
import OnboardingBanner from './OnboardingBanner'

export default function Layout() {
  const [signinOpen, setSigninOpen] = useState(false)

  return (
    <>
      <Atmospherics />
      <Nav onSignInClick={() => setSigninOpen(true)} />
      <OnboardingBanner />
      <main className="shell">
        <Outlet context={{ openSignin: () => setSigninOpen(true) }} />
      </main>
      <Footer />
      <SignInModal open={signinOpen} onClose={() => setSigninOpen(false)} />
    </>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/OnboardingBanner.jsx src/components/Layout.jsx
git commit -m "feat(profile): add OnboardingBanner that disappears once profile customized"
```

---

### Task 34: End-to-end profile test

- [ ] **Step 1: Run dev server, sign in if not already**

```bash
npm run dev
```

- [ ] **Step 2: Verify the onboarding banner appears**

You should see a cyan banner under the nav: "Welcome. Pick a handle and write a few lines about yourself."

- [ ] **Step 3: Click "Complete profile" and edit fields**

Change the handle to something readable. Add display name, bio, etc. Click Save. Banner should disappear (handle no longer starts with `user-` AND display name is set).

- [ ] **Step 4: Upload an avatar**

Pick an image (PNG/JPG/WEBP/GIF, under 2 MB). After upload, the avatar should update on the page within ~1 second.

- [ ] **Step 5: Visit your public profile**

Navigate to `http://localhost:5173/u/<your-new-handle>`. Verify it renders correctly.

- [ ] **Step 6: Test the not-found case**

Navigate to `http://localhost:5173/u/this-does-not-exist`. Verify the "No such writer" message appears.

- [ ] **Step 7: Check Supabase**

In Table Editor → `profiles`: your row should show all the fields you edited.
In Storage → `avatars` → `<your-user-id>/`: the avatar file should be there.

No commit — verification only.

---

## Phase 6 — Passkey support (WebAuthn)

This phase requires Supabase Edge Functions. If you've never deployed one, run `supabase functions new test` once to confirm the CLI works, then delete the test folder.

### Task 35: Create shared Edge Function utilities

**Files:**
- Create: `supabase/functions/_shared/cors.ts`
- Create: `supabase/functions/_shared/webauthn.ts`

- [ ] **Step 1: Create CORS helper**

```ts
// supabase/functions/_shared/cors.ts
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function handleOptions() {
  return new Response('ok', { headers: corsHeaders })
}
```

- [ ] **Step 2: Create WebAuthn config helper**

```ts
// supabase/functions/_shared/webauthn.ts
export const RP_ID = Deno.env.get('RP_ID') ?? 'localhost'
export const RP_NAME = Deno.env.get('RP_NAME') ?? 'Horror Writer'
export const ORIGIN = Deno.env.get('ORIGIN') ?? 'http://localhost:5173'
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/_shared/
git commit -m "feat(edge): add shared CORS and WebAuthn config helpers"
```

---

### Task 36: Create `webauthn-register-begin` Edge Function

**Files:**
- Create: `supabase/functions/webauthn-register-begin/index.ts`

- [ ] **Step 1: Create the file**

```ts
// supabase/functions/webauthn-register-begin/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { generateRegistrationOptions } from 'https://esm.sh/@simplewebauthn/server@11'
import { corsHeaders, handleOptions } from '../_shared/cors.ts'
import { RP_ID, RP_NAME } from '../_shared/webauthn.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions()

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Resolve user from the bearer token
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) return json({ error: 'Not authenticated' }, 401)

    // Look up existing credential IDs to exclude
    const { data: existing } = await supabase
      .from('passkeys')
      .select('credential_id')
      .eq('user_id', user.id)

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userID: new TextEncoder().encode(user.id),
      userName: user.email ?? user.id,
      attestationType: 'none',
      excludeCredentials: (existing ?? []).map((p) => ({
        id: p.credential_id,
        type: 'public-key',
      })),
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'preferred',
      },
    })

    // Store challenge
    await supabase.from('webauthn_challenges').insert({
      challenge: options.challenge,
      user_id: user.id,
      purpose: 'register',
    })

    return json(options)
  } catch (err) {
    console.error(err)
    return json({ error: String(err?.message ?? err) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/webauthn-register-begin/
git commit -m "feat(edge): webauthn-register-begin generates registration options"
```

---

### Task 37: Create `webauthn-register-complete` Edge Function

**Files:**
- Create: `supabase/functions/webauthn-register-complete/index.ts`

- [ ] **Step 1: Create the file**

```ts
// supabase/functions/webauthn-register-complete/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyRegistrationResponse } from 'https://esm.sh/@simplewebauthn/server@11'
import { corsHeaders, handleOptions } from '../_shared/cors.ts'
import { RP_ID, ORIGIN } from '../_shared/webauthn.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions()

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ error: 'Not authenticated' }, 401)

    const { response, deviceName } = await req.json()
    if (!response) return json({ error: 'Missing response' }, 400)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Find an unexpired challenge for this user
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const { data: chRows } = await supabase
      .from('webauthn_challenges')
      .select('*')
      .eq('user_id', user.id)
      .eq('purpose', 'register')
      .gte('created_at', fiveMinAgo)
      .order('created_at', { ascending: false })
      .limit(1)
    const ch = chRows?.[0]
    if (!ch) return json({ error: 'No active challenge' }, 400)

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: ch.challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
    })

    if (!verification.verified || !verification.registrationInfo) {
      return json({ error: 'Verification failed' }, 400)
    }

    const { credential } = verification.registrationInfo
    // SimpleWebAuthn 11 returns base64url strings for credential.id and credential.publicKey

    await supabase.from('passkeys').insert({
      user_id: user.id,
      credential_id: credential.id,
      public_key: credential.publicKey,
      counter: credential.counter,
      device_name: deviceName ?? null,
    })

    // Cleanup the used challenge
    await supabase.from('webauthn_challenges').delete().eq('id', ch.id)

    return json({ ok: true })
  } catch (err) {
    console.error(err)
    return json({ error: String(err?.message ?? err) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
```

> **Note on SimpleWebAuthn shapes:** The above assumes `@simplewebauthn/server@11`'s `verifyRegistrationResponse` return shape (`registrationInfo.credential.{id, publicKey, counter}` as base64url strings). If you upgrade past v11, double-check the shape — earlier and later majors used different field names (`credentialID`/`credentialPublicKey`/Uint8Array).

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/webauthn-register-complete/
git commit -m "feat(edge): webauthn-register-complete verifies and stores credential"
```

---

### Task 38: Create `webauthn-authenticate-begin` Edge Function

**Files:**
- Create: `supabase/functions/webauthn-authenticate-begin/index.ts`

- [ ] **Step 1: Create the file**

```ts
// supabase/functions/webauthn-authenticate-begin/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { generateAuthenticationOptions } from 'https://esm.sh/@simplewebauthn/server@11'
import { corsHeaders, handleOptions } from '../_shared/cors.ts'
import { RP_ID } from '../_shared/webauthn.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions()
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      userVerification: 'preferred',
      allowCredentials: [], // usernameless / discoverable
    })

    await supabase.from('webauthn_challenges').insert({
      challenge: options.challenge,
      user_id: null,
      purpose: 'authenticate',
    })

    return json(options)
  } catch (err) {
    console.error(err)
    return json({ error: String(err?.message ?? err) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/webauthn-authenticate-begin/
git commit -m "feat(edge): webauthn-authenticate-begin generates assertion options"
```

---

### Task 39: Create `webauthn-authenticate-complete` Edge Function

**Files:**
- Create: `supabase/functions/webauthn-authenticate-complete/index.ts`

- [ ] **Step 1: Create the file**

```ts
// supabase/functions/webauthn-authenticate-complete/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyAuthenticationResponse } from 'https://esm.sh/@simplewebauthn/server@11'
import { corsHeaders, handleOptions } from '../_shared/cors.ts'
import { RP_ID, ORIGIN } from '../_shared/webauthn.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions()
  try {
    const { response } = await req.json()
    if (!response?.id) return json({ error: 'Missing response' }, 400)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Look up the credential
    const { data: pk } = await supabase
      .from('passkeys')
      .select('*')
      .eq('credential_id', response.id)
      .maybeSingle()
    if (!pk) return json({ error: 'Unknown credential' }, 400)

    // Most recent unexpired auth challenge
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const { data: chRows } = await supabase
      .from('webauthn_challenges')
      .select('*')
      .eq('purpose', 'authenticate')
      .gte('created_at', fiveMinAgo)
      .order('created_at', { ascending: false })
      .limit(1)
    const ch = chRows?.[0]
    if (!ch) return json({ error: 'No active challenge' }, 400)

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: ch.challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      credential: {
        id: pk.credential_id,
        publicKey: pk.public_key,
        counter: Number(pk.counter),
      },
    })

    if (!verification.verified) return json({ error: 'Verification failed' }, 400)

    // Bump counter and last_used_at
    await supabase.from('passkeys').update({
      counter: verification.authenticationInfo.newCounter,
      last_used_at: new Date().toISOString(),
    }).eq('id', pk.id)

    // Cleanup challenge
    await supabase.from('webauthn_challenges').delete().eq('id', ch.id)

    // Look up user email so we can mint a session via magic-link token exchange
    const { data: { user }, error: userErr } = await supabase.auth.admin.getUserById(pk.user_id)
    if (userErr || !user?.email) return json({ error: 'User lookup failed' }, 500)

    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: user.email,
      options: { redirectTo: `${ORIGIN}/auth/callback` },
    })
    if (linkErr) return json({ error: linkErr.message }, 500)

    // The hashed_token is what verifyOtp expects on the client.
    return json({
      token_hash: linkData.properties.hashed_token,
      type: 'magiclink',
    })
  } catch (err) {
    console.error(err)
    return json({ error: String(err?.message ?? err) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/webauthn-authenticate-complete/
git commit -m "feat(edge): webauthn-authenticate-complete verifies assertion and mints session token"
```

---

### Task 40: Deploy Edge Functions and set secrets

- [ ] **Step 1: Set Edge Function secrets**

For local dev (passkeys work on localhost too):
```bash
supabase secrets set RP_ID=localhost RP_NAME="Horror Writer" ORIGIN=http://localhost:5173
```

For production:
```bash
supabase secrets set RP_ID=horrorwriter.org RP_NAME="Horror Writer" ORIGIN=https://horrorwriter.org
```

(The `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected by Supabase — you don't need to set them.)

- [ ] **Step 2: Deploy all 4 functions**

```bash
supabase functions deploy webauthn-register-begin --no-verify-jwt
supabase functions deploy webauthn-register-complete --no-verify-jwt
supabase functions deploy webauthn-authenticate-begin --no-verify-jwt
supabase functions deploy webauthn-authenticate-complete --no-verify-jwt
```

(`--no-verify-jwt` is required because the `webauthn-authenticate-*` functions are called by un-authenticated browsers. The `register-*` functions verify the JWT manually inside the function via the `Authorization` header.)

Expected: each command ends with `Deployed Function <name>`.

- [ ] **Step 3: Smoke-test from the dashboard**

Supabase dashboard → Edge Functions → `webauthn-authenticate-begin` → "Invoke" → leave body empty → Run.
Expected: returns a JSON body with a `challenge` field.

No commit — these are deployment artifacts.

---

### Task 41: Create `lib/passkey.js`

**Files:**
- Create: `src/lib/passkey.js`

- [ ] **Step 1: Create the file**

```js
import { supabase } from '../supabaseClient'
import { startRegistration, startAuthentication } from '@simplewebauthn/browser'

const FN_BASE = (import.meta.env.VITE_SUPABASE_URL || '') + '/functions/v1'
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY

async function callFn(name, { auth = false, body } = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'apikey': ANON,
  }
  if (auth) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Not signed in')
    headers['Authorization'] = `Bearer ${session.access_token}`
  }
  const res = await fetch(`${FN_BASE}/${name}`, {
    method: 'POST',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
  return json
}

export async function registerPasskey(deviceName) {
  const options = await callFn('webauthn-register-begin', { auth: true })
  const response = await startRegistration({ optionsJSON: options })
  await callFn('webauthn-register-complete', { auth: true, body: { response, deviceName } })
}

export async function signInWithPasskey() {
  const options = await callFn('webauthn-authenticate-begin')
  const response = await startAuthentication({ optionsJSON: options })
  const { token_hash, type } = await callFn('webauthn-authenticate-complete', { body: { response } })
  // Exchange the magic-link token for a real Supabase session — no email needed
  const { error } = await supabase.auth.verifyOtp({ token_hash, type })
  if (error) throw error
}

export function browserSupportsPasskeys() {
  return typeof window !== 'undefined'
    && typeof window.PublicKeyCredential !== 'undefined'
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/passkey.js
git commit -m "feat(passkey): browser helpers for register and sign-in via Edge Functions"
```

---

### Task 42: Add Devices section to `Profile.jsx`

**Files:**
- Modify: `src/pages/Profile.jsx`

- [ ] **Step 1: Add new imports at the top of `Profile.jsx`**

Replace the import block at the top of `src/pages/Profile.jsx` with:

```jsx
import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { updateProfile, uploadAvatar } from '../lib/profile'
import { supabase } from '../supabaseClient'
import { registerPasskey, browserSupportsPasskeys } from '../lib/passkey'
```

- [ ] **Step 2: Render `<Devices />` inside the Profile section**

In the `Profile` component's returned JSX, just below the closing `</form>` tag (and still inside the `<section>`), add:

```jsx
        <Devices />
```

- [ ] **Step 3: Add the `Devices` component at the bottom of the file**

After the `Field` helper component, append:

```jsx
function Devices() {
  const [list, setList] = useState([])
  const [adding, setAdding] = useState(false)
  const [msg, setMsg] = useState(null)

  const load = async () => {
    const { data } = await supabase
      .from('passkeys')
      .select('id, device_name, created_at, last_used_at')
      .order('created_at', { ascending: false })
    setList(data ?? [])
  }
  useEffect(() => { load() }, [])

  const onAdd = async () => {
    if (!browserSupportsPasskeys()) {
      setMsg({ error: 'This browser does not support passkeys.' })
      return
    }
    setAdding(true)
    setMsg(null)
    try {
      const name = prompt('Name this device (e.g. "MacBook")') || 'Unnamed device'
      await registerPasskey(name)
      setMsg('saved')
      await load()
    } catch (err) {
      setMsg({ error: err.message || 'Registration failed.' })
    } finally {
      setAdding(false)
    }
  }

  return (
    <div style={{ marginTop: 60, paddingTop: 36, borderTop: '1px solid rgba(243,236,217,.1)' }}>
      <p className="eyebrow">▸ Sign-in</p>
      <h3 style={{ fontFamily: 'var(--serif)', fontSize: 28, color: 'var(--bone)', letterSpacing: '.04em', marginBottom: 6 }}>
        Devices
      </h3>
      <p style={{ color: 'var(--bone-dim)', fontStyle: 'italic', marginBottom: 24, maxWidth: 580 }}>
        Add a passkey on this device to skip the email step next time you sign in.
        Your face, fingerprint, or device PIN will let you back in instantly.
      </p>

      {list.length === 0 ? (
        <p style={{ color: 'var(--muted)', fontFamily: 'var(--mono)', marginBottom: 18 }}>
          No passkeys registered.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', marginBottom: 18 }}>
          {list.map((d) => (
            <li key={d.id} style={{
              padding: '12px 16px', border: '1px solid rgba(243,236,217,.1)', borderRadius: 'var(--r)',
              marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              fontFamily: 'var(--mono)', fontSize: 15,
            }}>
              <span>{d.device_name || 'Unnamed device'}</span>
              <span style={{ color: 'var(--muted)', fontSize: 13 }}>
                added {new Date(d.created_at).toLocaleDateString()}
                {d.last_used_at && ` · last used ${new Date(d.last_used_at).toLocaleDateString()}`}
              </span>
            </li>
          ))}
        </ul>
      )}

      <button className="btn primary" onClick={onAdd} disabled={adding}>
        {adding ? 'Waiting on device…' : '▸ Add a passkey'}
      </button>
      {msg === 'saved' && <span style={{ marginLeft: 14, color: 'var(--cyan)', fontFamily: 'var(--mono)' }}>✓ Added</span>}
      {msg?.error && <span style={{ marginLeft: 14, color: 'var(--blood)', fontFamily: 'var(--mono)' }}>{msg.error}</span>}
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/Profile.jsx
git commit -m "feat(passkey): add Devices section to profile for registering passkeys"
```

---

### Task 43: Add passkey button to `SignInModal`

**Files:**
- Modify (replace contents): `src/components/SignInModal.jsx`

- [ ] **Step 1: Replace the file**

```jsx
import { useState } from 'react'
import { signInWithMagicLink } from '../lib/auth'
import { signInWithPasskey, browserSupportsPasskeys } from '../lib/passkey'

export default function SignInModal({ open, onClose }) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('idle')
  const [errorMsg, setErrorMsg] = useState('')

  if (!open) return null

  const onMagicLink = async (e) => {
    e.preventDefault()
    setStatus('sending')
    setErrorMsg('')
    try {
      await signInWithMagicLink(email.trim())
      setStatus('sent')
    } catch (err) {
      setErrorMsg(err.message || 'Something went wrong.')
      setStatus('error')
    }
  }

  const onPasskey = async () => {
    setStatus('passkey')
    setErrorMsg('')
    try {
      await signInWithPasskey()
      // Auth listener will pick up the new session and re-render the nav.
      reset()
    } catch (err) {
      setErrorMsg(err.message || 'Passkey sign-in failed.')
      setStatus('error')
    }
  }

  const reset = () => {
    setEmail('')
    setStatus('idle')
    setErrorMsg('')
    onClose()
  }

  const supportsPasskeys = browserSupportsPasskeys()

  return (
    <div className="modal-back open" onClick={(e) => { if (e.target === e.currentTarget) reset() }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="signin-title">
        <button className="close" onClick={reset} aria-label="Close">✕</button>
        <h3 id="signin-title">Sign In to the Circle</h3>
        <p className="lede">No passwords. Use a passkey if you've registered one, or get a magic link by email.</p>

        {status === 'sent' ? (
          <div style={{ padding: '20px 0', textAlign: 'center' }}>
            <p style={{ color: 'var(--cyan)', fontFamily: 'var(--mono)', letterSpacing: '.2em', textTransform: 'uppercase', marginBottom: 8 }}>
              ✓ Link sent
            </p>
            <p style={{ color: 'var(--bone-dim)', fontStyle: 'italic' }}>
              Check {email}. The link expires in 1 hour.
            </p>
          </div>
        ) : (
          <>
            {supportsPasskeys && (
              <>
                <button
                  className="btn primary"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={onPasskey}
                  disabled={status === 'passkey'}
                >
                  {status === 'passkey' ? 'Waiting on device…' : '▸ Sign in with passkey'}
                </button>
                <div className="or">— or —</div>
              </>
            )}
            <form onSubmit={onMagicLink}>
              <div className="field">
                <input
                  type="email"
                  placeholder="your@email.address"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={status === 'sending'}
                />
              </div>
              <button
                type="submit"
                className="btn ghost"
                style={{ width: '100%', justifyContent: 'center' }}
                disabled={status === 'sending' || !email.trim()}
              >
                {status === 'sending' ? 'Sending…' : 'Email me a magic link'}
              </button>
            </form>
            {errorMsg && (
              <p style={{ marginTop: 14, color: 'var(--blood)', fontFamily: 'var(--mono)', fontSize: 14, textAlign: 'center' }}>
                {errorMsg}
              </p>
            )}
            <p className="small">By signing in you agree to read others before asking them to read you.</p>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/SignInModal.jsx
git commit -m "feat(passkey): add passkey CTA to SignInModal"
```

---

### Task 44: End-to-end passkey test

- [ ] **Step 1: Run dev server**

```bash
npm run dev
```

- [ ] **Step 2: Sign in via magic link if not already signed in**

(See Task 28 for the flow.)

- [ ] **Step 3: Register a passkey**

Go to `/profile` → scroll to "Devices" → click "Add a passkey" → name it → confirm with face/fingerprint/PIN. The new passkey should appear in the list.

- [ ] **Step 4: Sign out**

Use the user menu → "Sign out".

- [ ] **Step 5: Sign in with the passkey**

Click "Sign In" → click "Sign in with passkey" → confirm with face/fingerprint/PIN. You should be signed back in instantly without an email.

- [ ] **Step 6: Verify in Supabase**

Table Editor → `passkeys`: your row should show updated `last_used_at`.

If anything fails, check the Edge Function logs in Supabase dashboard → Edge Functions → click the function → Logs tab.

No commit — verification only.

---

## Phase 7 — Cleanup & deploy

### Task 45: Delete deprecated files

**Files:**
- Delete: `src/pages/Login.jsx`
- Delete: `src/pages/Dashboard.jsx`

These were stubs from the original React skeleton; SignInModal replaces Login, and Dashboard isn't in the spec.

- [ ] **Step 1: Delete both**

```bash
git rm src/pages/Login.jsx src/pages/Dashboard.jsx
```

- [ ] **Step 2: Verify the build still works**

```bash
npm run build
```
Expected: builds successfully, output in `dist/`.

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: remove deprecated Login and Dashboard pages"
```

---

### Task 46: Verify production build locally

- [ ] **Step 1: Build**

```bash
npm run build
```
Expected: `dist/` contains `index.html`, `assets/`, `_redirects`, `vite.svg`. Build size is reasonable (a few hundred KB total).

- [ ] **Step 2: Preview**

```bash
npm run preview
```
Expected: serves the built site at `http://localhost:4173`.

- [ ] **Step 3: Click through every route**

Verify the app works in production mode just as it does in dev. The atmospherics, nav, sign-in flow, profile editing — all of it.

- [ ] **Step 4: Stop the preview server**

No commit.

---

### Task 47: Configure Cloudflare Pages and deploy

- [ ] **Step 1: Set up Cloudflare Pages project (one-time)**

In the Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git → select `JeffThomas360/HorrorWriter`.

Configure build:
- **Framework preset:** Vite
- **Build command:** `npm run build`
- **Build output directory:** `dist`
- **Root directory:** (empty, the repo root)
- **Node version:** 20 (set via `NODE_VERSION` env var if not auto-detected)

Add environment variables (Production scope and Preview scope both):
- `VITE_SUPABASE_URL` = your project URL
- `VITE_SUPABASE_ANON_KEY` = your anon key

- [ ] **Step 2: Push to main**

```bash
git push origin main
```

- [ ] **Step 3: Watch the build in Cloudflare**

Cloudflare dashboard → your Pages project → check the latest deployment. Should show "Success" within a few minutes.

- [ ] **Step 4: Visit the deployed site**

Open the `*.pages.dev` URL Cloudflare gives you. Click through every route. Test sign-in (magic link will send a real email).

- [ ] **Step 5: (Optional) Add custom domain `horrorwriter.org`**

Cloudflare Pages → Custom domains → Add → enter `horrorwriter.org`. Cloudflare guides you through the DNS setup. Once active, update Supabase Auth → Redirect URLs to include `https://horrorwriter.org/auth/callback`, and re-deploy Edge Functions with `RP_ID=horrorwriter.org` and `ORIGIN=https://horrorwriter.org`.

No commit — deployment is automatic.

---

## Done

V1 ships:
- Magic-link auth
- Passkey upgrade for instant re-login
- Profile read/edit with Supabase Storage avatar upload
- Public profiles at `/u/:handle`
- Forum/Library/Rituals visually ported with mocked data
- Cloudflare Pages auto-deploy on push to `main`

Next up (V2+, separate plans):
- Real forum threads (table + RLS + post UI)
- Real library uploads
- Real ritual submissions
- Account deletion UI
- OAuth providers
- Achievements / badges
