import { watchedMilestones } from '#/lib/course-milestones';
import type { ResumeTarget } from '#/lib/course-resume';
import { resolveResumeTargetForLevel } from '#/lib/course-resume-level';
import { type DetailsCourse, gateProgress } from '#/lib/lesson-gating-inputs';
import type { UserLevel } from '#/types';

type CardResumeArgs = {
  details: DetailsCourse;
  /** Per-lesson distinct watched-milestone counts, straight from the grid query. */
  lessonHits: readonly { lessonId: number; watchedHits: number }[];
  /**
   * Lessons with a `lesson_completions` row — sticky done. These, not the
   * watched videos, satisfy prerequisites.
   */
  doneLessonIds: ReadonlySet<number>;
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
 * live there. Mirrors `resolveResumeTarget`/`gateProgress`, which are in
 * `src/lib/` for the same reason.
 */
export function resolveCardResume({
  details,
  lessonHits,
  doneLessonIds,
  pointerLessonId,
  level,
  bypassLocks,
}: CardResumeArgs): ResumeTarget {
  // A lesson counts as watched only when EVERY watched-milestone was hit — the
  // same rule as hasWatchedLesson and isVideoWatched. A `> 0` test here would
  // mark a lesson complete after seconds of playback and unlock everything
  // downstream of it.
  //
  // `watched` only decides material locks, which resume never reads; done is
  // what unlocks the next lesson. No outstanding items: a card renders no
  // lock copy.
  //
  // Built from the UNFILTERED payload deliberately: a lesson done at an
  // earlier tier still satisfies a visible lesson's prerequisite.
  const watchedIds = new Set(
    lessonHits
      .filter((hit) => hit.watchedHits === watchedMilestones.length)
      .map((hit) => hit.lessonId),
  );
  const ids = new Set([...watchedIds, ...doneLessonIds]);
  const progress = gateProgress(details, {
    lessons: [...ids].map((lessonId) => ({
      lessonId,
      watched: watchedIds.has(lessonId),
      done: doneLessonIds.has(lessonId),
    })),
  });

  return resolveResumeTargetForLevel({
    details,
    progress,
    pointerLessonId,
    level,
    bypassLocks,
  });
}
