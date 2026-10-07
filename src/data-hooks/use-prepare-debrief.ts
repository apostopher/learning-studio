import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import type { LessonRef } from '#/lib/lesson-ref';
import { saveJson } from './save-json';

/**
 * Ask the server to start generating this lesson's debrief now, so it is ready
 * when the video unlocks it.
 *
 * Fire-and-forget like useRecordLastViewed: generation takes a while, the
 * response carries nothing, and it should outlive the learner navigating on.
 * A dropped request costs nothing but the head start — Start still generates
 * on demand.
 */
export function usePrepareDebrief() {
  return useMutation({
    mutationFn: (input: LessonRef) =>
      saveJson({
        url: '/api/lesson/ai-test/prepare',
        method: 'POST',
        body: input,
        fireAndForget: true,
      }),
  });
}

export type ShouldPrepareDebriefArgs = {
  /** True once the video is actually playing, not merely mounted. */
  playing: boolean;
  /** `lessons.has_debrief` — off means tab 2 is the authored quiz. */
  hasDebrief: boolean;
  /** Whether a debrief can be generated at all for this lesson. */
  canDebrief: boolean;
  /** The material is still waiting on this video — the window prep is for. */
  materialLocked: boolean;
  readOnly: boolean;
  /** This lesson was already asked for during this component's life. */
  alreadyRequested: boolean;
};

/**
 * Whether to fire the prepare request — the whole decision behind
 * usePrepareDebriefOnPlay, extracted so it can be tested without rendering a
 * hook (see nextLastViewedWrite for the same split).
 *
 * `materialLocked` mirrors the server's own rule: once the video is watched
 * Start is available, and preparing then would only spend a model run on a
 * rewatch. The server enforces this too; checking here saves the request.
 */
export function shouldPrepareDebrief({
  playing,
  hasDebrief,
  canDebrief,
  materialLocked,
  readOnly,
  alreadyRequested,
}: ShouldPrepareDebriefArgs): boolean {
  return (
    playing &&
    hasDebrief &&
    canDebrief &&
    materialLocked &&
    !readOnly &&
    !alreadyRequested
  );
}

/**
 * Fire the prepare request once per lesson, the first time its video plays.
 */
export function usePrepareDebriefOnPlay({
  courseSlug,
  lessonSlug,
  playing,
  hasDebrief,
  canDebrief,
  materialLocked,
  readOnly,
}: LessonRef & Omit<ShouldPrepareDebriefArgs, 'alreadyRequested'>) {
  const { mutate } = usePrepareDebrief();
  // A ref, not an atom: it gates a side effect, nothing renders from it.
  const requestedRef = useRef<string | null>(null);

  useEffect(() => {
    const requestKey = `${courseSlug}/${lessonSlug}`;
    const fire = shouldPrepareDebrief({
      playing,
      hasDebrief,
      canDebrief,
      materialLocked,
      readOnly,
      alreadyRequested: requestedRef.current === requestKey,
    });
    if (!fire) return;
    requestedRef.current = requestKey;
    mutate({ courseSlug, lessonSlug });
  }, [
    courseSlug,
    lessonSlug,
    playing,
    hasDebrief,
    canDebrief,
    materialLocked,
    readOnly,
    mutate,
  ]);
}
