import { createFileRoute } from '@tanstack/react-router';
import { getCourseIdentityBySlug } from '#/db/course';
import {
  getCurrentLevel,
  getUnacknowledgedLevelChange,
} from '#/db/user-levels';
import { auth } from '#/lib/auth';

/**
 * The logged-in pilot's current level for one course (`?slug=`), plus any
 * admin-issued OR earned change they have not yet acknowledged. Any
 * authenticated user may read their own level — the user comes from the
 * session, never the query string, matching the other `/api/user/*` reads in
 * this directory.
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
    return Response.json({ error: 'Course not found' }, { status: 404 });
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
