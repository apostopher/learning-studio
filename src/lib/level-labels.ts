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

/** Rung index, for ordering and for finding the next tier up. */
export function levelIndex(level: UserLevel): number {
  return USER_LEVELS.indexOf(level);
}
