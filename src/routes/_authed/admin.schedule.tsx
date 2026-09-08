import { createFileRoute, redirect } from '@tanstack/react-router';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its route test.
import { SchedulePageContainer } from '#/components/admin/schedule/schedule-page-container';
import { hasOrgPermission } from '#/lib/admin-schemas';

/**
 * The schedule board: when each course actually runs.
 *
 * Entry mirrors the Courses index, because the screen answers a question
 * about the same objects — the whole catalogue for someone with
 * `course:read`, otherwise the courses they are staffed on. A staff-only
 * actor reaches it and sees their own; anyone else is sent back.
 *
 * The gate here decides ENTRY only. Every offering read and write goes
 * through its own server-side guard in `/api/admin/offerings`, which is what
 * actually enforces this — a client-side check is a courtesy to the reader,
 * never a control.
 */
export const Route = createFileRoute('/_authed/admin/schedule')({
  beforeLoad: ({ context }) => {
    const canRead =
      hasOrgPermission(context.roles, context.permissions, 'course', 'read') ||
      context.isCourseStaffAnywhere;
    if (!canRead) throw redirect({ to: '/admin' });
  },
  component: ScheduleRoute,
});

function ScheduleRoute() {
  const { roles, permissions, isCourseManagerAnywhere } =
    Route.useRouteContext();

  // The same union the API's write guard uses (`requireCourseCreation`, RBAC
  // rule 5): a course manager or an admin. Read in the route because that is
  // the only place holding permissions — and passed down rather than
  // re-derived, so the rail's copy and the server's answer cannot disagree.
  return (
    <SchedulePageContainer
      canSchedule={
        hasOrgPermission(roles, permissions, 'course', 'create') ||
        isCourseManagerAnywhere
      }
    />
  );
}
