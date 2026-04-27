import type { RefObject } from 'react';
import { VideoPlayer, VideoPlayerContainer } from '#/components/video-player';
import { LessonError } from './parts/lesson-error';
import { LessonNoVideo } from './parts/lesson-no-video';
import { LessonNotFound } from './parts/lesson-not-found';
import { LessonSkeleton } from './parts/lesson-skeleton';
import { LessonTitle } from './parts/lesson-title';
import type { LessonMainState, VideoFetchState } from './types';

const NULL_VIDEO_REF: RefObject<HTMLVideoElement | null> = { current: null };

type LessonMainProps = {
  state: LessonMainState;
};

const renderPlayerSlot = (videoState: VideoFetchState) => {
  if (videoState.status === 'ready') {
    return (
      <VideoPlayerContainer
        src={videoState.src}
        poster={videoState.poster}
        tracks={videoState.tracks}
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

export const LessonMain = ({ state }: LessonMainProps) => {
  if (state.kind === 'course-loading') {
    return <LessonSkeleton />;
  }

  return (
    <article className="lesson-main">
      {state.kind === 'course-error' ? (
        <LessonError message={state.message} onRetry={state.onRetry} />
      ) : null}
      {state.kind === 'not-found' ? (
        <LessonNotFound lessonSlug={state.lessonSlug} />
      ) : null}
      {state.kind === 'no-video' ? (
        <>
          <LessonTitle name={state.lessonName} />
          <LessonNoVideo lessonName={state.lessonName} />
        </>
      ) : null}
      {state.kind === 'ready' ? (
        <>
          <LessonTitle name={state.lessonName} />
          <div className="lesson-player">
            {renderPlayerSlot(state.videoState)}
          </div>
        </>
      ) : null}
    </article>
  );
};
