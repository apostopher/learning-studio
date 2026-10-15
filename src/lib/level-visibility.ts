import { isUserLevel, type UserLevel } from '#/types';

export type LevelFilterableLesson = { levels: readonly string[] };
export type LevelFilterableModule<L> = { lessons: readonly L[] };

/**
 * Strict, exact match: a pilot sees a lesson only when its `levels` name the
 * pilot's level.
 *
 * - Not a ceiling: an `advanced` pilot does not see a `['basic']` lesson. That
 *   is the whole point of the model — see the spec's §3.
 * - An untagged lesson (`[]`) is visible to NO ONE. It used to mean "every
 *   tier", so an untagged catalogue stayed fully visible while authors tagged
 *   it lesson by lesson. That rollout rationale was retired: a lesson now has
 *   to be put at a level, on the Update levels board, before any pilot sees
 *   it — tagging is how content is released, not a later refinement.
 * - A `['none']` lesson is visible to no one by the same exact match: no pilot
 *   is ever at level `'none'`.
 * - A pilot with no level in the course (`level === null`) sees NOTHING. A
 *   level is something their training team sets; until it is set there is no
 *   tier whose lessons are theirs.
 *
 * `null` here means "this learner has no level" — never "an author". Authors
 * bypass level filtering at the call site, before this is ever asked.
 */
export function isLessonVisibleAtLevel(
  levels: readonly string[],
  level: UserLevel | null,
): boolean {
  return level !== null && levels.includes(level);
}

/**
 * A lesson tagged `'none'` has been withdrawn from every level — not moved to
 * another tier. Out-of-tier work a pilot already finished stays readable as an
 * archive; withdrawn work does not, even for someone who completed it.
 */
export function isLessonWithdrawn(levels: readonly string[]): boolean {
  return levels.includes('none');
}

/**
 * May a pilot who completed this lesson, and can no longer see it, still
 * re-read it as an archive of work done at an earlier level?
 *
 * Only when it is placed at a real level — i.e. it was moved to another tier.
 * A withdrawn (`['none']`) lesson is closed even to someone who completed it,
 * and so is an untagged (`[]`) one: it is at nobody's level, so there is no
 * "earlier level" it could be the archive of.
 */
export function isLessonArchivable(levels: readonly string[]): boolean {
  return levels.some(isUserLevel);
}

/**
 * Narrow a course payload to what one pilot may see — nothing at all for a
 * pilot with no level (`null`). Never call this for an author: they bypass
 * the level filter at the call site.
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
>(course: C, level: UserLevel | null): C {
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
