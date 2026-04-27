import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Provider } from 'jotai'
import { useHydrateAtoms } from 'jotai/utils'
import { queryClientAtom } from 'jotai-tanstack-query'

export function getContext() {
  const queryClient = new QueryClient()
  return { queryClient }
}

function HydrateQueryClient({
  client,
  children,
}: {
  client: QueryClient
  children: React.ReactNode
}) {
  useHydrateAtoms([[queryClientAtom, client]])
  return <>{children}</>
}

export default function TanstackQueryProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const { queryClient } = getContext()

  return (
    <QueryClientProvider client={queryClient}>
      <Provider>
        <HydrateQueryClient client={queryClient}>{children}</HydrateQueryClient>
      </Provider>
    </QueryClientProvider>
  )
}
