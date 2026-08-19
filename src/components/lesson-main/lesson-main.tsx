import { AnimatePresence, motion } from 'motion/react';
import type { RefObject } from 'react';
import { LessonMaterialWrapper } from '#/components/lesson-material';
import { VideoPlayer } from '#/components/video-player';
import { LessonError } from './parts/lesson-error';
import { LessonLocked } from './parts/lesson-locked';
import { LessonNoVideoContainer } from './parts/lesson-no-video-container';
import { LessonNotFound } from './parts/lesson-not-found';
import { LessonPlayerContainer } from './parts/lesson-player-container';
import { LessonSkeleton } from './parts/lesson-skeleton';
import type { LessonMainState, VideoFetchState } from './types';

const NULL_VIDEO_REF: RefObject<HTMLVideoElement | null> = { current: null };

type LessonMainProps = {
  state: LessonMainState;
};

const renderPlayerSlot = (
  videoState: VideoFetchState,
  lessonSlug: string,
  hasDebrief: boolean,
) => {
  if (videoState.status === 'ready') {
    return (
      <LessonPlayerContainer
        videoState={videoState}
        lessonSlug={lessonSlug}
        hasDebrief={hasDebrief}
      />
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
    case 'not-found':
      return <LessonNotFound lessonSlug={state.lessonSlug} />;
    // The card AND the material panel. This branch used to render only the
    // card, so a lesson without a video had no tabs, no key points and no
    // debrief — its entire content was unreachable.
    case 'no-video':
      return (
        <>
          <div className="lesson-player">
            <LessonNoVideoContainer
              lessonName={state.lessonName}
              lessonSlug={state.lessonSlug}
              hasDebrief={state.hasDebrief}
              videoExpected={state.videoExpected}
            />
          </div>
          {renderLessonMaterialSlot(state.lessonSlug, state.courseSlug)}
        </>
      );
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
            {renderPlayerSlot(
              state.videoState,
              state.lessonSlug,
              state.hasDebrief,
            )}
          </div>
          {renderLessonMaterialSlot(state.lessonSlug, state.courseSlug)}
        </>
      );
    // An archive view: the pilot completed this at an earlier level. The
    // banner is announced (role="status") for the same reason LessonLocked's
    // is — this content differs from what a normal client-side navigation
    // would otherwise imply, and nothing else on the page says so.
    case 'read-only':
      return (
        <>
          {/* biome-ignore lint/a11y/useSemanticElements: role=status is the live-region semantic; <output> would carry irrelevant form-control semantics */}
          <p
            role="status"
            className="rounded-lg border border-gray-6 bg-gray-2 px-4 py-3 text-sm text-secondary"
          >
            You completed this lesson at an earlier level. It&rsquo;s here for
            reference &mdash; nothing you do is recorded.
          </p>
          <div className="lesson-player">
            {state.videoState ? (
              renderPlayerSlot(
                state.videoState,
                state.lessonSlug,
                state.hasDebrief,
              )
            ) : (
              <LessonNoVideoContainer
                lessonName={state.lessonName}
                lessonSlug={state.lessonSlug}
                hasDebrief={state.hasDebrief}
                videoExpected={state.videoExpected}
              />
            )}
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

const isVideoInFlight = (state: LessonMainState): boolean => {
  const videoState =
    state.kind === 'ready' || state.kind === 'read-only'
      ? state.videoState
      : null;
  return (
    videoState?.status === 'fetching' || videoState?.status === 'rendering'
  );
};

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
