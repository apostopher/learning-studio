import { createFileRoute, redirect } from '@tanstack/react-router';
import { AdminCoursesPageContainer } from '@/components/admin/admin-courses-page-container';

export const Route = createFileRoute('/_authed/admin')({
  beforeLoad: ({ context }) => {
    if (!context.roles.includes('admin')) {
      throw redirect({ to: '/app' });
    }
  },
  component: AdminPage,
});

function AdminPage() {
  return <AdminCoursesPageContainer />;
}
