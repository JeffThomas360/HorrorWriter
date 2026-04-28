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
