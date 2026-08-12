import type { PlaybackResult } from '#/lib/video-providers/resolve.server';

/**
 * Whether this lesson's video has a caption track — the transcript the debrief
 * would be generated from (see `resolveDebriefSource`).
 *
 * The playback response already answers this, so availability costs no extra
 * request and no AI call on the page's critical path. Mux videos report
 * `captions: null` on this account, so those lessons correctly offer nothing.
 *
 * Deliberately conservative while playback is still resolving: `undefined`
 * answers false, so the debrief appears once it is known to work rather than
 * flickering in and back out.
 */
export function playbackHasCaptions(
  video: PlaybackResult | undefined,
): boolean {
  if (video?.status !== 'ready') return false;
  return video.captions !== null;
}

export type TranscriptDebriefArgs = {
  /** `lessons.has_debrief` — the admin's switch, authoritative as everywhere else. */
  hasDebrief: boolean;
  /** See `playbackHasCaptions`. */
  hasCaptions: boolean;
};

/**
 * Whether a lesson with no material row can still offer a debrief.
 *
 * Kept as a named function rather than an inline `&&` because two surfaces have
 * to agree on the answer — the post-video overlay's button and the debrief
 * section below the player. When they disagreed previously the button appeared
 * and generated nothing.
 */
export function canDebriefFromTranscript({
  hasDebrief,
  hasCaptions,
}: TranscriptDebriefArgs): boolean {
  return hasDebrief && hasCaptions;
}
