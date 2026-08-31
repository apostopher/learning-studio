import { createFileRoute, redirect } from '@tanstack/react-router';
import { UsersPageContainer } from '#/components/admin/users/users-page-container';
import { adminUsersQueryOptions } from '#/data-hooks/use-admin-users';
import { hasPermissionKey } from '#/lib/admin-schemas';

export const Route = createFileRoute('/_authed/admin/users')({
  // Gated in beforeLoad rather than in the component, so someone without
  // `user:read` never sees a flash of a page they can't use.
  beforeLoad: ({ context }) => {
    if (!hasPermissionKey(context.permissions, 'user', 'read')) {
      throw redirect({ to: '/admin' });
    }
  },
  /**
   * Primes the users list. With the router's `defaultPreload: 'intent'` this
   * runs when the nav link is HOVERED, so by the time the click lands the
   * request is usually already in flight — the page opened cold before,
   * starting its fetch only once the component mounted.
   *
   * `ensureQueryData`, not `fetchQuery`: an entry already inside `staleTime`
   * is reused rather than refetched, so hovering the link repeatedly costs
   * nothing.
   *
   * Deliberately NOT awaited into the route's load. Blocking on it would trade
   * a fast page with a skeleton for a slow navigation with nothing on screen,
   * which is the worse of the two — the table renders its skeleton the moment
   * the route does, and fills in when this resolves.
   */
  loader: ({ context }) => {
    void context.queryClient.ensureQueryData(adminUsersQueryOptions());
  },
  component: UsersRoute,
});

function UsersRoute() {
  const { roles, permissions } = Route.useRouteContext();
  return <UsersPageContainer roles={roles} permissions={permissions} />;
}
