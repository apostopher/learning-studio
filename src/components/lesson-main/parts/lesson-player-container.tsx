import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { AnimatePresence } from 'motion/react';
import { useCallback, useId } from 'react';
import { activeTabAtom, lessonMaterialRef } from '#/atoms/lesson-ai-test';
import { canDebriefFromTranscript } from '#/components/lesson-material/compute-transcript-debrief';
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
import { isMaterialReadOnly } from '#/lib/lesson-gating';
import type { VideoFetchState } from '../types';
import { computePlayerOverlay } from './compute-player-overlay';
import { videoReachedEndAtomFamily } from './lesson-player-atoms';

type LessonPlayerContainerProps = {
  videoState: Extract<VideoFetchState, { status: 'ready' }>;
  lessonSlug: string;
  /** `lessons.has_debrief` — with it off, tab 2 is the authored quiz. */
  hasDebrief: boolean;
};

export const LessonPlayerContainer = ({
  videoState,
  lessonSlug,
  hasDebrief,
}: LessonPlayerContainerProps) => {
  const playerId = useId();
  // Read once, up front: both the milestone-reporter guard below and the
  // material/materialLocked derivations further down come off this same
  // cached query, and readOnly has to be known before useMilestoneReporter is
  // called.
  const { data } = useLessonMaterial(lessonSlug);
  const readOnly = isMaterialReadOnly(data);
  useMilestoneReporter(playerId, lessonSlug, readOnly);
  const [reachedEnd, setReachedEnd] = useAtom(
    videoReachedEndAtomFamily(lessonSlug),
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
  const material = data && !data.locked ? data.material : null;
  // Task 11 routes 'lesson'/'module' locks to a page-level gate that never
  // mounts this container, so 'video' is the only reason this component
  // should ever see in practice. Narrowing explicitly — instead of
  // collapsing every lock reason to a boolean — means a future change to
  // that upstream routing fails loudly here rather than silently showing
  // CoverageNotice's "watch the parts you skipped" copy for a lesson/module
  // lock it doesn't describe.
  const materialLocked = data?.locked === true && data.reason === 'video';
  const progress = useVideoProgress(lessonSlug);
  const hit = progress.data?.milestonesHit.filter((m) => m !== 100).length ?? 0;

  const onEnded = useCallback(() => {
    setReachedEnd(true);
  }, [setReachedEnd]);

  const onDebrief = useCallback(async () => {
    // Read-only guard first: this generates NEW debrief content, which
    // read-only forbids the same as evaluating or saving one.
    if (readOnly) return;
    // No guard on the material's contents any more: the server resolves what
    // the debrief is generated from (material, else the video transcript), and
    // `canDebrief` below already decides whether to offer the button at all.
    const test = await generateTest(lessonSlug);
    if (test) {
      setActiveTab('quiz');
      queueMicrotask(() => {
        lessonMaterialRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      });
    }
  }, [generateTest, lessonSlug, readOnly, setActiveTab]);

  const overlayKind = computePlayerOverlay({
    reachedEnd,
    playback: {
      paused: playerState.paused,
      currentTime: playerState.currentTime,
      duration: playerState.duration,
    },
    materialLocked,
    hasCurrentTest: Boolean(currentTest),
    hasDebrief,
    // A source the server can actually resolve: the authored material's body
    // text, or — on a lesson with no material at all — this video's caption
    // transcript. Without one, the button would generate nothing.
    canDebrief:
      Boolean(material?.text) ||
      canDebriefFromTranscript({
        hasDebrief,
        // Already resolved into this component's own props — the same
        // `captions === null` the material panel reads off the query.
        hasCaptions: !videoState.captionsUnavailable,
      }),
  });

  return (
    <VideoPlayerContainer
      // Forces a genuine remount per lesson. Without this, TanStack Router
      // reuses this component across param changes (there is no other
      // identity change here — `playerId` is a fresh `useId()` per mount, not
      // per lesson), so `VideoPlayerContainer`'s internal refs
      // (`recoveryAttemptsRef`, `pendingRestoreTimeRef`) survive a lesson
      // navigation: the automatic-recovery budget leaks across lessons (two
      // recoveries anywhere in a session exhausts it for every lesson after),
      // and a pending seek-restore can carry a previous lesson's playhead
      // into a newly opened one.
      key={lessonSlug}
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
          {/* Neither overlay makes sense on an archive view: 'coverage' nudges
              toward finishing a lesson that is already done, and 'debrief'
              would generate new content that read-only forbids saving. */}
          {readOnly ? null : overlayKind === 'coverage' ? (
            <CoverageNotice hit={hit} total={watchedMilestones.length} />
          ) : overlayKind === 'debrief' ? (
            <DebriefOverlay loading={isGenerating} onDebrief={onDebrief} />
          ) : null}
        </AnimatePresence>
      }
    />
  );
};
