import {
  type LessonLevel,
  type SettableUserLevel,
  USER_LEVELS,
  type UserLevel,
} from '#/types';

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

/**
 * Admin-facing names for what a LESSON's levels can hold — the tiers, plus
 * `'none'` (hidden from every tier). Kept apart from `LEVEL_LABELS` so that
 * pilot-facing copy, which only ever names a real tier, stays typed to
 * `UserLevel` and cannot be handed `'none'`.
 */
export const LESSON_LEVEL_LABELS: Record<LessonLevel, string> = {
  ...LEVEL_LABELS,
  none: 'None',
};

/**
 * Admin-facing names for what a pilot's level can be SET to — the tiers, plus
 * `'none'` (no 3D cert). Kept apart from `LEVEL_LABELS` for the same reason
 * as `LESSON_LEVEL_LABELS`: pilot-facing copy never names `'none'`.
 */
export const SETTABLE_LEVEL_LABELS: Record<SettableUserLevel, string> = {
  ...LEVEL_LABELS,
  none: 'None',
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
 * internal. `ADV` (it was `EXPERT`) and `NONE` are what the training team
 * asked for, so the four chips read BASIC, INTER, ADV, NONE. Lengths differ;
 * a chip's `min-inline-size` evens them out.
 *
 * Separate from LEVEL_LABELS on purpose: these are not abbreviations *of* those
 * labels and must not be derived from them.
 */
export const LEVEL_ACRONYMS: Record<UserLevel, string> = {
  basic: 'BASIC',
  intermediate: 'INTER',
  advanced: 'ADV',
};

/** The chip for a pilot with no 3D cert — no level row, or a `'none'` one. */
export const NO_LEVEL_ACRONYM = 'NONE';

export function levelAcronym(level: UserLevel): string {
  return LEVEL_ACRONYMS[level];
}

/** Rung index, for ordering and for finding the next tier up. */
export function levelIndex(level: UserLevel): number {
  return USER_LEVELS.indexOf(level);
}
