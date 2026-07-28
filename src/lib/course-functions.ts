import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { getMyCourses } from '@/db/course';
import { auth } from '@/lib/auth';

/**
 * Slugs of the courses the caller is subscribed to — for route-level access
 * guards (see `course.$courseSlug.tsx`'s `beforeLoad`).
 *
 * Always derives the user from the session, never from an argument: the
 * whole point of this function is that the guard cannot be steered by the
 * caller into reporting access it doesn't have.
 */
export const getMySubscribedSlugs = createServerFn({ method: 'GET' }).handler(
  async () => {
    const headers = getRequestHeaders();
    const session = await auth.api.getSession({ headers });
    if (!session) return [];
    const courses = await getMyCourses(session.user.id);
    return courses.map((c) => c.slug);
  },
);
