import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider } from 'jotai';
import { useHydrateAtoms } from 'jotai/utils';
import { queryClientAtom } from 'jotai-tanstack-query';

/**
 * Called ONCE, by getRouter(), to build the router context.
 *
 * It must stay a factory rather than a module-level singleton: on the server
 * a shared QueryClient would leak one user's cached data into another user's
 * request. The single instance it returns is threaded to the React tree via
 * router context, which is why TanstackQueryProvider takes a client rather
 * than calling this itself.
 */
export function getContext() {
  const queryClient = new QueryClient();
  return { queryClient };
}

function HydrateQueryClient({
  client,
  children,
}: {
  client: QueryClient;
  children: React.ReactNode;
}) {
  useHydrateAtoms([[queryClientAtom, client]]);
  return <>{children}</>;
}

export default function TanstackQueryProvider({
  client,
  children,
}: {
  client: QueryClient;
  children: React.ReactNode;
}) {
  return (
    <QueryClientProvider client={client}>
      <Provider>
        <HydrateQueryClient client={client}>{children}</HydrateQueryClient>
      </Provider>
    </QueryClientProvider>
  );
}
