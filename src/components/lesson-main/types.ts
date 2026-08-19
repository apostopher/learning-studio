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
  /*
   * There is deliberately no 'material-error' state. A lesson is allowed to
   * have no material at all, and a material query that fails must not take the
   * video down with it — /api/lesson/playback enforces the same gate
   * server-side, and the material panel reports its own failure with its own
   * retry. See computeLessonMainState.
   */
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
    }
  /**
   * The pilot completed this lesson at an earlier level; it now sits outside
   * their current tier. Content is served — video and material alike — but
   * nothing done here is recorded (see isMaterialReadOnly and the write-side
   * guards in LessonPlayerContainer / LessonMaterialWrapper / the quiz and
   * debrief containers).
   *
   * A distinct axis from 'no-video', not a specialisation of it: a read-only
   * lesson can carry a video or not, so `videoState` is nullable here the
   * same way 'no-video' has none at all.
   */
  | {
      kind: 'read-only';
      lessonName: string;
      lessonSlug: string;
      courseSlug: string;
      hasDebrief: boolean;
      videoState: VideoFetchState | null;
      /** `needsVideoWatch` — only meaningful when `videoState` is null. */
      videoExpected: boolean;
    };
