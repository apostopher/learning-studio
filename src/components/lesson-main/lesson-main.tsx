import type { RefObject } from 'react';
import { LessonMaterialWrapper } from '#/components/lesson-material';
import { VideoPlayer } from '#/components/video-player';
import { LessonError } from './parts/lesson-error';
import { LessonNoVideo } from './parts/lesson-no-video';
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
  videoId: string,
) => {
  if (videoState.status === 'ready') {
    return (
      <LessonPlayerContainer
        videoState={videoState}
        lessonSlug={lessonSlug}
        videoId={videoId}
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

const renderLessonMaterialSlot = (lessonSlug: string) => (
  <LessonMaterialWrapper lessonSlug={lessonSlug} />
);

const renderArticleBody = (state: LessonMainState) => {
  switch (state.kind) {
    case 'course-error':
      return <LessonError message={state.message} onRetry={state.onRetry} />;
    case 'not-found':
      return <LessonNotFound lessonSlug={state.lessonSlug} />;
    case 'no-video':
      return <LessonNoVideo lessonName={state.lessonName} />;
    case 'ready':
      return (
        <>
          <div className="lesson-player">
            {renderPlayerSlot(state.videoState, state.lessonSlug, state.videoId)}
          </div>
          {renderLessonMaterialSlot(state.lessonSlug)}
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

export const LessonMain = ({ state }: LessonMainProps) => {
  if (state.kind === 'course-loading') {
    return <LessonSkeleton />;
  }

  return (
    <article
      className="lesson-main"
      aria-busy={isVideoInFlight(state) ? true : undefined}
    >
      {renderArticleBody(state)}
    </article>
  );
};
