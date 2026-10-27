import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { AnimatePresence } from 'motion/react';
import { useCallback, useId } from 'react';
import { videoLanguageAtom } from '#/atoms/video-language';
import { canDebriefFromTranscript } from '#/components/lesson-material/compute-transcript-debrief';
import { VideoPlayerContainer } from '#/components/video-player';
import { videoPlayerStateAtomFamily } from '#/components/video-player/atoms';
import { CoverageNotice } from '#/components/video-player/parts/coverage-notice';
import { useMilestoneReporter } from '#/components/video-player/use-milestone-reporter';
import { usePrepareDebriefOnPlay } from '#/data-hooks/use-prepare-debrief';
import { useVideoProgress } from '#/data-hooks/use-video-progress';
import { useLessonMaterial } from '#/hooks/data/use-lesson-material';
import { watchedMilestones } from '#/lib/course-milestones';
import { isMaterialReadOnly } from '#/lib/lesson-gating';
import { badgeForLang, isVideoLang, labelForLang } from '#/lib/video-languages';
import type { VideoFetchState } from '../types';
import { computePlayerOverlay } from './compute-player-overlay';
import { videoReachedEndAtomFamily } from './lesson-player-atoms';

type LessonPlayerContainerProps = {
  videoState: Extract<VideoFetchState, { status: 'ready' }>;
  courseSlug: string;
  lessonSlug: string;
  /** `lessons.has_debrief` — decides whether the debrief is prepared on first play. */
  hasDebrief: boolean;
};

export const LessonPlayerContainer = ({
  videoState,
  courseSlug,
  lessonSlug,
  hasDebrief,
}: LessonPlayerContainerProps) => {
  const playerId = useId();
  // The lesson as the route names it — the material query and every write
  // below are per course (see `LessonRef`).
  const lesson = { courseSlug, lessonSlug };
  // Read once, up front: both the milestone-reporter guard below and the
  // material/materialLocked derivations further down come off this same
  // cached query, and readOnly has to be known before useMilestoneReporter is
  // called.
  const { data } = useLessonMaterial(lesson);
  const readOnly = isMaterialReadOnly(data);
  useMilestoneReporter(playerId, lesson, readOnly);
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
  const setVideoLanguage = useSetAtom(videoLanguageAtom);
  const languageOptions = videoState.languages.map((code) => ({
    code,
    badge: badgeForLang(code),
    label: labelForLang(code),
  }));
  const onLanguageChange = useCallback(
    (code: string) => {
      // Re-choosing the playing language is a no-op: the container already
      // skips its restore point for it, and the atom must not be rewritten
      // with the same value either.
      if (!isVideoLang(code) || code === videoState.lang) return;
      setVideoLanguage(code);
    },
    [setVideoLanguage, videoState.lang],
  );
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

  // A source the server can actually resolve: the authored material's body
  // text, or — on a lesson with no material at all — this video's caption
  // transcript. Without one there is nothing to prepare.
  const canDebrief =
    Boolean(material?.text) ||
    canDebriefFromTranscript({
      hasDebrief,
      // Already resolved into this component's own props — the same
      // `captions === null` the material panel reads off the query.
      hasCaptions: !videoState.captionsUnavailable,
    });

  // viper7 starts writing the debrief as soon as the video plays, so it is
  // ready the moment the debrief opens (24h after the lesson is done) rather
  // than generating while the pilot waits on Start.
  usePrepareDebriefOnPlay({
    courseSlug,
    lessonSlug,
    playing: !playerState.paused,
    hasDebrief,
    canDebrief,
    readOnly,
  });

  const overlayKind = computePlayerOverlay({
    reachedEnd,
    playback: {
      paused: playerState.paused,
      currentTime: playerState.currentTime,
      duration: playerState.duration,
    },
    materialLocked,
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
      captions={videoState.captions}
      captionsUnavailable={videoState.captionsUnavailable}
      onSourceExpired={videoState.onRetry}
      onEnded={onEnded}
      languages={languageOptions}
      activeLanguage={videoState.lang}
      onLanguageChange={onLanguageChange}
      overlay={
        <AnimatePresence>
          {/* Not on an archive view: the coverage notice nudges toward
              finishing a lesson that is already done. */}
          {!readOnly && overlayKind === 'coverage' ? (
            <CoverageNotice hit={hit} total={watchedMilestones.length} />
          ) : null}
        </AnimatePresence>
      }
    />
  );
};
