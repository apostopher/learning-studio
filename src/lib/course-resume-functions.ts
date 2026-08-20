import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { z } from 'zod';
import { auth } from '#/lib/auth';
import type { ResumeTarget } from '#/lib/course-resume';
import { resumeTargetForUser } from '#/lib/course-resume-for-user';

/**
 * Where `/course/$courseSlug` should redirect this learner.
 *
 * Runs in the route's `beforeLoad`, which on a cold load executes on the
 * SERVER — that is the whole reason the pointer lives in Postgres rather than
 * localStorage. Deciding here means the redirect happens before anything
 * renders, so neither the empty state nor the onboarding widget can flash on
 * a page that is about to navigate away.
 *
 * Derives the user from the session, never from an argument, for the same
 * reason `getMySubscribedSlugs` does. The decision itself lives in
 * `resumeTargetForUser` — see there for why it is not inlined here.
 *
 * Named `-functions.ts`, not `.server.ts`, deliberately: a `.server.ts` module
 * is strictly server-only and Start's import-protection plugin fails the build
 * when a client-reachable file imports one — which a route file always is,
 * even though the handler body is stripped from the client bundle. This
 * follows course-functions.ts, which does exactly this for the parent route's
 * own beforeLoad guard.
 */
export const getCourseResumeTarget = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ courseSlug: z.string().min(1) }))
  .handler(async ({ data }): Promise<ResumeTarget> => {
    const headers = getRequestHeaders();
    const session = await auth.api.getSession({ headers });
    // The parent route's beforeLoad already rejects anonymous callers; an
    // unauthenticated hit here means the guard changed, so report "nothing to
    // resume" rather than inventing a target for a user we cannot identify.
    if (!session) return { kind: 'none', reason: 'no-lessons' };

    return resumeTargetForUser({
      userId: session.user.id,
      courseSlug: data.courseSlug,
    });
  });
