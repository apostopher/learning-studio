import { createFileRoute } from '@tanstack/react-router';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its route test.
import { EditorContainer } from '#/components/admin/editor-container';
import { hasAdminAccess, hasPermissionKey } from '#/lib/admin-schemas';

/**
 * The knowledge library editor: every lesson the org owns on the left, every
 * course it runs on the right. This is the **composing** surface — link a
 * lesson into a course, move it between modules, reorder, remove. What a
 * lesson IS (video, material, quiz, gates) is edited on the per-course
 * configure surface at `/admin/$courseId/editor`; the two are reachable from
 * each other through the admin nav and through each course column's
 * "Configure" link.
 *
 * Takes NO course parameter, deliberately. A lesson belongs to the org and can
 * be taught by several courses at once, so there is no course to scope the
 * screen to — see `/api/admin/editor`, whose own doc comment explains why that
 * route refuses a course filter too.
 *
 * **No `beforeLoad` of its own, on purpose.** Its two endpoints
 * (`/api/admin/library`, `/api/admin/editor`) now admit anyone `isStaffAnywhere`
 * — admin/owner, course staff, or discipline SME — which is exactly the
 * population the parent `/admin` route already admits (`admin.tsx`). A second
 * copy of the same condition here would be one more place to keep in sync and
 * the first to drift; the nav link's gate mirrors the same union, and
 * `admin-shell-nav.test.tsx` pins it.
 *
 * It reads three capability flags out of the route context, all org-level
 * questions the context can actually answer, and each mirroring the guard on
 * the endpoint behind it (RBAC rules 1, 3 and 5). Nothing else is threaded: the course toolbar
 * has no home on a rail of many courses, and authority over deleting a LESSON
 * follows the lesson's discipline (`requireLessonContentPermission`), which
 * the router context — global roles and permissions plus two org-wide staffing
 * booleans — cannot answer for any particular lesson. The card offers the
 * control, the server refuses it if it must, and `useDeleteLesson` turns that
 * 403 into a sentence saying so.
 */
export const Route = createFileRoute('/_authed/admin/editor')({
  component: EditorPage,
});

function EditorPage() {
  const { permissions, roles, isStaffAnywhere, isCourseManagerAnywhere } =
    Route.useRouteContext();
  return (
    <EditorContainer
      capabilities={{
        // RBAC rule 1 — a course manager, a subject expert or an admin may
        // CREATE a discipline. Mirrors `requireDisciplineCreation`, which is
        // the guard form of this same union.
        canCreateDiscipline: hasAdminAccess(roles) || isStaffAnywhere,
        // Rule 3 — renaming and deleting a discipline stay admin-only, as does
        // appointing its experts. Naming a new subject is cheap and reversible
        // by its author; handing out authority over one is not, and letting an
        // SME do it would make expert assignment self-propagating.
        canManageDisciplines: hasAdminAccess(roles),
        // Rule 5 — a course manager or an admin may create a new offering. A
        // subject expert is deliberately absent: they author lessons, they do
        // not decide which courses the org sells. Mirrors
        // `requireCourseCreation`.
        canCreateCourse:
          hasPermissionKey(permissions, 'course', 'create') ||
          isCourseManagerAnywhere,
      }}
    />
  );
}
