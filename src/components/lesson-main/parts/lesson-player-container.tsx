import { atom, useAtom, useSetAtom } from 'jotai';
import { AnimatePresence } from 'motion/react';
import { useCallback, useId } from 'react';
import { activeTabAtom, lessonMaterialRef } from '#/atoms/lesson-ai-test';
import { VideoPlayerContainer } from '#/components/video-player';
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

const videoEndedAtom = atom(false);

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
  const [videoEnded, setVideoEnded] = useAtom(videoEndedAtom);
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
    setVideoEnded(true);
  }, [setVideoEnded]);

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
    videoEnded,
    materialLocked,
    hasCurrentTest: Boolean(currentTest),
  });

  return (
    <VideoPlayerContainer
      playerId={playerId}
      src={videoState.src}
      poster={videoState.poster}
      tracks={videoState.tracks}
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
