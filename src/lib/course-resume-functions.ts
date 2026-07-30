import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { z } from 'zod';
import { getUserRoleNames } from '#/db/admin';
import { getCourseDetailsWithCache } from '#/db/course';
import { getLastViewedLessonId } from '#/db/course-last-viewed';
import { getCourseProgress } from '#/db/course-progress';
import { ADMIN_ROLE } from '#/lib/admin-schemas';
import { auth } from '#/lib/auth';
import { type ResumeTarget, resolveResumeTarget } from '#/lib/course-resume';
import { toGateCourse, watchedLessonSlugs } from '#/lib/lesson-gating-inputs';

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
 * reason `getMySubscribedSlugs` does.
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

    const userId = session.user.id;
    const [details, roles, pointerLessonId] = await Promise.all([
      getCourseDetailsWithCache(data.courseSlug),
      getUserRoleNames(userId),
      getLastViewedLessonId({ userId, courseSlug: data.courseSlug }),
    ]);

    // Not the "course doesn't exist" case — the parent beforeLoad already
    // confirmed a subscription to this slug. A missing payload means Redis is
    // down or a cache-population race lost, and rendering "this course has no
    // lessons yet" would state something false about the course. Throwing
    // surfaces it as a real, retryable error, matching evaluateLessonGate's
    // handling of the same condition.
    if (!details) {
      throw new Error(`Course payload unavailable for ${data.courseSlug}`);
    }

    const isAdmin = roles.includes(ADMIN_ROLE);

    // Progress is only needed to evaluate locks, and an admin has none to
    // evaluate — skip the aggregation entirely for them.
    const progress = isAdmin
      ? { lessons: [] as { lessonId: number; watched: boolean }[] }
      : await getCourseProgress({ userId, slug: data.courseSlug });

    // id → slug. The pointer is stored as an FK (a slug would rot on rename),
    // while the predicate works in slugs. An id absent from the payload —
    // deleted, made WIP, or a cache race — resolves to null, which
    // resolveResumeTarget treats exactly like a first visit.
    const pointerLessonSlug =
      pointerLessonId == null
        ? null
        : (details.modules
            .flatMap((m) => m.lessons)
            .find((l) => l.id === pointerLessonId)?.slug ?? null);

    return resolveResumeTarget({
      course: toGateCourse(details),
      watched: watchedLessonSlugs(details, progress),
      pointerLessonSlug,
      bypassLocks: isAdmin,
    });
  });
