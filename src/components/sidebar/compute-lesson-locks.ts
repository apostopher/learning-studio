import { evaluateLessonLock, type LessonLock } from '#/lib/lesson-gating';
import {
  type DetailsCourse,
  toGateCourse,
  watchedLessonSlugs,
} from '#/lib/lesson-gating-inputs';

/**
 * Lock state per lesson slug, for the sidebar.
 *
 * Computed on the client from data already fetched — the course payload and
 * the progress summary — so this needs no new endpoint and, critically, no
 * per-user data in getCourseDetailsWithCache, whose Redis entry is keyed by
 * course slug and shared across every student.
 *
 * The server still enforces. This exists so a student never has to click into
 * a lesson to discover it was locked.
 *
 * Returns an empty map when either input has not resolved yet, so a
 * half-loaded sidebar never shows a spurious lock — a student briefly seeing
 * every lesson locked would be worse than seeing none locked.
 */
export function computeLessonLocks(
  details: DetailsCourse | undefined,
  progress:
    | { lessons: readonly { lessonId: number; watched: boolean }[] }
    | undefined,
): Record<string, LessonLock> {
  if (!details || !progress) return {};
  const course = toGateCourse(details);
  const watched = watchedLessonSlugs(details, progress);
  const locks: Record<string, LessonLock> = {};
  for (const module of course.modules) {
    for (const lesson of module.lessons) {
      locks[lesson.slug] = evaluateLessonLock(course, lesson.slug, watched);
    }
  }
  return locks;
}
