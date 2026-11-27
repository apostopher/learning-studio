import { LEVEL_LABELS } from '#/lib/level-labels';
import {
  STORED_USER_LEVELS,
  type StoredUserLevel,
  type UserLevel,
} from '#/types';

/**
 * A level as the roster chip holds it: a tier, or `'none'` — no level, shown
 * as "–". Not null, because the chip's save queue uses null for "nothing in
 * flight". The same value `user_levels` stores for a level taken away.
 */
export type RosterLevel = StoredUserLevel;

/** A roster row's level as the chip holds it. */
export const toRosterLevel = (level: UserLevel | null): RosterLevel =>
  level ?? 'none';

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
 * Basic → Intermediate → Advanced → no level (–) → Basic (user, 2026-11-27:
 * a level can be taken away). The table stays append-only: no level is a
 * newer `'none'` row, not a delete.
 */
const CYCLE = [
  ...STORED_USER_LEVELS.filter((l) => l !== 'none'),
  'none',
] as const;

export function nextRosterLevel(level: RosterLevel): RosterLevel {
  return CYCLE[(CYCLE.indexOf(level) + 1) % CYCLE.length];
}

/**
 * The pilot-facing message a roster level change is saved with. The endpoint
 * requires one, and a chip press has nowhere to type it, so it states the
 * fact plainly.
 */
export function rosterLevelMessage(
  courseName: string,
  level: RosterLevel,
): string {
  return level === 'none'
    ? `Your training team removed your level in ${courseName}.`
    : `Your training team set your level in ${courseName} to ${LEVEL_LABELS[level]}.`;
}

/** How a saved roster level reads in the toast. */
export function rosterLevelSavedToast(
  name: string,
  level: RosterLevel,
  courseName: string,
): string {
  return level === 'none'
    ? `${name} has no level in ${courseName}`
    : `${name} is now ${LEVEL_LABELS[level]} in ${courseName}`;
}
