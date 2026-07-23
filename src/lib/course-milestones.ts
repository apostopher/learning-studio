/**
 * Progress milestones (percent watched) at which the player reports video
 * progress, and which the aggregation counts toward "fully watched". Mirrored
 * in src/db/videos-progress.ts for server use. Lives in src/lib so client
 * bundles don't pull in the drizzle/db module.
 */
export const milestones: number[] = [
  10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100,
];

/**
 * Milestones at or below `percent` (0–100) that are not already in `reported`.
 * Pure — used by the player to decide which new milestones to report as
 * playback advances.
 */
export function unreportedMilestones(
  percent: number,
  reported: ReadonlySet<number>,
): number[] {
  if (!Number.isFinite(percent) || percent <= 0) return [];
  return milestones.filter((m) => m <= percent && !reported.has(m));
}
