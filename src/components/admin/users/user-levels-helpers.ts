import type { LevelHistoryRow } from '#/data-hooks/use-user-levels';
import type { UserLevel } from '#/types';

/**
 * Swap each history row's `changedBy` (an auth user id) for the matching
 * email, so an admin reading the history sees who acted rather than a raw
 * UUID. Falls back to the id itself when the actor isn't in `emailByUserId`
 * — e.g. a removed account — rather than dropping it.
 */
export function resolveChangedByEmail(
  history: readonly LevelHistoryRow[],
  emailByUserId: ReadonlyMap<string, string>,
): LevelHistoryRow[] {
  return history.map((row) => ({
    ...row,
    changedBy: row.changedBy
      ? (emailByUserId.get(row.changedBy) ?? row.changedBy)
      : row.changedBy,
  }));
}

/**
 * A pilot's level in one course, or null when they have no level row there.
 *
 * Never defaults to 'basic': under strict levels a pilot with no level sees
 * nothing, so showing them as Basic here would contradict both the roster
 * ("No level") and what the pilot actually sees.
 */
export function courseLevelOf(
  levels: Readonly<Record<number, UserLevel>>,
  courseId: number,
): UserLevel | null {
  return levels[courseId] ?? null;
}
