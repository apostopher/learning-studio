import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { canOfferDebrief, type DebriefOfferArgs } from '#/lib/debrief-offer';
import type { LessonRef } from '#/lib/lesson-ref';
import { saveJson } from './save-json';

/**
 * Ask the server to start generating this lesson's debrief now, so it is ready
 * the moment it opens (24h after the lesson is done).
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

/**
 * `hasDebrief`, `materialText` and `transcriptUsable` feed the shared
 * `canOfferDebrief` rule — the same one the Debrief tab and the
 * transcript-only section ask — so a debrief is never prepared that the
 * panel will not offer.
 */
export type ShouldPrepareDebriefArgs = DebriefOfferArgs & {
  /** True once the video is actually playing, not merely mounted. */
  playing: boolean;
  readOnly: boolean;
  /** This lesson was already asked for during this component's life. */
  alreadyRequested: boolean;
};

/**
 * Whether to fire the prepare request — the whole decision behind
 * usePrepareDebriefOnPlay, extracted so it can be tested without rendering a
 * hook (see nextLastViewedWrite for the same split).
 *
 * No gate on the material being locked any more: the debrief opens 24h after
 * the lesson is done, not when the video unlocks the material, and the server
 * prepares in every state short of passed. A repeat is a server-side no-op
 * (a stored test built from the current source is kept).
 */
export function shouldPrepareDebrief({
  playing,
  hasDebrief,
  materialText,
  transcriptUsable,
  readOnly,
  alreadyRequested,
}: ShouldPrepareDebriefArgs): boolean {
  return (
    playing &&
    canOfferDebrief({ hasDebrief, materialText, transcriptUsable }) &&
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
  materialText,
  transcriptUsable,
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
      materialText,
      transcriptUsable,
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
    materialText,
    transcriptUsable,
    readOnly,
    mutate,
  ]);
}

export type ShouldPrepareDebriefOnVisitArgs = Omit<
  ShouldPrepareDebriefArgs,
  'playing'
>;

/**
 * Whether to fire the prepare request for a lesson with NO video, on first
 * visit — the spec's rule for those lessons, which never mount the player and
 * so never reach prepare-on-play. The same decision as `shouldPrepareDebrief`
 * with the visit standing in for the first play.
 */
export function shouldPrepareDebriefOnVisit(
  args: ShouldPrepareDebriefOnVisitArgs,
): boolean {
  return shouldPrepareDebrief({ ...args, playing: true });
}

/**
 * Fire the prepare request once per lesson, on first visit to a lesson with no
 * video. Only `LessonNoVideoContainer` calls this: lessons with a video
 * prepare on play instead. Same request as prepare-on-play, so the server's
 * 204 refusals (passed, out-of-tier, no debrief) apply unchanged.
 */
export function usePrepareDebriefOnVisit({
  courseSlug,
  lessonSlug,
  hasDebrief,
  materialText,
  transcriptUsable,
  readOnly,
}: LessonRef & Omit<ShouldPrepareDebriefOnVisitArgs, 'alreadyRequested'>) {
  const { mutate } = usePrepareDebrief();
  // A ref, not an atom: it gates a side effect, nothing renders from it.
  const requestedRef = useRef<string | null>(null);

  useEffect(() => {
    const requestKey = `${courseSlug}/${lessonSlug}`;
    const fire = shouldPrepareDebriefOnVisit({
      hasDebrief,
      materialText,
      transcriptUsable,
      readOnly,
      alreadyRequested: requestedRef.current === requestKey,
    });
    if (!fire) return;
    requestedRef.current = requestKey;
    mutate({ courseSlug, lessonSlug });
  }, [
    courseSlug,
    lessonSlug,
    hasDebrief,
    materialText,
    transcriptUsable,
    readOnly,
    mutate,
  ]);
}
