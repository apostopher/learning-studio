import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { ADMIN_ROLE } from '@/lib/admin-schemas';

export const Route = createFileRoute('/_authed/admin')({
  beforeLoad: ({ context }) => {
    if (!context.roles.includes(ADMIN_ROLE)) {
      throw redirect({ to: '/app' });
    }
  },
  component: () => <Outlet />,
});
