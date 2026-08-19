import type { LevelHistoryRow } from '#/data-hooks/use-user-levels';

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
