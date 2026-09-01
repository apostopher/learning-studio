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
import { PointerOriginTracker } from '../components/pointer-origin-tracker';
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
  /**
   * Whether this person is staff ANYWHERE: an admin or owner globally, or the
   * holder of a `course_staff` row on any course, or of a `discipline_staff`
   * row on any discipline.
   *
   * Scoped authority is invisible to `roles` and `permissions`, which are both
   * global — so this is the only thing `/admin`'s entry guard can read to tell
   * a professor or a subject expert from a learner. It must be the union of
   * all three: the two staff tables are deliberately independent (no backfill
   * links them — see `db/migrate-discipline-staff.ts`), so a discipline-only
   * SME with authority over lesson content can hold zero `course_staff` rows,
   * and a course-only check would lock them out of the shell that is the only
   * route to their own work.
   *
   * It answers "may they enter at all", never "what may they do here": every
   * per-course and per-discipline decision stays server-side, in
   * `requireCoursePermission` and `requireLessonContentPermission`.
   */
  isStaffAnywhere: boolean;
  /**
   * Whether this person holds a `course_staff` row on any course — that table
   * alone, and no global role.
   *
   * The narrower question, for UI that is about courses specifically rather
   * than about admin access. `/admin`'s Courses nav link is the reader: the
   * course index shows an actor their staffed courses even without a
   * `course:read` grant, so course staffing is what makes that page non-empty
   * for them. A discipline-only SME would find nothing there, and offering a
   * link to an empty list is the sort of dead end this codebase treats as a
   * defect.
   */
  isCourseStaffAnywhere: boolean;
  /**
   * Whether this person holds the COURSE-MANAGER role on any course.
   *
   * Narrower than `isCourseStaffAnywhere`, which a subject expert staffed on a
   * course also satisfies. It exists for one question — RBAC rule 5, who may
   * create a new offering — and mirrors `requireCourseCreation` exactly, so
   * the button and the endpoint behind it cannot disagree.
   */
  isCourseManagerAnywhere: boolean;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  beforeLoad: async () => {
    const {
      session,
      roles,
      permissions,
      isStaffAnywhere,
      isCourseStaffAnywhere,
      isCourseManagerAnywhere,
    } = await getAuthContext();
    return {
      session,
      roles,
      permissions,
      isStaffAnywhere,
      isCourseStaffAnywhere,
      isCourseManagerAnywhere,
    };
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
        title: 'RMTP Studio',
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
              {/*
                Publishes the last click position so every dialog can grow out
                of the control that opened it. Renders nothing; mounted here
                because a dialog can be opened from any route.
              */}
              <PointerOriginTracker />
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
