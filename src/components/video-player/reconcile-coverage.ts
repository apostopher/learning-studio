export type ProgressSnapshot = { milestonesHit: number[]; watched: boolean };

/**
 * Called once, the moment the client believes it has covered every milestone.
 *
 * Milestone reports go out via `sendBeacon`, which discards the response, so
 * the client cannot tell a delivered report from a dropped one. Without this
 * step a single dropped beacon leaves the student behind a lock they
 * legitimately cleared, with no way to retry short of rewatching the video.
 *
 * Best-effort by design: a failed lookup resolves to "nothing re-sent" rather
 * than throwing, because the caller invalidates the material query either way
 * and a locked response is cached with staleTime 0.
 */
export async function reconcileCoverage({
  videoId,
  reported,
  report,
  fetchProgress,
}: {
  videoId: string;
  reported: ReadonlySet<number>;
  report: (input: { videoId: string; progress: number }) => void;
  fetchProgress: (videoId: string) => Promise<ProgressSnapshot>;
}): Promise<number[]> {
  let snapshot: ProgressSnapshot;
  try {
    snapshot = await fetchProgress(videoId);
  } catch {
    return [];
  }
  if (snapshot.watched) return [];

  const onServer = new Set(snapshot.milestonesHit);
  const missing = [...reported]
    .filter((m) => !onServer.has(m))
    .sort((a, b) => a - b);
  for (const progress of missing) report({ videoId, progress });
  return missing;
}
