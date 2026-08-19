import { createFileRoute } from '@tanstack/react-router';
import { getCourseIdentityBySlug } from '#/db/course';
import { isSubscribedToCourse } from '#/db/lesson-access';
import {
  getCurrentLevel,
  getUnacknowledgedLevelChange,
} from '#/db/user-levels';
import { auth } from '#/lib/auth';

/**
 * The logged-in pilot's current level for one course (`?slug=`), plus any
 * admin-issued OR earned change they have not yet acknowledged. Any user
 * SUBSCRIBED to the course may read their own level — the user comes from the
 * session, never the query string, matching the other `/api/user/*` reads in
 * this directory.
 *
 * "No such course" and "not your course" deliberately collapse into the same
 * 403. Answering 404 for one and 200 for the other made this an existence
 * oracle for the whole catalogue, which is exactly what
 * `routes/_authed/course.$courseSlug.tsx` refuses to be: it redirects the
 * bogus-slug and the not-enrolled cases to the same place so nobody can
 * enumerate courses by probing.
 */
export async function getMyLevelHandler(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const slug = new URL(request.url).searchParams.get('slug');
  if (!slug) {
    return Response.json({ error: 'slug is required' }, { status: 400 });
  }

  const course = await getCourseIdentityBySlug(slug);
  if (course === null) {
    return new Response('Forbidden', { status: 403 });
  }

  if (!(await isSubscribedToCourse(session.user.id, course.id))) {
    return new Response('Forbidden', { status: 403 });
  }

  const [level, pending] = await Promise.all([
    getCurrentLevel(session.user.id, course.id),
    getUnacknowledgedLevelChange(session.user.id, course.id),
  ]);

  return Response.json({
    level,
    pendingChange: pending
      ? {
          id: pending.id,
          level: pending.level,
          message: pending.message,
          // 'earned' vs 'admin' — the client's copy differs by kind: an
          // earned promotion is an achievement, an admin change is something
          // done to the pilot and carries the admin's message.
          source: pending.source,
        }
      : null,
  });
}

export const Route = createFileRoute('/api/user/my-level')({
  server: { handlers: { GET: ({ request }) => getMyLevelHandler(request) } },
});
