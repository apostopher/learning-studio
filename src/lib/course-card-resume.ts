import { watchedMilestones } from '#/lib/course-milestones';
import { type ResumeTarget, resolveResumeTarget } from '#/lib/course-resume';
import {
  type DetailsCourse,
  toGateCourse,
  watchedLessonSlugs,
} from '#/lib/lesson-gating-inputs';

type CardResumeArgs = {
  details: DetailsCourse;
  /** Per-lesson distinct watched-milestone counts, straight from the grid query. */
  lessonHits: readonly { lessonId: number; watchedHits: number }[];
  pointerLessonId: number | null;
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
  bypassLocks,
}: CardResumeArgs): ResumeTarget {
  // A lesson counts as watched only when EVERY watched-milestone was hit — the
  // same rule as hasWatchedLesson and isVideoWatched. A `> 0` test here would
  // mark a lesson complete after seconds of playback and unlock everything
  // downstream of it.
  const watched = watchedLessonSlugs(details, {
    lessons: lessonHits.map((hit) => ({
      lessonId: hit.lessonId,
      watched: hit.watchedHits === watchedMilestones.length,
    })),
  });

  // The pointer is stored as an FK; the predicate works in slugs. An id absent
  // from the payload — deleted, made WIP, or a cache race — resolves to null,
  // which resolveResumeTarget treats exactly like a first visit.
  const pointerLessonSlug =
    pointerLessonId == null
      ? null
      : (details.modules
          .flatMap((m) => m.lessons)
          .find((l) => l.id === pointerLessonId)?.slug ?? null);

  return resolveResumeTarget({
    course: toGateCourse(details),
    watched,
    pointerLessonSlug,
    bypassLocks,
  });
}
