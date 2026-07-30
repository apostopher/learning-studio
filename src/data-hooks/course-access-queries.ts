import type { ResumeTarget } from '#/lib/course-resume';
import { getCourseResumeTarget } from '#/lib/course-resume-functions';
import { getMySubscribedSlugs } from '#/lib/course-functions';
import { dataKeys } from './keys';

/**
 * The two blocking guards on the course routes, expressed as query options so
 * `beforeLoad` can prime them via `ensureQueryData`.
 *
 * This is what makes `defaultPreload: 'intent'` pay off. The router's own
 * preload cache is deliberately disabled (`defaultPreloadStaleTime: 0`, which
 * the SSR-Query integration requires), so a hover-preload only helps if the
 * work lands in a cache React Query owns — which is exactly this one.
 */

/**
 * Slugs the signed-in learner is subscribed to.
 *
 * A list rather than a per-slug check because one cache entry then serves
 * every card on the grid. 5 minutes because enrollment changes rarely, and a
 * stale entry cannot grant access it should not: the list is derived from the
 * session on the server on every real fetch, and the worst a stale positive
 * achieves is letting a just-unenrolled learner reach a course page whose own
 * data fetches will fail.
 */
export const subscribedSlugsQueryOptions = () => ({
  queryKey: dataKeys.subscribedSlugs(),
  queryFn: (): Promise<string[]> => getMySubscribedSlugs(),
  staleTime: 5 * 60_000,
});

/**
 * Where `/course/$courseSlug` should send this learner.
 *
 * 30s: long enough that a hover-preload survives to the click, short enough
 * that it re-resolves within a single lesson. Keyed per slug so two courses
 * never share an answer.
 */
export const courseResumeQueryOptions = (courseSlug: string) => ({
  queryKey: dataKeys.courseResume(courseSlug),
  queryFn: (): Promise<ResumeTarget> =>
    getCourseResumeTarget({ data: { courseSlug } }),
  staleTime: 30_000,
});
