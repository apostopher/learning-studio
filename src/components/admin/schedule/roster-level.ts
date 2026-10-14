import { LEVEL_LABELS } from '#/lib/level-labels';
import { USER_LEVELS, type UserLevel } from '#/types';

/**
 * How long the roster's level chip waits after a press before it saves.
 *
 * Long enough that clicking past a level (INTER → EXPERT → BASIC) saves only
 * where the admin stops; short enough that stopping feels like saving.
 */
export const ROSTER_LEVEL_SAVE_DELAY_MS = 700;

/**
 * The level a press on the roster's chip moves to.
 *
 * No level → Basic → Intermediate → Advanced → Basic. Never back to "no
 * level": levels are append-only, so there is nothing to cycle back to.
 */
export function nextRosterLevel(level: UserLevel | null): UserLevel {
  if (level === null) return USER_LEVELS[0];
  return USER_LEVELS[(USER_LEVELS.indexOf(level) + 1) % USER_LEVELS.length];
}

/**
 * The pilot-facing message a roster level change is saved with. The endpoint
 * requires one, and a chip press has nowhere to type it, so it states the
 * fact plainly.
 */
export function rosterLevelMessage(
  courseName: string,
  level: UserLevel,
): string {
  return `Your training team set your level in ${courseName} to ${LEVEL_LABELS[level]}.`;
}
