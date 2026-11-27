import type { SeatPlan } from '#/types';

/**
 * How much of a paid lesson's video a free seat plays (user, 2026-11-28).
 */
export const VIDEO_PREVIEW_SECONDS = 15;

/**
 * The seconds of this lesson's video the learner may play, or null for all of
 * it.
 *
 * Capped only when the lesson is paid (requires any subscription) AND the
 * learner's seats on the course are all free. Someone with no seat at all is
 * not capped here: they are refused the course outright upstream, and an
 * author previewing their own course never reaches this.
 */
export function videoPreviewSeconds(
  lesson: { requiredSubscriptions: readonly string[] },
  plan: SeatPlan | null,
): number | null {
  return plan === 'free' && lesson.requiredSubscriptions.length > 0
    ? VIDEO_PREVIEW_SECONDS
    : null;
}
