import { watchedMilestones } from '#/lib/course-milestones';
import type { ResumeTarget } from '#/lib/course-resume';
import { resolveResumeTargetForLevel } from '#/lib/course-resume-level';
import {
  type DetailsCourse,
  watchedLessonSlugs,
} from '#/lib/lesson-gating-inputs';
import type { UserLevel } from '#/types';

type CardResumeArgs = {
  details: DetailsCourse;
  /** Per-lesson distinct watched-milestone counts, straight from the grid query. */
  lessonHits: readonly { lessonId: number; watchedHits: number }[];
  pointerLessonId: number | null;
  /**
   * The pilot's tier in this course, or null for an admin — who authors every
   * tier and so is filtered by none. Without this the card links to the first
   * lesson unlocked in the WHOLE course, which can be one from another tier
   * that the pilot never completed: clicking it redirects to a lesson whose
   * material 403s, and the lesson page bounces straight back to the course.
   */
  level: UserLevel | null;
  bypassLocks: boolean;
};

/**
 * Where a course card should link, resolved without a database.
 *
 * Pure and in `src/lib/` on purpose: `src/db/course.ts` value-imports
 * `@/db/schema`, which vitest cannot resolve, so logic that needs tests cannot
 * live there. Mirrors `resolveResumeTarget`/`watchedLessonSlugs`, which are in
 * `src/lib/` for the same reason.
 */
export function resolveCardResume({
  details,
  lessonHits,
  pointerLessonId,
  level,
  bypassLocks,
}: CardResumeArgs): ResumeTarget {
  // A lesson counts as watched only when EVERY watched-milestone was hit — the
  // same rule as hasWatchedLesson and isVideoWatched. A `> 0` test here would
  // mark a lesson complete after seconds of playback and unlock everything
  // downstream of it.
  //
  // Built from the UNFILTERED payload deliberately: a lesson finished at an
  // earlier tier still satisfies a visible lesson's prerequisite.
  const watched = watchedLessonSlugs(details, {
    lessons: lessonHits.map((hit) => ({
      lessonId: hit.lessonId,
      watched: hit.watchedHits === watchedMilestones.length,
    })),
  });

  return resolveResumeTargetForLevel({
    details,
    watched,
    pointerLessonId,
    level,
    bypassLocks,
  });
}
