import { useQueryClient } from '@tanstack/react-query';
import { useAtomValue } from 'jotai';
import { useEffect, useRef } from 'react';
import { dataKeys } from '#/data-hooks/keys';
import { useReportVideoProgress } from '#/data-hooks/use-report-video-progress';
import {
  useVideoProgress,
  videoProgressSchema,
} from '#/data-hooks/use-video-progress';
import { queryKeys } from '#/hooks/data/keys';
import { videoPlayerStateAtomFamily } from './atoms';
import {
  computeMilestoneTick,
  initialMilestoneReporterState,
} from './milestone-tick';
import { reconcileCoverage } from './reconcile-coverage';

async function fetchProgress(lessonSlug: string) {
  const res = await fetch(
    `/api/user/video-progress?lessonSlug=${encodeURIComponent(lessonSlug)}`,
  );
  if (!res.ok) throw new Error(`Failed to load video progress (${res.status})`);
  // Same endpoint and shape useVideoProgress reads — reuse its schema rather
  // than casting, so a server-side shape drift fails loudly instead of
  // silently feeding reconcileCoverage malformed data.
  return videoProgressSchema.parse(await res.json());
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
 *
 * The reset/seed/tick decision itself lives in the pure `computeMilestoneTick`
 * (`./milestone-tick.ts`), called fresh from THIS single effect on every
 * commit that can change any of its inputs (all four are in the dependency
 * array below, including `milestonesHit`). That is deliberate: an earlier
 * version split reset and seed across two separate effects with different
 * dependency arrays, and a same-commit lessonSlug change + already-cached
 * progress data raced them — see `computeMilestoneTick`'s doc comment for
 * the full failure mode. Not render-tested here: this repo's Vite pipeline
 * (react-compiler + TanStack Start under Vitest) nulls the hook dispatcher
 * for any of our own hooks that call `useRef`/`useEffect` directly inside a
 * render test (pre-existing, see `src/components/video-player/hooks.ts`'s
 * top-of-file note and `rich-text-editor.test.tsx`'s skipped render test for
 * the same root cause) — the decision logic is covered instead via
 * `milestone-tick.test.ts`, which needs no render.
 */
export function useMilestoneReporter(
  playerId: string,
  lessonSlug: string,
  readOnly: boolean,
): void {
  const { currentTime, duration } = useAtomValue(
    videoPlayerStateAtomFamily(playerId),
  );
  const report = useReportVideoProgress();
  const queryClient = useQueryClient();
  const progress = useVideoProgress(lessonSlug);
  const milestonesHit = progress.data?.milestonesHit;

  const reportRef = useRef(report);
  reportRef.current = report;

  const stateRef = useRef(initialMilestoneReporterState);

  useEffect(() => {
    // An archive-view lesson (completed at an earlier level): the video still
    // plays, but nothing about watching it is reported or reconciled.
    if (readOnly) return;
    const { state, crossed, shouldReconcile } = computeMilestoneTick(
      stateRef.current,
      { lessonSlug, currentTime, duration, milestonesHit },
    );
    stateRef.current = state;

    for (const milestone of crossed) {
      reportRef.current.mutate({ lessonSlug, progress: milestone });
    }

    if (!shouldReconcile) return;

    void reconcileCoverage({
      lessonSlug,
      reported: state.reported,
      report: (input) => reportRef.current.mutate(input),
      fetchProgress,
    }).then(() => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.lessonMaterial(lessonSlug),
      });
      queryClient.invalidateQueries({
        queryKey: dataKeys.lessonProgress(lessonSlug),
      });
    });
  }, [currentTime, duration, lessonSlug, milestonesHit, queryClient, readOnly]);
}
