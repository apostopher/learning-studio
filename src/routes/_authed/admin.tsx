import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its route test — the gate below is the switch that
// makes course-scoped AND discipline-scoped roles reachable at all.
import { AdminShellLayout } from '#/components/admin/admin-shell-layout';
import { hasAdminAccess } from '#/lib/admin-schemas';
import { adminSectionGates, visibleAdminSections } from '#/lib/admin-sections';

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
    // decides: every section's data still goes through a server-side
    // per-course (or per-discipline) guard.
    if (!hasAdminAccess(context.roles) && !context.isStaffAnywhere) {
      throw redirect({ to: '/app' });
    }
  },
  component: AdminShell,
});

function AdminShell() {
  const context = Route.useRouteContext();
  // The same call the section screen's own gate makes, so a link that is
  // offered and a section that may be entered can never disagree — see
  // `adminSectionGates`. Which link is HIGHLIGHTED is the router's own
  // business: the section is in the URL, so `Link` can see it.
  const sections = visibleAdminSections(adminSectionGates(context));

  return (
    <AdminShellLayout sections={sections}>
      <Outlet />
    </AdminShellLayout>
  );
}
