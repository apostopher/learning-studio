import { createFileRoute } from '@tanstack/react-router';
import { AdminCoursesPageContainer } from '@/components/admin/admin-courses-page-container';
import { hasPermissionKey } from '@/lib/admin-schemas';

export const Route = createFileRoute('/_authed/admin/')({
  component: AdminCoursesPage,
});

function AdminCoursesPage() {
  const { permissions } = Route.useRouteContext();
  // Two separate facts, deliberately not one. `course:read` decides whether
  // the list is the whole catalogue or only this actor's staffed courses —
  // that is what the page's copy describes. `course:create` decides one
  // button, and is org-level with no staff fallback: a subject expert authors
  // inside a course, they do not found one. Read here rather than in the
  // container because the route is the only place holding permissions.
  return (
    <AdminCoursesPageContainer
      canCreateCourse={hasPermissionKey(permissions, 'course', 'create')}
      canReadCatalogue={hasPermissionKey(permissions, 'course', 'read')}
    />
  );
}
