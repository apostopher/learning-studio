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
 * Milestones required to count a video as "watched": every milestone EXCEPT the
 * final 100 — most users stop a few seconds before the end, so requiring 100
 * would leave nearly every video incomplete.
 */
export const watchedMilestones: number[] = milestones.filter((m) => m !== 100);

/**
 * True when `reached` covers every watched-milestone. Still anti-skip (each 5%
 * step up to 95 must be hit), just tolerant of stopping right before the end.
 */
export function isVideoWatched(reached: ReadonlySet<number>): boolean {
  return watchedMilestones.every((m) => reached.has(m));
}

/**
 * Largest single playback advance, in seconds, still treated as watching.
 * `timeupdate` fires roughly four times a second, so anything beyond this is a
 * seek — even at 2× playback a normal tick stays well under it.
 */
export const SEEK_THRESHOLD_SECONDS = 2;

/**
 * Milestones the playhead crossed moving from `prevPercent` to
 * `currentPercent`, excluding any already in `reported`.
 *
 * Unlike a naive "every milestone at or below the current position" check,
 * this only counts what playback actually crossed: from a fresh set, a jump
 * straight to the end (pressing End or dragging the scrubber) reports
 * nothing, instead of recording a complete watch. That is the anti-skip
 * guarantee.
 *
 * Order is irrelevant: coverage is what unlocks, so watching the end first and
 * the start later accumulates correctly across sessions.
 */
export function crossedMilestones(
  prevPercent: number,
  currentPercent: number,
  reported: ReadonlySet<number>,
): number[] {
  if (!Number.isFinite(prevPercent) || !Number.isFinite(currentPercent)) {
    return [];
  }
  return milestones.filter(
    (m) => m > prevPercent && m <= currentPercent && !reported.has(m),
  );
}
