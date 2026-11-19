import { levelIndex } from '#/lib/level-labels';
import { isLessonAtTier } from '#/lib/level-visibility';
import { USER_LEVELS, type UserLevel } from '#/types';

export type TierCompletionInput = {
  lessons: readonly {
    lessonId: number;
    levels: readonly string[];
    levelGated: boolean;
    isAvailable: boolean;
  }[];
  /** From `getCourseProgress`. `percent === 100` is the definition of done. */
  progress: readonly { lessonId: number; percent: number }[];
  level: UserLevel;
};

/** The rung above this one, or null at the top. */
export function nextLevel(level: UserLevel): UserLevel | null {
  return USER_LEVELS[levelIndex(level) + 1] ?? null;
}

/**
 * Has the pilot finished every lesson they can reach at their current tier?
 *
 * "Finished" reuses the app's existing definition — `lessonPercent === 100`
 * from `aggregateCourseProgress` — rather than inventing a second, stricter
 * notion. Note this is deliberately NOT `watched`, which is weaker and is what
 * the prerequisite gate uses.
 *
 * Strict: only gated lessons tagged with exactly this tier count
 * (`isLessonAtTier`), so an untagged `[]` or withdrawn `['none']` lesson
 * neither blocks the tier nor completes it — and nor does a lesson outside
 * 3D Airmanship, which every pilot sees but which is no tier's work.
 *
 * An empty tier returns false. Otherwise "every lesson at this tier is done"
 * would be vacuously true for a tier with no lessons, and promote the pilot
 * on every single progress write, forever.
 */
export function isTierComplete(input: TierCompletionInput): boolean {
  const percentByLesson = new Map(
    input.progress.map((p) => [p.lessonId, p.percent]),
  );

  const reachable = input.lessons.filter(
    (lesson) => lesson.isAvailable && isLessonAtTier(lesson, input.level),
  );

  if (reachable.length === 0) return false;

  return reachable.every(
    (lesson) => (percentByLesson.get(lesson.lessonId) ?? 0) === 100,
  );
}
