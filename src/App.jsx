import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import Forum from './pages/Forum'
import Library from './pages/Library'
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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes cache validity
      gcTime: 1000 * 60 * 10,    // Keep unused data for 10 minutes
      refetchOnWindowFocus: false, // Retro style, no window-focus refetching
      retry: 1,
    },
  },
})

export default function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
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
                <Route path="u/:handle" element={<UserProfile />} />
                <Route path="profile" element={<RequireAuth><Profile /></RequireAuth>} />
                <Route path="auth/callback" element={<AuthCallback />} />
              </Route>
            </Routes>
          </ErrorBoundary>
        </BrowserRouter>
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </AuthProvider>
  )
}
