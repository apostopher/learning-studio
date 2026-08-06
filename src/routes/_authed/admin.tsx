import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
} from '@tanstack/react-router';
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
    <>
      {canSeePeople && (
        <nav
          aria-label="Admin sections"
          className="content-grid border-gray-6 border-b bg-gray-2"
        >
          <div className="content flex gap-1 py-2">
            <AdminNavLink to="/admin">Courses</AdminNavLink>
            <AdminNavLink to="/admin/users">People</AdminNavLink>
          </div>
        </nav>
      )}
      <Outlet />
    </>
  );
}

const AdminNavLink = ({
  to,
  children,
}: {
  to: string;
  children: React.ReactNode;
}) => (
  <Link
    to={to}
    // `exact` on /admin only, so /admin/users doesn't light both links up.
    activeOptions={{ exact: to === '/admin' }}
    className="rounded-lg px-3 py-1.5 font-medium text-secondary text-sm transition-colors hover:bg-gray-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 data-[status=active]:bg-gray-4 data-[status=active]:text-primary"
  >
    {children}
  </Link>
);
