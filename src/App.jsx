import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import Forum from './pages/Forum'
import Library from './pages/Library'
import Rituals from './pages/Rituals'
import Profile from './pages/Profile'
import UserProfile from './pages/UserProfile'
import AuthCallback from './pages/AuthCallback'
import CreateThread from './pages/CreateThread'
import ThreadView from './pages/ThreadView'
import PublishStory from './pages/PublishStory'
import ReadStory from './pages/ReadStory'
import RequireAuth from './components/RequireAuth'
import { AuthProvider } from './components/AuthContext'
import ErrorBoundary from './components/ErrorBoundary'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ErrorBoundary>
          <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="forum" element={<Forum />} />
          <Route path="forum/new" element={<CreateThread />} />
          <Route path="forum/thread/:id" element={<ThreadView />} />
          <Route path="library" element={<Library />} />
          <Route path="library/publish" element={<PublishStory />} />
          <Route path="library/read/:id" element={<ReadStory />} />
          <Route path="rituals" element={<Rituals />} />
          <Route path="u/:handle" element={<UserProfile />} />
          <Route path="profile" element={<RequireAuth><Profile /></RequireAuth>} />
          <Route path="auth/callback" element={<AuthCallback />} />
        </Route>
          </Routes>
        </ErrorBoundary>
      </BrowserRouter>
    </AuthProvider>
  )
}
