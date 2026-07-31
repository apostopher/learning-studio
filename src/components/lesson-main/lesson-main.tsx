import { AnimatePresence, motion } from 'motion/react';
import type { RefObject } from 'react';
import { LessonMaterialWrapper } from '#/components/lesson-material';
import { VideoPlayer } from '#/components/video-player';
import { LessonError } from './parts/lesson-error';
import { LessonLocked } from './parts/lesson-locked';
import { LessonNoVideo } from './parts/lesson-no-video';
import { LessonNotFound } from './parts/lesson-not-found';
import { LessonPlayerContainer } from './parts/lesson-player-container';
import { LessonSkeleton } from './parts/lesson-skeleton';
import type { LessonMainState, VideoFetchState } from './types';

const NULL_VIDEO_REF: RefObject<HTMLVideoElement | null> = { current: null };

type LessonMainProps = {
  state: LessonMainState;
};

const renderPlayerSlot = (videoState: VideoFetchState, lessonSlug: string) => {
  if (videoState.status === 'ready') {
    return (
      <LessonPlayerContainer videoState={videoState} lessonSlug={lessonSlug} />
    );
  }
  if (videoState.status === 'fetching' || videoState.status === 'rendering') {
    const label =
      videoState.status === 'rendering' ? 'Preparing video' : 'Loading';
    return (
      <VideoPlayer
        src=""
        videoRef={NULL_VIDEO_REF}
        state={{
          status: 'loading',
          controlsVisible: false,
          hasPlayedOnce: true,
        }}
        labels={{ loading: label, buffering: label }}
      />
    );
  }
  return (
    <VideoPlayer
      src=""
      videoRef={NULL_VIDEO_REF}
      state={{
        status: 'error',
        error: videoState.message,
        controlsVisible: false,
        hasPlayedOnce: true,
      }}
      actions={{ onRetry: videoState.onRetry }}
    />
  );
};

const renderLessonMaterialSlot = (lessonSlug: string, courseSlug: string) => (
  <LessonMaterialWrapper lessonSlug={lessonSlug} courseSlug={courseSlug} />
);

const renderArticleBody = (state: LessonMainState) => {
  switch (state.kind) {
    case 'course-error':
      return <LessonError message={state.message} onRetry={state.onRetry} />;
    case 'material-error':
      // No player either: the material response is the only page-level lock
      // signal, so with it unresolved we cannot claim the lesson is open.
      return (
        <LessonError
          message={state.message}
          onRetry={state.onRetry}
          subject="this lesson"
        />
      );
    case 'not-found':
      return <LessonNotFound lessonSlug={state.lessonSlug} />;
    case 'no-video':
      return <LessonNoVideo lessonName={state.lessonName} />;
    case 'locked':
      return (
        <LessonLocked
          lessonName={state.lessonName}
          courseSlug={state.courseSlug}
          lock={state.lock}
        />
      );
    case 'ready':
      return (
        <>
          <div className="lesson-player">
            {renderPlayerSlot(state.videoState, state.lessonSlug)}
          </div>
          {renderLessonMaterialSlot(state.lessonSlug, state.courseSlug)}
        </>
      );
    case 'course-loading': {
      // Handled by the early-return below; included here for switch exhaustiveness.
      return null;
    }
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
};

const isVideoInFlight = (state: LessonMainState): boolean =>
  state.kind === 'ready' &&
  (state.videoState.status === 'fetching' ||
    state.videoState.status === 'rendering');

/**
 * Crossfade rather than a hard cut on the skeleton→content swap. Opacity only,
 * and deliberately brief: this fires at the exact moment the learner has
 * finished waiting, so a slow transition here would spend the time we just
 * saved. mode="popLayout" lets the incoming content start fading in while the
 * skeleton leaves, instead of queueing behind it the way mode="wait" would.
 *
 * Opacity-only motion is already safe under prefers-reduced-motion (no
 * movement to suppress), so no reduced-motion branch is needed.
 */
export const LessonMain = ({ state }: LessonMainProps) => (
  <AnimatePresence mode="popLayout" initial={false}>
    <motion.div
      key={state.kind}
      data-lesson-main-phase={state.kind}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      {state.kind === 'course-loading' ? (
        <LessonSkeleton />
      ) : (
        <article
          className="lesson-main"
          aria-busy={isVideoInFlight(state) ? true : undefined}
        >
          {renderArticleBody(state)}
        </article>
      )}
    </motion.div>
  </AnimatePresence>
);
