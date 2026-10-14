import type { LessonLevel } from '#/types';

/**
 * A lesson's levels after one press on the Update levels board in `mode`.
 *
 * `'none'` is exclusive (see `LessonLevelsSchema`), so it never merges:
 * - mode `'none'` replaces everything with `['none']`, or clears a lesson
 *   that already is `['none']` back to `[]` (every level);
 * - a real level on a `['none']` lesson replaces it with just that level;
 * - otherwise a real level toggles — added if absent, removed if present —
 *   leaving the lesson's other levels alone.
 */
export function nextLessonLevels(
  levels: readonly LessonLevel[],
  mode: LessonLevel,
): LessonLevel[] {
  if (mode === 'none') return levels.includes('none') ? [] : ['none'];
  const real = levels.filter((l) => l !== 'none');
  return real.includes(mode) ? real.filter((l) => l !== mode) : [...real, mode];
}
