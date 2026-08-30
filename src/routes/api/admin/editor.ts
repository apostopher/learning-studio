import { createFileRoute } from '@tanstack/react-router';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its route test.
import { getOrgEditorBoard } from '#/db/editor';
import { getActiveOrgId } from '#/lib/active-org.server';
import { isStaffAnywhere } from '#/lib/permissions.server';

/**
 * One board per course in the active org — the editor's horizontal course
 * rail, shown beside the library.
 *
 * Deliberately takes no `courseId` (or any other filter) of any kind:
 * `getOrgEditorBoard`'s `course_orgs` join is the ONLY tenant-isolation
 * boundary for this data (see its doc comment in `#/db/editor`) —
 * `getCourseBoard` performs no org check on the id it's handed. A filter
 * param here would let a caller ask this route for a course outside the
 * active org and get an honest answer back.
 */
export async function getEditorBoardHandler(
  request: Request,
): Promise<Response> {
  // NOT `requireAdmin`. The knowledge library exists for the discipline-scoped
  // subject expert built in Task 6r, and an admin-only floor 403s exactly the
  // role the screen is for. `isStaffAnywhere` is the union this needs —
  // admin/owner, any `course_staff` row, any `discipline_staff` row — i.e.
  // "has standing somewhere on the teaching side". Course staff are in
  // deliberately: the editor's right-hand pane IS course composition, which is
  // course-scoped `structure` work.
  //
  // This gates OPENING the screen and nothing else. Editing a lesson still
  // needs `requireLessonContentPermission` on that lesson's discipline, and
  // every placement write still needs `requireCoursePermission(courseId,
  // 'structure', …)`. Both are enforced per request on their own routes.
  //
  // It returns a boolean rather than throwing, and is false (never throwing)
  // for an anonymous caller — so there is no try/catch here and no path on
  // which the query below runs unauthenticated.
  if (!(await isStaffAnywhere(request.headers))) {
    return new Response('Forbidden', { status: 403 });
  }

  return Response.json(await getOrgEditorBoard(getActiveOrgId()));
}

export const Route = createFileRoute('/api/admin/editor')({
  server: {
    handlers: {
      GET: ({ request }) => getEditorBoardHandler(request),
    },
  },
});
