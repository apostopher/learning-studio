import { Tooltip } from '@base-ui/react/tooltip';
import { TanStackDevtools } from '@tanstack/react-devtools';
import type { QueryClient } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  HeadContent,
  Scripts,
  useRouter,
} from '@tanstack/react-router';
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools';
import { NuqsAdapter } from 'nuqs/adapters/tanstack-router';
import { Toaster } from 'sonner';
import { ChatWidget } from '../components/chat-widget/chat-widget';
import TanStackQueryDevtools from '../integrations/tanstack-query/devtools';
import TanstackQueryProvider from '../integrations/tanstack-query/root-provider';
import { getAuthContext, type getSession } from '../lib/auth-functions';
import { extraFontLinks, fontLinkHref } from '../styles/theme.generated';
import appCss from '../styles.css?url';

type Session = Awaited<ReturnType<typeof getSession>>;

interface MyRouterContext {
  queryClient: QueryClient;
  session: Session;
  roles: string[];
  /** `entity:action` strings; `['*']` for an owner. */
  permissions: string[];
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  beforeLoad: async () => {
    const { session, roles, permissions } = await getAuthContext();
    return { session, roles, permissions };
  },
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'TanStack Start Starter',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  // The router's context client, not a fresh one — this is the same instance
  // setupRouterSsrQueryIntegration dehydrates into and that route beforeLoads
  // prime via ensureQueryData. useRouter() rather than Route.useRouteContext()
  // because this component also renders on the SSR shell path.
  const { queryClient } = useRouter().options.context;

  return (
    // Dark-only app. The class ships in the SSR HTML rather than being applied
    // by a pre-paint script, so there is no flash of the wrong theme. Every
    // colour token and the `dark:` variant (see the @custom-variant in
    // styles.css) key off this class.
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <link rel="llms-txt" href="/llms.txt" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        {fontLinkHref && <link href={fontLinkHref} rel="stylesheet" />}
        {extraFontLinks.map((href) => (
          <link key={href} href={href} rel="stylesheet" />
        ))}
        <HeadContent />
      </head>
      <body className="font-sans antialiased wrap-anywhere">
        {/*
          nuqs needs a per-framework adapter to read and write search params;
          without it any `useQueryState` throws NUQS-404 at render. Mounted at
          the root so it covers every route rather than being remembered
          per-page.
        */}
        <NuqsAdapter>
          <TanstackQueryProvider client={queryClient}>
            <Tooltip.Provider delay={0}>
              {children}
              <ChatWidget />
            </Tooltip.Provider>

            <TanStackDevtools
              config={{
                position: 'bottom-right',
              }}
              plugins={[
                {
                  name: 'Tanstack Router',
                  render: <TanStackRouterDevtoolsPanel />,
                },
                TanStackQueryDevtools,
              ]}
            />
            <Toaster
              position="bottom-right"
              theme="system"
              richColors
              closeButton
            />
          </TanstackQueryProvider>
        </NuqsAdapter>
        <Scripts />
      </body>
    </html>
  );
}
