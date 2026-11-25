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
  /**
   * From `getCourseProgress`. A lesson counts once it is `done` (sticky) and,
   * if it bears a debrief, that debrief is passed.
   */
  progress: readonly {
    lessonId: number;
    done: boolean;
    debrief: { bearing: boolean; passed: boolean };
  }[];
  level: UserLevel;
};

/** The rung above this one, or null at the top. */
export function nextLevel(level: UserLevel): UserLevel | null {
  return USER_LEVELS[levelIndex(level) + 1] ?? null;
}

/**
 * Has the pilot finished every lesson they can reach at their current tier?
 *
 * "Finished" means the lesson is `done` (sticky 100% of video, tabs and quiz,
 * recorded in `lesson_completions`) AND, for a debrief-bearing lesson, the
 * debrief is passed. Deliberately NOT `watched`, which is weaker and is what
 * the prerequisite gate uses, and NOT live `percent`, which can fall.
 *
 * Strict: only lessons tagged with exactly this tier count
 * (`isLessonAtTier`), so an untagged `[]`, a withdrawn `['none']` and a lesson
 * outside 3D Airmanship neither block the tier nor complete it.
 *
 * An empty tier returns false. Otherwise "every lesson at this tier is done"
 * would be vacuously true for a tier with no lessons, and promote the pilot
 * on every single progress write, forever.
 */
export function isTierComplete(input: TierCompletionInput): boolean {
  const byLesson = new Map(input.progress.map((p) => [p.lessonId, p]));

  const reachable = input.lessons.filter(
    (lesson) => lesson.isAvailable && isLessonAtTier(lesson, input.level),
  );

  if (reachable.length === 0) return false;

  return reachable.every((lesson) => {
    const row = byLesson.get(lesson.lessonId);
    if (!row?.done) return false;
    return !row.debrief.bearing || row.debrief.passed;
  });
}
