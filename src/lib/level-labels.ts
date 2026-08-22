import { USER_LEVELS, type UserLevel } from '#/types';

/**
 * Pilot-facing names, kept apart from the stored values.
 *
 * The stored strings are an internal contract; these are shown to adult
 * professional pilots. Renaming must be a one-line change here, never a
 * migration.
 */
export const LEVEL_LABELS: Record<UserLevel, string> = {
  basic: 'Basic',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

export function levelLabel(level: UserLevel): string {
  return LEVEL_LABELS[level];
}

/**
 * Short forms for dense surfaces — the board's lesson chips, where a full
 * "Intermediate" would crowd out the lesson name.
 *
 * Deliberately whole words rather than truncations: `BASIC` is a complete word,
 * so pairing it with `INT` and `ADV` reads as a mix of two conventions. `INTER`
 * is a prefix people resolve instantly, where `INT` could be integer or
 * internal; `EXPERT` stands beside `BASIC` as an equal rather than a clipped
 * "advanced". The one extra character is invisible once a chip has a
 * `min-inline-size`.
 *
 * Separate from LEVEL_LABELS on purpose: these are not abbreviations *of* those
 * labels and must not be derived from them.
 */
export const LEVEL_ACRONYMS: Record<UserLevel, string> = {
  basic: 'BASIC',
  intermediate: 'INTER',
  advanced: 'EXPERT',
};

export function levelAcronym(level: UserLevel): string {
  return LEVEL_ACRONYMS[level];
}

/** Rung index, for ordering and for finding the next tier up. */
export function levelIndex(level: UserLevel): number {
  return USER_LEVELS.indexOf(level);
}
