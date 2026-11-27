import { createFileRoute } from '@tanstack/react-router';
import { format } from 'date-fns';
import { getMyOfferingWindows } from '#/db/course-roster-access';
import { auth } from '#/lib/auth';
import { pickViewerOffering } from '#/lib/viewer-offering';

/**
 * The signed-in user's offering of one course (`?slug=`), for the course
 * header's month and year (user, 2026-11-27: a course runs several times a
 * year). `{ startsOn: null }` when they are on none of its offerings — staff
 * previewing, say — and for a slug that names no course, so the answer says
 * nothing about which courses exist. Only the user's own rows are read: the
 * user comes from the session, never the query string.
 */
export async function getMyOfferingHandler(
  request: Request,
): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }
  const slug = new URL(request.url).searchParams.get('slug');
  if (!slug) {
    return Response.json({ error: 'slug is required' }, { status: 400 });
  }
  const windows = await getMyOfferingWindows(session.user.id, slug);
  const picked = pickViewerOffering(windows, format(new Date(), 'yyyy-MM-dd'));
  return Response.json({ startsOn: picked?.startsOn ?? null });
}

export const Route = createFileRoute('/api/user/my-offering')({
  server: {
    handlers: { GET: ({ request }) => getMyOfferingHandler(request) },
  },
});
