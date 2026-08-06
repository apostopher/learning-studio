import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { auth } from '#/lib/auth';
import {
  getSkaProfileForCourse,
  reviewSkaProfile,
} from '#/lib/ska-profile.server';
import { SkaProfileSchema } from '#/types';

/**
 * Zod strips unknown keys, which is load-bearing rather than incidental here:
 * a `userId` or `reviewedAt` smuggled into the body never survives parsing.
 * The handler reads the user from the session, and `reviewedAt` is stamped by
 * the database — a client must not be able to declare its own profile
 * reviewed without going through the button that means it.
 *
 * The three sections are validated against the SAME schema storage uses, so
 * the per-section cap is enforced at the boundary rather than discovered as a
 * database error. An over-long section is REJECTED here (a 400 the form
 * renders inline), not truncated: the user is present and can see the limit,
 * and silently eating their last paragraph would be worse than telling them.
 * Model output is truncated instead — see `truncateSkaSections` for why the
 * two directions differ.
 */
const SaveBodySchema = z.object({
  courseSlug: z.string().min(1),
  profile: SkaProfileSchema,
});

const CourseSlugSchema = z.string().min(1);

/**
 * Reads the caller's own SKA profile for one course.
 *
 * A 200 with `profile: null` is the correct answer for a learner who has none
 * — no profile is a permanently legitimate state (generation is best-effort,
 * and a thin interview can produce nothing), so it must not be a 404.
 *
 * SECURITY: `userId` comes from `auth.api.getSession` and nowhere else. The
 * profile is resolved from (session user, slug), so no request can read
 * another user's profile by naming it.
 */
export async function getSkaProfileHandler(
  request: Request,
): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const parsed = CourseSlugSchema.safeParse(
    new URL(request.url).searchParams.get('courseSlug'),
  );
  if (!parsed.success) {
    return Response.json({ error: 'courseSlug is required' }, { status: 400 });
  }

  try {
    const result = await getSkaProfileForCourse({
      userId: session.user.id,
      courseSlug: parsed.data,
    });

    if (!result.ok) {
      return Response.json({ error: 'Course not found' }, { status: 404 });
    }

    return Response.json({ profile: result.profile });
  } catch (error) {
    console.error('Failed to load SKA profile:', error);
    return Response.json({ error: 'Failed to load profile' }, { status: 500 });
  }
}

/**
 * Saves the learner's edits AND marks the profile reviewed — one action, one
 * button, one request.
 *
 * There is deliberately no way to save without reviewing, and none to review
 * without saving. Splitting them would create an edited-but-unreviewed state
 * that the UI cannot represent and that would keep a profile the user just
 * confirmed out of every prompt.
 *
 * 404 on a missing profile rather than creating one: the only way the row
 * disappears between load and save is a withdrawal in another tab, and
 * upserting here would resurrect data the user asked to erase.
 */
export async function saveSkaProfileHandler(
  request: Request,
): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = SaveBodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await reviewSkaProfile({
      userId: session.user.id,
      courseSlug: parsed.data.courseSlug,
      profile: parsed.data.profile,
    });

    if (!result.ok) {
      return result.reason === 'course_not_found'
        ? Response.json({ error: 'Course not found' }, { status: 404 })
        : Response.json({ error: 'Profile not found' }, { status: 404 });
    }

    return Response.json({ profile: result.profile });
  } catch (error) {
    console.error('Failed to save SKA profile:', error);
    return Response.json({ error: 'Failed to save profile' }, { status: 500 });
  }
}

export const Route = createFileRoute('/api/course/ska-profile')({
  server: {
    handlers: {
      GET: ({ request }) => getSkaProfileHandler(request),
      POST: ({ request }) => saveSkaProfileHandler(request),
    },
  },
});
