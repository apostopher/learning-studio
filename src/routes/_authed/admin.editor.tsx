import { createFileRoute, redirect } from '@tanstack/react-router';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its route test.
import { EditorContainer } from '#/components/admin/editor-container';
import { hasAdminAccess } from '#/lib/admin-schemas';

/**
 * The knowledge library editor: every lesson the org owns on the left, every
 * course it runs on the right.
 *
 * Takes NO course parameter, deliberately. The whole point of the editor is
 * that a lesson belongs to the org and can be taught by several courses at
 * once, so there is no course to scope the screen to — see
 * `/api/admin/editor`, whose own doc comment explains why that route refuses a
 * course filter as well.
 *
 * Unlike the per-course board it replaces, this route reads no capability
 * flags out of the route context and passes none down. It is not an omission:
 *
 *  - The course-level toolbar those flags drove (edit / delete / train a
 *    course) has no home on a rail of many courses, and is not rendered here.
 *  - Authority over deleting a LESSON follows the lesson's discipline
 *    (`requireLessonContentPermission`), which the router context — global
 *    `roles` and `permissions` plus two org-wide staffing booleans — cannot
 *    answer for any particular lesson. Mirroring it client-side would mean
 *    guessing. The card offers the control, the server refuses it if it must,
 *    and `useDeleteLesson` turns that 403 into a sentence saying so.
 *
 * The one thing the context CAN answer is whether this screen has any data at
 * all for the actor, which is what `beforeLoad` below decides.
 */
export const Route = createFileRoute('/_authed/admin/editor')({
  beforeLoad: ({ context }) => {
    // Both endpoints behind this screen (`/api/admin/library` and
    // `/api/admin/editor`) self-guard with `requireAdmin` — org admin or
    // owner, nothing narrower. A course- or discipline-scoped staffer who
    // reached this URL would get two 403s and an error panel that blamed a
    // load failure for what is actually a refusal. Sending them to the admin
    // index instead lands them on a page that already states its own refusal
    // in words ("You are not staff on any course…").
    //
    // Tightening the endpoint guards so SMEs can compose their own courses
    // here is a real product question, but it is a change to those routes,
    // not something this route may assume.
    if (!hasAdminAccess(context.roles)) {
      throw redirect({ to: '/admin' });
    }
  },
  component: EditorPage,
});

function EditorPage() {
  return <EditorContainer />;
}
