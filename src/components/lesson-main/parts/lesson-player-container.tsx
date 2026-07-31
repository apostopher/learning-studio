import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { AnimatePresence } from 'motion/react';
import { useCallback, useId } from 'react';
import { activeTabAtom, lessonMaterialRef } from '#/atoms/lesson-ai-test';
import { VideoPlayerContainer } from '#/components/video-player';
import { videoPlayerStateAtomFamily } from '#/components/video-player/atoms';
import { CoverageNotice } from '#/components/video-player/parts/coverage-notice';
import { DebriefOverlay } from '#/components/video-player/parts/debrief-overlay';
import { useMilestoneReporter } from '#/components/video-player/use-milestone-reporter';
import { useVideoProgress } from '#/data-hooks/use-video-progress';
import {
  useCurrentTest,
  useGenerateTest,
  useIsGenerating,
} from '#/hooks/data/use-lesson-ai-test';
import { useLessonMaterial } from '#/hooks/data/use-lesson-material';
import { watchedMilestones } from '#/lib/course-milestones';
import type { VideoFetchState } from '../types';
import { computePlayerOverlay } from './compute-player-overlay';
import { videoReachedEndAtomFamily } from './lesson-player-atoms';

type LessonPlayerContainerProps = {
  videoState: Extract<VideoFetchState, { status: 'ready' }>;
  lessonSlug: string;
  videoId: string;
};

export const LessonPlayerContainer = ({
  videoState,
  lessonSlug,
  videoId,
}: LessonPlayerContainerProps) => {
  const playerId = useId();
  useMilestoneReporter(playerId, videoId, lessonSlug);
  const [reachedEnd, setReachedEnd] = useAtom(
    videoReachedEndAtomFamily(videoId),
  );
  // Live playback state, so the end-of-video overlay comes off the moment the
  // student resumes or seeks back — see computePlayerOverlay.
  //
  // This re-renders on every `timeupdate` (~4Hz), which is deliberate rather
  // than overlooked: VideoPlayerContainer already reads the same atom and
  // re-renders at that rate, and an overlay is only ever mounted while the
  // video is paused at the end, when no timeupdate fires at all. So the extra
  // renders paint a null overlay and nothing else. A selectAtom projection
  // would trade that for a second copy of the at-the-end rule living apart
  // from computePlayerOverlay, which is the drift this feature keeps paying for.
  const playerState = useAtomValue(videoPlayerStateAtomFamily(playerId));
  const setActiveTab = useSetAtom(activeTabAtom);
  const isGenerating = useIsGenerating();
  const currentTest = useCurrentTest();
  const generateTest = useGenerateTest();
  const { data } = useLessonMaterial(lessonSlug);
  const material = data && !data.locked ? data.material : null;
  // Task 11 routes 'lesson'/'module' locks to a page-level gate that never
  // mounts this container, so 'video' is the only reason this component
  // should ever see in practice. Narrowing explicitly — instead of
  // collapsing every lock reason to a boolean — means a future change to
  // that upstream routing fails loudly here rather than silently showing
  // CoverageNotice's "watch the parts you skipped" copy for a lesson/module
  // lock it doesn't describe.
  const materialLocked = data?.locked === true && data.reason === 'video';
  const progress = useVideoProgress(videoId);
  const hit = progress.data?.milestonesHit.filter((m) => m !== 100).length ?? 0;

  const onEnded = useCallback(() => {
    setReachedEnd(true);
  }, [setReachedEnd]);

  const onDebrief = useCallback(async () => {
    if (!material?.keyPoints?.length || !material?.text) return;
    const test = await generateTest(
      lessonSlug,
      material.keyPoints,
      material.text,
    );
    if (test) {
      setActiveTab('quiz');
      queueMicrotask(() => {
        lessonMaterialRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      });
    }
  }, [generateTest, lessonSlug, material, setActiveTab]);

  const overlayKind = computePlayerOverlay({
    reachedEnd,
    playback: {
      paused: playerState.paused,
      currentTime: playerState.currentTime,
      duration: playerState.duration,
    },
    materialLocked,
    hasCurrentTest: Boolean(currentTest),
  });

  return (
    <VideoPlayerContainer
      playerId={playerId}
      src={videoState.src}
      kind={videoState.kind}
      poster={videoState.poster}
      tracks={videoState.tracks}
      captionsUnavailable={videoState.captionsUnavailable}
      onSourceExpired={videoState.onRetry}
      onEnded={onEnded}
      overlay={
        <AnimatePresence>
          {overlayKind === 'coverage' ? (
            <CoverageNotice hit={hit} total={watchedMilestones.length} />
          ) : overlayKind === 'debrief' ? (
            <DebriefOverlay loading={isGenerating} onDebrief={onDebrief} />
          ) : null}
        </AnimatePresence>
      }
    />
  );
};
