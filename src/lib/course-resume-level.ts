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
  /**
   * The pilot's tier, or null when their training team has not set one —
   * strict levels then give them nothing to resume into. Ignored for an
   * author (`bypassLocks`), who has no tier and no filter; callers pass null
   * there too.
   */
  level: UserLevel | null;
  /** True for an author (admin, or staff on this course): no level filter, no locks. */
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
  if (bypassLocks) {
    return resolveForTree(details, watched, pointerLessonId, true);
  }

  // Said before anything is filtered, so the empty state names the real
  // reason — "your level has not been set" — rather than the generic one.
  if (level === null) return { kind: 'none', reason: 'no-level' };

  const visible = filterCourseToLevel(details, level);

  // The course has lessons, just none at this pilot's level. Distinct from
  // `no-lessons` (nothing published at all) because the remedy differs: this
  // one is for their training team, not for waiting on authors.
  if (
    visible.modules.length === 0 &&
    details.modules.some((mod) => mod.lessons.some((l) => l.isAvailable))
  ) {
    return { kind: 'none', reason: 'no-lessons-at-level' };
  }

  return resolveForTree(visible, watched, pointerLessonId, false);
}

/** Resolve against the tree this viewer can see (filtered, or whole for an author). */
function resolveForTree(
  visible: DetailsCourse,
  watched: ReadonlySet<string>,
  pointerLessonId: number | null,
  bypassLocks: boolean,
): ResumeTarget {
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
