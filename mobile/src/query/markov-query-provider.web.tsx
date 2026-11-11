import { useState, type ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createMarkovQueryClient } from './markov-query-client'

// One client per page document; TanStack's own visibilitychange listener drives foreground revalidation.
export function MarkovQueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createMarkovQueryClient)
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
