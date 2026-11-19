import { LEVEL_LABELS } from '#/lib/level-labels';
import {
  SETTABLE_USER_LEVELS,
  type SettableUserLevel,
  type UserLevel,
} from '#/types';

/**
 * How long the roster's level chip waits after a press before it saves.
 *
 * Long enough that clicking past a level (INTER → EXPERT → BASIC) saves only
 * where the admin stops; short enough that stopping feels like saving.
 */
export const ROSTER_LEVEL_SAVE_DELAY_MS = 700;

/** The chip's press order: None first, then each tier, then round again. */
const CYCLE: readonly SettableUserLevel[] = [
  'none',
  ...SETTABLE_USER_LEVELS.filter((l) => l !== 'none'),
];

/**
 * The level a press on the roster's chip moves to.
 *
 * None → Basic → Intermediate → Advanced → None. Back to None is a real
 * change: it is saved as a `'none'` row (levels are append-only), which every
 * reader takes as no 3D cert.
 */
export function nextRosterLevel(level: SettableUserLevel): SettableUserLevel {
  return CYCLE[(CYCLE.indexOf(level) + 1) % CYCLE.length];
}

/** A roster row's level as the cycle knows it: no level is `'none'`. */
export function toRosterLevel(level: UserLevel | null): SettableUserLevel {
  return level ?? 'none';
}

/** The cycle's value as the chip draws it: `'none'` is no level. */
export function fromRosterLevel(level: SettableUserLevel): UserLevel | null {
  return level === 'none' ? null : level;
}

/**
 * The pilot-facing message a roster level change is saved with. The endpoint
 * requires one, and a chip press has nowhere to type it, so it states the
 * fact plainly.
 */
export function rosterLevelMessage(
  courseName: string,
  level: SettableUserLevel,
): string {
  // Never announced (`getUnacknowledgedLevelChange` skips a cleared cert),
  // but the endpoint requires a message and the history shows it.
  if (level === 'none') {
    return `Your training team cleared your 3D cert in ${courseName}.`;
  }
  return `Your training team set your level in ${courseName} to ${LEVEL_LABELS[level]}.`;
}
