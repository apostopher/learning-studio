import type { ComponentPropsWithoutRef } from 'react';
import type { LockedMaterialResponse } from '#/lib/lesson-gating';

export type TrackProps = ComponentPropsWithoutRef<'track'>;

export type VideoFetchState =
  | { status: 'fetching' }
  | { status: 'rendering' }
  | { status: 'error'; message: string; onRetry: () => void }
  | {
      status: 'ready';
      src: string;
      /** How `src` must be played — threaded through to `VideoPlayer`/`VideoPlayerContainer`'s `kind` prop. */
      kind: 'hls' | 'file';
      poster?: string;
      tracks: TrackProps[];
      /** True when the provider has no caption track at all for this video (e.g. Mux). */
      captionsUnavailable: boolean;
      /**
       * Re-resolves this video's playback (fetches a fresh signed URL/token
       * from the server). Both providers' URLs are signed and expire —
       * Synthesia via an `Expires` query param, Mux via a 1-hour JWT — and
       * hls.js only discovers that mid-playback, on the next segment fetch,
       * not at load time. `VideoPlayerContainer` calls this the moment
       * `attachMedia`'s HLS error handler reports a fatal 401/403 (see
       * `attach-media.ts`), and offers it again from the error UI's manual
       * Retry action. Never called from a timer or from `expiresInSeconds`:
       * that number is relative to when the server resolved playback, not to
       * now, and a cached response can under-report the remaining time — the
       * only trustworthy trigger is the observed failure itself.
       */
      onRetry: () => void;
    };

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
  /**
   * Carries the slugs and `hasDebrief` because this branch now renders the
   * material panel too. It used to render nothing but a card, which meant a
   * lesson without a video had no tabs, no key points and no way to reach a
   * debrief — the lesson was literally unreadable.
   */
  | {
      kind: 'no-video';
      lessonName: string;
      lessonSlug: string;
      courseSlug: string;
      hasDebrief: boolean;
      /**
       * `needsVideoWatch` — the admin's own statement that a video belongs
       * here, and so the only honest way to tell "still being built" apart
       * from "reading-only by design".
       */
      videoExpected: boolean;
    }
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
      /** Gates the post-video debrief overlay — see computePlayerOverlay. */
      hasDebrief: boolean;
      videoState: VideoFetchState;
    };
