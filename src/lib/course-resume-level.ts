import { type ResumeTarget, resolveResumeTarget } from '#/lib/course-resume';
import { type DetailsCourse, toGateCourse } from '#/lib/lesson-gating-inputs';
import { filterCourseToLevel } from '#/lib/level-visibility';
import type { UserLevel } from '#/types';

export type ResolveResumeForLevelArgs = {
  /** The UNFILTERED course payload, exactly as the cache returns it. */
  details: DetailsCourse;
  /**
   * Lesson slugs whose video this pilot has watched, computed from the
   * UNFILTERED payload by the caller — see the note below on why.
   */
  watched: ReadonlySet<string>;
  /** The resume pointer as stored: a lesson FK, or null on a first visit. */
  pointerLessonId: number | null;
  /** The pilot's tier, or null for an admin — who has no tier and no filter. */
  level: UserLevel | null;
  bypassLocks: boolean;
};

/**
 * Where this pilot should resume, decided against the lessons they can
 * actually open.
 *
 * The whole reason this exists: `resolveResumeTarget` answers with the first
 * lesson it finds unlocked, and against an unfiltered course that answer can
 * be a lesson from another tier that the pilot never completed. `/course/$slug`
 * would redirect there, `/api/lesson/material` would 403 `out-of-tier`, and
 * `lesson-main-wrapper` would navigate straight back to `/course/$slug` — a
 * redirect loop that, once both the resume answer and the material error are
 * cached, spins with no network at all.
 *
 * The split mirrors `evaluateLessonGate`:
 *
 * - the COURSE handed to the predicate is level-filtered, so a lesson the
 *   pilot cannot see can neither be resumed into nor named as a blocker;
 * - `watched` is computed from the UNFILTERED payload, so a lesson finished at
 *   an earlier tier still satisfies a prerequisite of a visible one. Filtering
 *   it out of `watched` would lock visible lessons behind invisible ones.
 *
 * The pointer is resolved against the FILTERED tree too: a pointer parked on
 * an out-of-tier lesson (which is exactly where a promotion leaves it) must
 * fall through to `firstOpen()` rather than resume the pilot into the
 * read-only archive of the lesson they just finished.
 */
export function resolveResumeTargetForLevel({
  details,
  watched,
  pointerLessonId,
  level,
  bypassLocks,
}: ResolveResumeForLevelArgs): ResumeTarget {
  const visible =
    level === null ? details : filterCourseToLevel(details, level);

  // id → slug, against the visible tree. An id absent from it — deleted, made
  // WIP, a cache race, or now out of tier — resolves to null, which
  // resolveResumeTarget treats exactly like a first visit.
  const pointerLessonSlug =
    pointerLessonId == null
      ? null
      : (visible.modules
          .flatMap((m) => m.lessons)
          .find((l) => l.id === pointerLessonId)?.slug ?? null);

  return resolveResumeTarget({
    course: toGateCourse(visible),
    watched,
    pointerLessonSlug,
    bypassLocks,
  });
}
