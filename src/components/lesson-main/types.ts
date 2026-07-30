import type { ComponentPropsWithoutRef } from 'react';
import type { LockedMaterialResponse } from '#/lib/lesson-gating';

export type TrackProps = ComponentPropsWithoutRef<'track'>;

export type VideoFetchState =
  | { status: 'fetching' }
  | { status: 'rendering' }
  | { status: 'error'; message: string; onRetry: () => void }
  | { status: 'ready'; src: string; poster?: string; tracks: TrackProps[] };

export type LessonMainState =
  | { kind: 'course-loading' }
  | { kind: 'course-error'; message: string; onRetry: () => void }
  | { kind: 'not-found'; lessonSlug: string }
  | { kind: 'no-video'; lessonName: string }
  | {
      kind: 'locked';
      lessonName: string;
      courseSlug: string;
      lock: Extract<LockedMaterialResponse, { reason: 'lesson' | 'module' }>;
    }
  | {
      kind: 'ready';
      lessonName: string;
      lessonSlug: string;
      courseSlug: string;
      videoId: string;
      videoState: VideoFetchState;
    };
