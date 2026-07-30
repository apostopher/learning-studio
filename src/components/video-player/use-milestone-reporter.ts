import { useQueryClient } from '@tanstack/react-query';
import { useAtomValue } from 'jotai';
import { useEffect, useRef } from 'react';
import { dataKeys } from '#/data-hooks/keys';
import { useReportVideoProgress } from '#/data-hooks/use-report-video-progress';
import { useVideoProgress } from '#/data-hooks/use-video-progress';
import { queryKeys } from '#/hooks/data/keys';
import {
  crossedMilestones,
  isVideoWatched,
  SEEK_THRESHOLD_SECONDS,
} from '#/lib/course-milestones';
import { videoPlayerStateAtomFamily } from './atoms';
import { reconcileCoverage } from './reconcile-coverage';

async function fetchProgress(videoId: string) {
  const res = await fetch(
    `/api/user/video-progress?videoId=${encodeURIComponent(videoId)}`,
  );
  if (!res.ok) throw new Error(`Failed to load video progress (${res.status})`);
  return (await res.json()) as { milestonesHit: number[]; watched: boolean };
}

/**
 * Reports video-progress milestones as playback advances, and unlocks the
 * lesson material the moment coverage completes.
 *
 * Three properties, each load-bearing:
 *
 * 1. ANTI-SKIP — only milestones the playhead *crosses* during a
 *    playback-sized advance are reported. A jump in either direction is a
 *    seek: the cursor moves, nothing is reported.
 * 2. SEEDED — the reported set starts from the server's existing milestones,
 *    so coverage earned in earlier sessions counts and is never re-reported.
 *    Nothing is reported until that seed lands, or the first ticks would
 *    duplicate everything already earned.
 * 3. NO POLLING — because the client is the only writer, the seeded set
 *    mirrors the server exactly, so completion is detected locally on the tick
 *    that finishes it, out-of-order watching included.
 */
export function useMilestoneReporter(
  playerId: string,
  videoId: string,
  lessonSlug: string,
): void {
  const { currentTime, duration } = useAtomValue(
    videoPlayerStateAtomFamily(playerId),
  );
  const report = useReportVideoProgress();
  const queryClient = useQueryClient();
  const progress = useVideoProgress(videoId);

  const reportRef = useRef(report);
  reportRef.current = report;
  const lessonSlugRef = useRef(lessonSlug);
  lessonSlugRef.current = lessonSlug;

  const reportedRef = useRef<Set<number>>(new Set());
  const seededForRef = useRef<string | null>(null);
  const lastTimeRef = useRef(0);
  const reconciledRef = useRef(false);
  const videoIdRef = useRef(videoId);

  const milestonesHit = progress.data?.milestonesHit;

  useEffect(() => {
    if (!videoId || !milestonesHit) return;
    if (seededForRef.current === videoId) return;
    reportedRef.current = new Set(milestonesHit);
    seededForRef.current = videoId;
  }, [videoId, milestonesHit]);

  useEffect(() => {
    if (videoIdRef.current !== videoId) {
      videoIdRef.current = videoId;
      reportedRef.current = new Set();
      seededForRef.current = null;
      lastTimeRef.current = 0;
      reconciledRef.current = false;
    }
    if (!videoId || !Number.isFinite(duration) || duration <= 0) return;
    if (seededForRef.current !== videoId) return;

    const prevTime = lastTimeRef.current;
    const advance = currentTime - prevTime;
    lastTimeRef.current = currentTime;
    if (advance < 0 || advance > SEEK_THRESHOLD_SECONDS) return;

    const crossed = crossedMilestones(
      (prevTime / duration) * 100,
      (currentTime / duration) * 100,
      reportedRef.current,
    );
    for (const milestone of crossed) {
      reportedRef.current.add(milestone);
      reportRef.current.mutate({ videoId, progress: milestone });
    }

    if (reconciledRef.current) return;
    if (!isVideoWatched(reportedRef.current)) return;
    reconciledRef.current = true;

    void reconcileCoverage({
      videoId,
      reported: reportedRef.current,
      report: (input) => reportRef.current.mutate(input),
      fetchProgress,
    }).then(() => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.lessonMaterial(lessonSlugRef.current),
      });
      queryClient.invalidateQueries({
        queryKey: dataKeys.videoProgress(videoId),
      });
    });
  }, [currentTime, duration, videoId, queryClient]);
}
