import { createFileRoute, redirect } from '@tanstack/react-router';
import { UsersPageContainer } from '#/components/admin/users/users-page-container';
import { adminUsersQueryOptions } from '#/data-hooks/use-admin-users';
import { hasOrgPermission } from '#/lib/admin-schemas';

export const Route = createFileRoute('/_authed/admin/users')({
  // Gated in beforeLoad rather than in the component, so someone without
  // `user:read` never sees a flash of a page they can't use.
  //
  // `hasOrgPermission`, not the bare grant: `GET /api/admin/users` goes
  // through `requirePermission`, which refuses anyone who is not admin or
  // owner before it looks at a grant. Gating on the grant alone let an owner
  // tick `user:read` for a non-admin role and hand that person a page whose
  // every request 403s.
  beforeLoad: ({ context }) => {
    if (!hasOrgPermission(context.roles, context.permissions, 'user', 'read')) {
      throw redirect({ to: '/admin' });
    }
  },
  /**
   * Primes the users list — **in the browser only**.
   *
   * With the router's `defaultPreload: 'intent'` this runs when the nav link
   * is HOVERED, so by the time the click lands the request is usually already
   * in flight. That is a client-side navigation concern: on the server the
   * page is being rendered anyway, so there is no navigation to make feel
   * faster, and nothing to gain.
   *
   * The guard is not an optimisation, it is a correctness fix. Loaders run on
   * BOTH sides, and this query's `queryFn` does `fetch('/api/admin/users')` —
   * a relative URL, which the browser resolves against the current origin and
   * Node cannot resolve at all (`TypeError: Failed to parse URL`). Primed
   * during SSR it therefore threw, and because the call is deliberately not
   * awaited that surfaced as an unhandled rejection plus a REJECTED entry
   * sitting in the query cache for the SSR-Query integration to dehydrate —
   * which hung the page rather than failing it cleanly.
   *
   * The alternative is to give this query a server function the way
   * `course-access-queries.ts` does, so it works on both sides. That is the
   * better long-term shape and a bigger change: the endpoint is
   * cookie-authenticated, so a server-side call has to forward headers.
   *
   * Not awaited either way: blocking the navigation would trade a fast page
   * with a skeleton for a slow one with nothing on screen.
   *
   * `ensureQueryData`, not `fetchQuery`: an entry already inside `staleTime`
   * is reused rather than refetched, so hovering the link repeatedly is free.
   */
  loader: ({ context }) => {
    if (typeof window === 'undefined') return;
    void context.queryClient.ensureQueryData(adminUsersQueryOptions());
  },
  component: UsersRoute,
});

function UsersRoute() {
  const { roles, permissions } = Route.useRouteContext();
  return <UsersPageContainer roles={roles} permissions={permissions} />;
}
