import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { AdminShellLayout } from '@/components/admin/admin-shell-layout';
import { hasAdminAccess, hasPermissionKey } from '@/lib/admin-schemas';

export const Route = createFileRoute('/_authed/admin')({
  beforeLoad: ({ context }) => {
    if (!hasAdminAccess(context.roles)) {
      throw redirect({ to: '/app' });
    }
  },
  component: AdminShell,
});

function AdminShell() {
  const { permissions } = Route.useRouteContext();
  // Rendered only with `user:read` — a link to a page that redirects straight
  // back is worse than no link, and the route guards itself regardless.
  const canSeePeople = hasPermissionKey(permissions, 'user', 'read');

  return (
    <AdminShellLayout canSeePeople={canSeePeople}>
      <Outlet />
    </AdminShellLayout>
  );
}
