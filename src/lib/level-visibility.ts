import { isUserLevel, type UserLevel } from '#/types';

/**
 * `levelGated` is whether levels apply to this lesson at all: true only for
 * a lesson filed under the flagship's discipline (see
 * `isLevelGatedDisciplineSlug`). Levels are a 3D Airmanship cert, so every
 * other lesson ignores its tags and the pilot's level alike.
 */
export type LevelFilterableLesson = {
  levels: readonly string[];
  levelGated: boolean;
};
export type LevelFilterableModule<L> = { lessons: readonly L[] };

/**
 * May a pilot at this level see the lesson?
 *
 * A lesson outside the flagship's discipline (`levelGated: false`) is visible
 * to EVERY pilot — any level, or none — whatever tags it carries. Levels are
 * the 3D Airmanship cert, and gate only 3D Airmanship lessons.
 *
 * A gated lesson is a strict, exact match: a pilot sees it only when its
 * `levels` name the pilot's level.
 *
 * - Not a ceiling: an `advanced` pilot does not see a `['basic']` lesson. That
 *   is the whole point of the model — see the spec's §3.
 * - An untagged gated lesson (`[]`) is visible to NO ONE: it has to be put at
 *   a level, on the Update levels board, before any pilot sees it — tagging
 *   is how content is released, not a later refinement.
 * - A `['none']` lesson is visible to no one by the same exact match: no pilot
 *   is ever at level `'none'`.
 * - A pilot with no level in the course (`level === null`) sees no gated
 *   lesson. A level is something their training team sets; until it is set
 *   there is no tier whose lessons are theirs.
 *
 * `null` here means "this learner has no level" — never "an author". Authors
 * bypass level filtering at the call site, before this is ever asked.
 */
export function isLessonVisibleAtLevel(
  lesson: LevelFilterableLesson,
  level: UserLevel | null,
): boolean {
  if (!lesson.levelGated) return true;
  return isLessonAtTier(lesson, level);
}

/**
 * Is this a gated lesson placed at exactly this tier? What a tier is MADE of,
 * for promotion and tier completion: an ungated lesson is visible at every
 * level, but it belongs to no tier, so it neither blocks a cert nor earns one.
 */
export function isLessonAtTier(
  lesson: LevelFilterableLesson,
  level: UserLevel | null,
): boolean {
  return lesson.levelGated && level !== null && lesson.levels.includes(level);
}

/**
 * May a pilot who completed this lesson, and can no longer see it, still
 * re-read it as an archive of work done at an earlier level?
 *
 * Only when it is a gated lesson placed at a real level — i.e. it was moved
 * to another tier. A withdrawn (`['none']`) lesson is closed even to someone
 * who completed it, and so is an untagged (`[]`) one: it is at nobody's
 * level, so there is no "earlier level" it could be the archive of. An
 * ungated lesson is never out of sight, so never archived.
 */
export function isLessonArchivable(lesson: LevelFilterableLesson): boolean {
  return lesson.levelGated && lesson.levels.some(isUserLevel);
}

/**
 * Narrow a course payload to what one pilot may see — only the ungated
 * lessons for a pilot with no level (`null`). Never call this for an author: they bypass
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
        isLessonVisibleAtLevel(lesson, level),
      ),
    }))
    .filter((mod) => mod.lessons.length > 0);
  return { ...course, modules };
}

/**
 * Does this course have any available lesson at all, at any level?
 *
 * The one question that tells the two strict-level empty states apart from
 * "nothing published": a pilot whose filtered tree is empty while this is
 * true has no lessons AT THEIR LEVEL; when it is false, nobody has any.
 * Shared by the resume path and the sidebar so the two cannot disagree.
 */
export function courseHasAvailableLessons(course: {
  modules: readonly {
    lessons: readonly { isAvailable: boolean }[];
  }[];
}): boolean {
  return course.modules.some((mod) =>
    mod.lessons.some((lesson) => lesson.isAvailable),
  );
}
