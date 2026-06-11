import { lazy } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import RequireAuth from './components/RequireAuth'
import { AuthProvider } from './components/AuthContext'
import ErrorBoundary from './components/ErrorBoundary'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

const Forum = lazy(() => import('./pages/Forum'))
const Library = lazy(() => import('./pages/Library'))
const Profile = lazy(() => import('./pages/Profile'))
const UserProfile = lazy(() => import('./pages/UserProfile'))
const AuthCallback = lazy(() => import('./pages/AuthCallback'))
const MyReports = lazy(() => import('./pages/MyReports'))
const TransparencyLog = lazy(() => import('./pages/TransparencyLog'))
const CreateThread = lazy(() => import('./pages/CreateThread'))
const ThreadView = lazy(() => import('./pages/ThreadView'))
const PublishStory = lazy(() => import('./pages/PublishStory'))
const ReadStory = lazy(() => import('./pages/ReadStory'))
const Rules = lazy(() => import('./pages/Rules'))
const Moderation = lazy(() => import('./pages/Moderation'))

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
                <Route path="my-reports" element={<RequireAuth><MyReports /></RequireAuth>} />
                <Route path="auth/callback" element={<AuthCallback />} />
                <Route path="rules" element={<Rules />} />
                <Route path="transparency" element={<TransparencyLog />} />
                <Route path="moderation" element={<Moderation />} />
              </Route>
            </Routes>
          </ErrorBoundary>
        </BrowserRouter>
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </AuthProvider>
  )
}
