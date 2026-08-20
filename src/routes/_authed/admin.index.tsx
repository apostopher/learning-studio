import { createFileRoute } from '@tanstack/react-router';
import { AdminCoursesPageContainer } from '@/components/admin/admin-courses-page-container';
import { hasPermissionKey } from '@/lib/admin-schemas';

export const Route = createFileRoute('/_authed/admin/')({
  component: AdminCoursesPage,
});

function AdminCoursesPage() {
  const { permissions } = Route.useRouteContext();
  // `course:create` is org-level and has no staff fallback — a subject expert
  // authors inside a course, they do not found one. Reading it here rather
  // than in the container keeps the permission read in the route, which is the
  // only place that holds it.
  const canCreateCourse = hasPermissionKey(permissions, 'course', 'create');

  return <AdminCoursesPageContainer canCreateCourse={canCreateCourse} />;
}
