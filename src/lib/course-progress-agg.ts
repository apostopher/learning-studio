import { watchedMilestones } from './course-milestones';

/**
 * Milestones that count toward completion (10..95 — every milestone except the
 * final 100). A lesson is 100% / "watched" once all of these are hit; see
 * course-milestones.ts for why 100 is excluded.
 */
const WATCHED_TOTAL = watchedMilestones.length;

/**
 * One DB row per lesson: how many distinct watched-milestones the user hit for
 * that lesson's video. `lessonId: null` is a placeholder for a module with no
 * lessons, so empty modules still count as 0% in their course's average.
 */
export type LessonProgressRow = {
  moduleId: number;
  lessonId: number | null;
  videoId: string | null;
  watchedHits: number;
};

export type LessonProgress = {
  lessonId: number;
  moduleId: number;
  videoId: string | null;
  percent: number;
  watched: boolean;
};

export type ModuleProgress = {
  moduleId: number;
  percent: number;
  watchedLessons: number;
  totalLessons: number;
};

export type CourseProgress = {
  slug: string;
  percent: number;
  watchedLessons: number;
  totalLessons: number;
  modules: ModuleProgress[];
  lessons: LessonProgress[];
};

/** round(distinct watched-milestones hit / 18 · 100); 18/18 → 100. */
function lessonPercent(watchedHits: number): number {
  const capped = Math.min(watchedHits, WATCHED_TOTAL);
  return Math.round((capped / WATCHED_TOTAL) * 100);
}

/**
 * Roll per-lesson watched-milestone counts up into lesson / module / course
 * percentages. Pure — the DB layer supplies `rows`, pre-ordered by module then
 * lesson rank so the output arrays are stable.
 *
 * - lesson%  = round(distinct watched-milestones hit / 18 · 100); watched ⇔ 100%.
 * - module%  = round(avg of its lessons' %); 0 for a module with no lessons.
 * - course%  = round(avg of its modules' %); 0 for a course with no modules.
 */
export function aggregateCourseProgress(
  slug: string,
  rows: LessonProgressRow[],
): CourseProgress {
  const moduleOrder: number[] = [];
  const lessonsByModule = new Map<number, LessonProgress[]>();

  for (const row of rows) {
    let moduleLessons = lessonsByModule.get(row.moduleId);
    if (!moduleLessons) {
      moduleLessons = [];
      lessonsByModule.set(row.moduleId, moduleLessons);
      moduleOrder.push(row.moduleId);
    }
    if (row.lessonId === null) continue; // empty-module placeholder
    moduleLessons.push({
      lessonId: row.lessonId,
      moduleId: row.moduleId,
      videoId: row.videoId,
      percent: lessonPercent(row.watchedHits),
      watched: row.watchedHits >= WATCHED_TOTAL,
    });
  }

  const modules: ModuleProgress[] = [];
  const lessons: LessonProgress[] = [];
  for (const moduleId of moduleOrder) {
    const moduleLessons = lessonsByModule.get(moduleId) ?? [];
    lessons.push(...moduleLessons);
    const totalLessons = moduleLessons.length;
    const watchedLessons = moduleLessons.reduce(
      (n, l) => n + (l.watched ? 1 : 0),
      0,
    );
    const percent =
      totalLessons === 0
        ? 0
        : Math.round(
            moduleLessons.reduce((s, l) => s + l.percent, 0) / totalLessons,
          );
    modules.push({ moduleId, percent, watchedLessons, totalLessons });
  }

  const totalLessons = modules.reduce((n, m) => n + m.totalLessons, 0);
  const watchedLessons = modules.reduce((n, m) => n + m.watchedLessons, 0);
  const percent =
    modules.length === 0
      ? 0
      : Math.round(modules.reduce((s, m) => s + m.percent, 0) / modules.length);

  return { slug, percent, watchedLessons, totalLessons, modules, lessons };
}
