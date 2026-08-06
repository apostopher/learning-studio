import { createFileRoute, redirect } from '@tanstack/react-router';
import { UsersPageContainer } from '#/components/admin/users/users-page-container';
import { hasPermissionKey } from '#/lib/admin-schemas';

export const Route = createFileRoute('/_authed/admin/users')({
  // Gated in beforeLoad rather than in the component, so someone without
  // `user:read` never sees a flash of a page they can't use.
  beforeLoad: ({ context }) => {
    if (!hasPermissionKey(context.permissions, 'user', 'read')) {
      throw redirect({ to: '/admin' });
    }
  },
  component: UsersRoute,
});

function UsersRoute() {
  const { roles, permissions } = Route.useRouteContext();
  return <UsersPageContainer roles={roles} permissions={permissions} />;
}
