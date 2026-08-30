import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its route test — the gate below is the switch that
// makes course-scoped AND discipline-scoped roles reachable at all.
import { AdminShellLayout } from '#/components/admin/admin-shell-layout';
import { hasAdminAccess, hasPermissionKey } from '#/lib/admin-schemas';

export const Route = createFileRoute('/_authed/admin')({
  beforeLoad: ({ context }) => {
    // A staff floor, not an admin floor — spec §4. The course editor is a
    // child of this route, so gating the subtree on `hasAdminAccess` alone
    // locks a subject expert out of the very course they were hired to author
    // and out of the staff panel built for them. Course-scoped AND
    // discipline-scoped authority are both invisible to `roles` and
    // `permissions` (both global), which is why `isStaffAnywhere` exists: it
    // is the union of admin/owner, any `course_staff` row and any
    // `discipline_staff` row (see `__root.tsx`), so a discipline-only SME —
    // no `course_staff` row at all, the two tables being deliberately
    // independent, see `migrate-discipline-staff.ts` — reaches this shell too.
    // It is the union field and NOT `isCourseStaffAnywhere` that is read here,
    // and that is the whole point of there being two. Entering is all this
    // decides: every child route's data still goes through a server-side
    // per-course (or per-discipline) guard.
    if (!hasAdminAccess(context.roles) && !context.isStaffAnywhere) {
      throw redirect({ to: '/app' });
    }
  },
  component: AdminShell,
});

function AdminShell() {
  const { permissions, isCourseStaffAnywhere } = Route.useRouteContext();
  // Both links are rendered only when the destination will actually show the
  // actor something — a link to a page that redirects or 403s straight back is
  // worse than no link, and each route guards itself regardless.
  const canSeePeople = hasPermissionKey(permissions, 'user', 'read');
  // `course:read` lists the whole catalogue; a staff-only actor holds no such
  // grant but still gets their own courses back from the same endpoint. So the
  // link's condition is "the index has content for you", not one permission.
  //
  // Course staffing specifically, not `isStaffAnywhere`: a discipline-only SME
  // is in this shell (the guard above admits them) but staffs no course, so
  // the index would come back empty for them and the link would be a dead end.
  const canSeeCourses =
    hasPermissionKey(permissions, 'course', 'read') || isCourseStaffAnywhere;

  return (
    <AdminShellLayout canSeePeople={canSeePeople} canSeeCourses={canSeeCourses}>
      <Outlet />
    </AdminShellLayout>
  );
}
