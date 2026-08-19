import { isLessonVisibleAtLevel } from '#/lib/level-visibility';
import type { UserLevel } from '#/types';

export type ArchivedLesson = {
  slug: string;
  moduleSlug: string;
  name: string;
};

type ArchivableLesson = {
  id: number;
  slug: string;
  name: string;
  levels: readonly string[];
};
type ArchivableModule = {
  slug: string;
  lessons: readonly ArchivableLesson[];
};
type ArchivableCourse = { modules: readonly ArchivableModule[] };

type ProgressLesson = { lessonId: number; percent: number };
type ProgressLike = { lessons: readonly ProgressLesson[] };

/**
 * Lessons the pilot completed at an earlier level and can no longer see in
 * the main tree — the sidebar's "Completed at earlier levels" disclosure.
 *
 * Derived entirely from data the sidebar already loads: the UNFILTERED
 * course tree (`detailsQuery.data`, before `filterCourseToLevel` runs) joined
 * against the progress rollup (`progressQuery.data`) already fetched for the
 * percent rings. No new endpoint. A lesson qualifies when it is invisible at
 * the pilot's CURRENT level (the same predicate `filterCourseToLevel` uses)
 * AND its progress is 100% — anything less was never finished, so it is not
 * "archived", it is simply out of reach (and, per the read-only design, not
 * reachable at all: `/api/lesson/material` 403s a never-completed
 * out-of-tier lesson).
 *
 * Admins are not filtered here — this is a pilot-facing view of THEIR OWN
 * completed work, and `CourseSidebarWrapper` does not call this for admins
 * (whose tree is never filtered to begin with, so nothing is ever "earlier").
 */
export function computeArchivedLessons(
  course: ArchivableCourse | null | undefined,
  progress: ProgressLike | null | undefined,
  level: UserLevel,
): ArchivedLesson[] {
  if (!course || !progress) return [];
  const percentByLessonId = new Map(
    progress.lessons.map((l) => [l.lessonId, l.percent]),
  );
  const archived: ArchivedLesson[] = [];
  for (const mod of course.modules) {
    for (const lesson of mod.lessons) {
      if (isLessonVisibleAtLevel(lesson.levels, level)) continue;
      const percent = percentByLessonId.get(lesson.id) ?? 0;
      if (percent < 100) continue;
      archived.push({
        slug: lesson.slug,
        moduleSlug: mod.slug,
        name: lesson.name,
      });
    }
  }
  return archived;
}
