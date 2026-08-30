import { createFileRoute } from '@tanstack/react-router';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its route test.
import { getOrgEditorBoard } from '#/db/editor';
import { getActiveOrgId } from '#/lib/active-org.server';
import { ForbiddenError, requireAdmin } from '#/lib/admin-functions.server';

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
  try {
    await requireAdmin(request.headers);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return new Response('Forbidden', { status: 403 });
    }
    throw error;
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
