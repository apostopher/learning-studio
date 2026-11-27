import { FLAGSHIP_COURSE_SLUG } from '#/lib/flagship-course';

/** What the student sidebar heads the 3D Airmanship group with. */
export const FLAGSHIP_GROUP_LABEL = '3D Airmanship';

type SplittableModule = {
  lessons: readonly { levelGated?: boolean }[];
};

/**
 * Splits a course's modules into the course's own and the 3D Airmanship ones,
 * which the student sidebar gathers under one accordion at the end (user,
 * 2026-11-27).
 *
 * A module is 3D Airmanship when every lesson in it is (`levelGated`, set only
 * for lessons filed under that discipline). `!== false`, matching
 * `#/lib/level-visibility`: a lesson from a payload without the field counts
 * as 3D Airmanship there, so it does here too. Decided from the lessons the
 * learner receives rather than from who owns the module, which the payload
 * keeps from learners on purpose (`toLearnerCourseDetails`).
 *
 * In the 3D Airmanship course itself every module is one of its own, so
 * nothing is grouped.
 */
export function splitFlagshipModules<M extends SplittableModule>(
  modules: readonly M[],
  courseSlug: string,
): { own: M[]; flagship: M[] } {
  if (courseSlug === FLAGSHIP_COURSE_SLUG) {
    return { own: [...modules], flagship: [] };
  }
  const own: M[] = [];
  const flagship: M[] = [];
  for (const mod of modules) {
    const isFlagship =
      mod.lessons.length > 0 &&
      mod.lessons.every((lesson) => lesson.levelGated !== false);
    (isFlagship ? flagship : own).push(mod);
  }
  return { own, flagship };
}

/**
 * The group's ring: the rounded mean of its lessons' percents, the same rule
 * a module's ring follows (`computeSidebarPercents`), over all its lessons.
 */
export function flagshipGroupPercent(
  modules: readonly { lessons: readonly { slug: string }[] }[],
  lessonPercents: Record<string, number>,
): number {
  const lessons = modules.flatMap((mod) => mod.lessons);
  if (lessons.length === 0) return 0;
  const total = lessons.reduce(
    (sum, lesson) => sum + (lessonPercents[lesson.slug] ?? 0),
    0,
  );
  return Math.round(total / lessons.length);
}
