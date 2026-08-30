import { createFileRoute } from '@tanstack/react-router';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its route test.
import { EditorContainer } from '#/components/admin/editor-container';

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
 * It also reads no capability flags out of the route context, unlike the
 * per-course route. Neither of the two things those flags fed survives here:
 * the course toolbar has no home on a rail of many courses, and authority over
 * deleting a LESSON follows the lesson's discipline
 * (`requireLessonContentPermission`), which the router context — global roles
 * and permissions plus two org-wide staffing booleans — cannot answer for any
 * particular lesson. The card offers the control, the server refuses it if it
 * must, and `useDeleteLesson` turns that 403 into a sentence saying so.
 */
export const Route = createFileRoute('/_authed/admin/editor')({
  component: EditorPage,
});

function EditorPage() {
  return <EditorContainer />;
}
