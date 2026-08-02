import { createFileRoute } from '@tanstack/react-router';
import { auth } from '#/lib/auth';
import { getLibraryForUser } from '#/lib/library.server';

/**
 * The library files one learner may see in one course (`?courseSlug=`), each
 * with its lock and — when locked — the lesson or module that clears it.
 *
 * No blob URL is present in this payload by construction: `getLibraryForCourse`
 * does not select the column. Downloads go through /api/library/download/$fileId,
 * which re-runs the gate (D10).
 */
export async function getLibraryHandler(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const courseSlug = new URL(request.url).searchParams.get('courseSlug');
  if (!courseSlug) {
    return Response.json({ error: 'courseSlug is required' }, { status: 400 });
  }

  try {
    const result = await getLibraryForUser({
      userId: session.user.id,
      courseSlug,
    });
    // A course that does not exist and a course the caller is not enrolled in
    // are answered differently on purpose here, unlike the download route: the
    // page route's own `beforeLoad` has already redirected any non-subscriber
    // away, so this is not a reachable enumeration surface for a student, and
    // an empty list is a truthful answer for the enrolled-but-nothing-yet case.
    if (!result) {
      return Response.json({ error: 'Course not found' }, { status: 404 });
    }
    return Response.json(result);
  } catch (error) {
    console.error('Failed to read course library:', error);
    return Response.json({ error: 'Failed to load library' }, { status: 500 });
  }
}

export const Route = createFileRoute('/api/course/library')({
  server: {
    handlers: {
      GET: ({ request }) => getLibraryHandler(request),
    },
  },
});
