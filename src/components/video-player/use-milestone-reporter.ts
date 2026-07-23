import { useAtomValue } from 'jotai';
import { useEffect, useRef } from 'react';
import { useReportVideoProgress } from '#/data-hooks/use-report-video-progress';
import { unreportedMilestones } from '#/lib/course-milestones';
import { videoPlayerStateAtomFamily } from './atoms';

/**
 * Reports video-progress milestones for a player as playback advances. Each
 * milestone is reported at most once per video view (the reported set resets
 * when `videoId` changes — e.g. a new lesson or a page revisit), and the report
 * is fire-and-forget via `useReportVideoProgress` (sendBeacon). No-op until the
 * video has a known duration and a non-empty `videoId`.
 */
export function useMilestoneReporter(playerId: string, videoId: string): void {
  const { currentTime, duration } = useAtomValue(
    videoPlayerStateAtomFamily(playerId),
  );
  const report = useReportVideoProgress();
  const reportRef = useRef(report);
  reportRef.current = report;
  const reportedRef = useRef<Set<number>>(new Set());
  const videoIdRef = useRef(videoId);

  useEffect(() => {
    // Reset the reported set when the video changes.
    if (videoIdRef.current !== videoId) {
      videoIdRef.current = videoId;
      reportedRef.current = new Set();
    }
    if (!videoId || !Number.isFinite(duration) || duration <= 0) return;

    const percent = (currentTime / duration) * 100;
    for (const milestone of unreportedMilestones(
      percent,
      reportedRef.current,
    )) {
      reportedRef.current.add(milestone);
      reportRef.current.mutate({ videoId, progress: milestone });
    }
  }, [currentTime, duration, videoId]);
}
