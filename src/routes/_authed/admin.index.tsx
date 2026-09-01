import { createFileRoute } from '@tanstack/react-router';
import { AdminCoursesPageContainer } from '@/components/admin/admin-courses-page-container';
import { hasOrgPermission } from '@/lib/admin-schemas';

export const Route = createFileRoute('/_authed/admin/')({
  component: AdminCoursesPage,
});

function AdminCoursesPage() {
  const { roles, permissions, isCourseManagerAnywhere } =
    Route.useRouteContext();
  // Two separate facts, deliberately not one. `course:read` decides whether
  // the list is the whole catalogue or only this actor's staffed courses —
  // that is what the page's copy describes. `course:create` decides one
  // button. Read here rather than in the container because the route is the
  // only place holding permissions.
  //
  // Creation is the union from RBAC rule 5 — a course manager or an admin —
  // mirroring `requireCourseCreation`. `course:create` alone would hide the
  // button from every course manager, since `requirePermission` carries an
  // admin floor and no course manager can hold that grant meaningfully. A
  // subject expert is still absent: they author inside a course, they do not
  // decide which courses the org sells.
  return (
    <AdminCoursesPageContainer
      canCreateCourse={
        hasOrgPermission(roles, permissions, 'course', 'create') ||
        isCourseManagerAnywhere
      }
      canReadCatalogue={hasOrgPermission(roles, permissions, 'course', 'read')}
    />
  );
}
