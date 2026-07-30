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
  /**
   * The material query failed, so the lock state is unknown. Distinct from
   * 'course-error' because it is the material query that must be retried, and
   * because the copy has to name the right thing. Never falls through to
   * 'ready': the material response is the only page-level lock signal, and
   * rendering the player plus an empty material area is the silent failure the
   * governing UX principle forbids.
   */
  | { kind: 'material-error'; message: string; onRetry: () => void }
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
