import { createFileRoute, redirect } from '@tanstack/react-router';
import { AdminCoursesPageContainer } from '@/components/admin/admin-courses-page-container';
import { ensureAdmin } from '@/lib/admin-functions';

export const Route = createFileRoute('/_authed/admin')({
  beforeLoad: async () => {
    const result = await ensureAdmin();
    if (!result.ok) {
      throw redirect({ to: '/app' });
    }
  },
  component: AdminPage,
});

function AdminPage() {
  return <AdminCoursesPageContainer />;
}
