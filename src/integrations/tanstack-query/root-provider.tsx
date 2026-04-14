import { QueryClient } from '@tanstack/react-query'
import { QueryClientProvider } from '@tanstack/react-query'

export function getContext() {
  const queryClient = new QueryClient()

  return {
    queryClient,
  }
}
export default function TanstackQueryProvider({ children }: { children: React.ReactNode }) {
  const { queryClient } = getContext()

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}
