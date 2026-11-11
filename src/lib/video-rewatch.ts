import { milestones } from '#/lib/course-milestones';
import { DEBRIEF_PAR_SCORE } from '#/lib/debrief-schedule';

export type OwedRewatch = {
  /** ISO. The below-par attempt the rewatch is for. */
  since: string;
  /** Distinct milestones reached since then, in order. */
  milestonesHit: number[];
};

/**
 * The rewatch a pilot owes a video lesson: after a below-par debrief, the
 * redo opens once the video is watched again (`computeDebriefState`), so the
 * player reports from the milestones reached since that attempt. Null when
 * nothing is owed — no below-par attempt, or the debrief is passed.
 *
 * The client mirror of `videoRewatchedAtSql`; both count from the latest
 * below-par attempt.
 */
export function owedRewatch(
  rows: readonly { progress: number; createdAt: Date }[],
  attempts: readonly { totalScore: number; completedAt: string }[],
): OwedRewatch | null {
  if (attempts.some((a) => a.totalScore >= DEBRIEF_PAR_SCORE)) return null;
  const failedMs = attempts
    .filter((a) => a.totalScore < DEBRIEF_PAR_SCORE)
    .map((a) => Date.parse(a.completedAt));
  if (failedMs.length === 0) return null;
  const sinceMs = Math.max(...failedMs);

  const reached = new Set(
    rows.filter((r) => r.createdAt.getTime() > sinceMs).map((r) => r.progress),
  );
  return {
    since: new Date(sinceMs).toISOString(),
    milestonesHit: milestones.filter((m) => reached.has(m)),
  };
}
