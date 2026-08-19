import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './AuthContext'
import IslandErrorBoundary from './IslandErrorBoundary'

export default function Providers({ children }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry: false,
      },
    },
  }))

  return (
    <IslandErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          {children}
        </AuthProvider>
      </QueryClientProvider>
    </IslandErrorBoundary>
  )
}

export function withProviders(Component) {
  return function WrappedComponent(props) {
    return (
      <Providers>
        <Component {...props} />
      </Providers>
    )
  }
}
