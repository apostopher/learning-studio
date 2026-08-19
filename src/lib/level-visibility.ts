import type { UserLevel } from '#/types';

export type LevelFilterableLesson = { levels: readonly string[] };
export type LevelFilterableModule<L> = { lessons: readonly L[] };

/**
 * Exact match, with empty meaning "every tier".
 *
 * Not a ceiling: an `advanced` pilot does not see a `['basic']` lesson. That is
 * the whole point of the model — see the spec's §3.
 */
export function isLessonVisibleAtLevel(
  levels: readonly string[],
  level: UserLevel,
): boolean {
  return levels.length === 0 || levels.includes(level);
}

/**
 * Narrow a course payload to what one pilot may see.
 *
 * Modules left with no visible lessons are dropped, not rendered empty — an
 * empty module is just a place for the question "why is this empty?" to form.
 *
 * Returns a new object. Callers pass this to the prerequisite engine so that
 * hidden lessons cannot gate visible ones ("filter first, then gate").
 *
 * NOTE: this must never be the only level check. Removing a lesson from the
 * payload makes `evaluateLessonLock` fail to `locate()` it, and that function
 * answers `{kind:'open'}` for unknown lessons — permissive. The fail-closed
 * check lives in `evaluateLessonGate`.
 */
export function filterCourseToLevel<
  L extends LevelFilterableLesson,
  M extends LevelFilterableModule<L>,
  C extends { modules: readonly M[] },
>(course: C, level: UserLevel): C {
  const modules = course.modules
    .map((mod) => ({
      ...mod,
      lessons: mod.lessons.filter((lesson) =>
        isLessonVisibleAtLevel(lesson.levels, level),
      ),
    }))
    .filter((mod) => mod.lessons.length > 0);
  return { ...course, modules };
}
